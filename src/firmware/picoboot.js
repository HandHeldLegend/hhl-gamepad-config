/**
 * picoboot.js: Flash RP2040/RP2350 controllers from the browser.
 *
 * Ported from hoja2/js/pico_update.js with the protocol logic unchanged; the only change is that
 * progress is reported through onFlashProgress() instead of writing to page elements.
 *
 * Strategy (pico_update_attempt_flash):
 *   1. download .bin (+ verify SHA-256 against the build manifest) and .uf2 in parallel;
 *   2. try PICOBOOT over WebUSB (vendor interface on the BOOTSEL device, or the HOJA bootloader's
 *      update mode): fastest, no file dialogs;
 *   3. fall back to writing the UF2 onto the RPI-RP2 / RP2350 mass-storage drive via the
 *      File System Access folder picker (needs a user click → returned as needsUserAction);
 *   4. last resort: manual UF2 download.
 *
 * Status messages are translated (t); errors that the wizard displays keep English text marked with
 * N_() so updater.js can still match on them and translates them when shown.
 *
 * PICOBOOT protocol reference: Raspberry Pi pico-bootrom (picoboot.h); commands below.
 *
 * The HOJA update mode (boards with the HOJA bootloader) takes the same commands. It never rewrites its
 * own sectors, so an image is written from just past them when it carries the same bootloader, and
 * read back after. An image with another bootloader, or none (an older build), goes through the boot
 * ROM instead: the update mode restarts into it on request.
 */
import { t, N_ } from '../i18n/index.js';
import { fetchableUrl } from './urls.js';
import {
    isPicoBootloader, isHojaUpdateMode, RPI_VENDOR_ID, HOJA_GAMEPAD_PID, BOOT_ROM_PIDS,
} from '../device/hoja-device.js';
import { sleep, withTimeout } from '../util/async.js';

const VID = RPI_VENDOR_ID;
// The boot ROMs, and the HOJA update mode (the HOJA Gamepad PID; told apart by its device version)
const BOOTLOADER_PIDS = [...BOOT_ROM_PIDS, HOJA_GAMEPAD_PID];
const INTERFACE_CLASS = 255; // Vendor-specific interface class

const FLASH_ERASE_CMD = 0x03;
const FLASH_WRITE_CMD = 0x05;
const EXIT_XIP_CMD = 0x06;
const EXCLUSIVE_CMD = 0x01;
const REBOOT_CMD = 0x02;
const REBOOT2_CMD = 0x0a;
const READ_CMD = 0x84;
const MAGIC_NUM = 0x431fd10b;

const FLASH_BASE = 0x10000000;
/** Flash is erased and written a whole sector at a time, and read back at most a sector at a time. */
const FLASH_SECTOR_LEN = 4096;
/** A restart command: how long its OUT transfer and its acknowledgement may take. The device often
 *  restarts before the acknowledgement arrives. */
const RESTART_CMD_TIMEOUT_MS = 3000;
const RESTART_ACK_TIMEOUT_MS = 2000;

// The HOJA update mode (HOJA-LIB-RP2040 boot_layout.h)
const HOJA_BOOT_SIZE = 0x8000;           // The bootloader's own sectors
const HOJA_ROM_BOOTLOADER_CMD = 0x21;    // Restart into the boot ROM's bootloader
const HOJA_ROM_WAIT_MS = 10000;
/** While waiting for the boot ROM's device to appear: look this often. */
const HOJA_ROM_POLL_MS = 250;

let picoDevice;
let interfaceNumber = null;
let endpointOut = null;
let endpointIn = null;
let activeBootloaderIs2350 = false;
let activeBootloaderIsHoja = false;

/** Cached UF2 payload when Picoboot fails and we need a staged folder-picker step */
let cachedUf2ForPicker = null;
let cachedUf2Url = null;

var userToken = 1;
function getUserToken() {
    var ret = userToken;
    userToken += 1;
    userToken %= 0xFFFFFFFF;
    return ret;
}

export function supportsDirectoryPicker() {
    // File System Access API requires a secure context (https or localhost).
    return typeof window.showDirectoryPicker === 'function' && window.isSecureContext === true;
}

function isWindowsHost() {
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes('windows') || ua.includes('win32') || ua.includes('win64') || ua.includes('wow64');
}

function isRp2350Bootloader(device) {
    return device?.vendorId === VID && device?.productId === 0x000f;
}

async function usbTransferOut(endpointNumber, data, timeoutMs = 1500, label = 'USB OUT') {
    if (timeoutMs == null) {
        return picoDevice.transferOut(endpointNumber, data);
    }
    return withTimeout(
        picoDevice.transferOut(endpointNumber, data),
        timeoutMs,
        label
    );
}

async function usbTransferIn(endpointNumber, length, timeoutMs = 1500, label = 'USB IN') {
    if (timeoutMs == null) {
        return picoDevice.transferIn(endpointNumber, length);
    }
    return withTimeout(
        picoDevice.transferIn(endpointNumber, length),
        timeoutMs,
        label
    );
}

/** Progress listener: fn({ percent, message, flashing }). Set by the firmware wizard. */
let progressListener = null;
export function onFlashProgress(fn) {
    progressListener = fn;
}

function updateProgress(percent, isFlashing = false, message = null) {
    percent = Math.max(0, Math.min(100, percent));
    if (!message) {
        message = isFlashing
            ? (percent === 100 ? t('Firmware update complete!') : t('Flashing firmware...'))
            : (percent === 100 ? t('Download complete') : t('Downloading firmware...'));
    }
    if (progressListener) progressListener({ percent, message, flashing: isFlashing });
    else console.log(`[picoboot] ${Math.round(percent)}% ${message}`);
}

export function setUpdateStatus(message, percent = null, isFlashing = false) {
    if (percent == null) {
        if (progressListener) progressListener({ percent: null, message, flashing: isFlashing });
        return;
    }
    updateProgress(percent, isFlashing, message);
}

class PicobootCmd {
    constructor(cmdId, transferLength = 0) {
        this.dMagic = MAGIC_NUM;
        this.dToken = getUserToken();
        this.bCmdId = cmdId;
        this.bCmdSize = 0;
        this._unused = 0;
        this.dTransferLength = transferLength;
        this.args = new ArrayBuffer(16);
    }

    setRebootCmd(dPC, dSP, dDelayMS) {
        const view = new DataView(this.args);
        view.setUint32(0, dPC, true);
        view.setUint32(4, dSP, true);
        view.setUint32(8, dDelayMS, true);
        this.bCmdSize = 12;
    }

    setReboot2Cmd(dFlags, dDelayMS, dParam0, dParam1) {
        const view = new DataView(this.args);
        view.setUint32(0, dFlags, true);
        view.setUint32(4, dDelayMS, true);
        view.setUint32(8, dParam0, true);
        view.setUint32(12, dParam1, true);
        this.bCmdSize = 16;
    }

    setRangeCmd(dAddr, dSize) {
        const view = new DataView(this.args);
        view.setUint32(0, dAddr, true);
        view.setUint32(4, dSize, true);
        this.bCmdSize = 8;
    }

    setExclusiveCmd(bExclusive) {
        const view = new DataView(this.args);
        view.setUint8(0, bExclusive);
        this.bCmdSize = 1;
    }

    toUint8Array() {
        const buffer = new ArrayBuffer(32);
        const view = new DataView(buffer);

        view.setUint32(0, this.dMagic, true);
        view.setUint32(4, this.dToken, true);
        view.setUint8(8, this.bCmdId);
        view.setUint8(9, this.bCmdSize);
        view.setUint16(10, this._unused, true);
        view.setUint32(12, this.dTransferLength, true);

        const argsView = new Uint8Array(this.args);
        new Uint8Array(buffer, 16, 16).set(argsView);

        return new Uint8Array(buffer);
    }
}

function isUserCancelled(error) {
    if (!error) return false;
    const name = error.name || '';
    return name === 'NotFoundError' || name === 'AbortError';
}

function convertUf2ToBinUrl(url) {
    if (!url) return url;
    const match = url.toLowerCase().lastIndexOf('.uf2');
    if (match === -1) return url;
    return url.slice(0, match) + '.bin';
}

function ensureUf2Url(url) {
    if (!url) return url;
    if (url.toLowerCase().endsWith('.uf2')) return url;
    if (url.toLowerCase().endsWith('.bin')) {
        return url.slice(0, -4) + '.uf2';
    }
    return url;
}

async function sha256Hex(buffer) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/** Whether `data` is the image whose SHA-256 (hex, as the build manifest gives it) is `checksum`. */
async function matchesChecksum(data, checksum) {
    return (await sha256Hex(data)).toLowerCase() === checksum.toLowerCase();
}

async function downloadFirmware(url, label = t('Downloading firmware...')) {
    url = fetchableUrl(url);
    updateProgress(10, false, label);
    let response;
    try {
        response = await fetch(url);
    } catch (_) {
        // One retry past any cached response (flaky network, a CDN hiccup right after a release).
        response = await fetch(url, { cache: 'no-store' });
    }
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    updateProgress(40, false, label);
    const data = await response.arrayBuffer();
    if (!data.byteLength) throw new Error('empty file');
    updateProgress(70, false, t('Download complete'));
    return data;
}

/** Short technical reason for a failed download, shown after the failure message. */
function downloadReason(err, url) {
    if (navigator.onLine === false) return t('offline');
    const msg = String(err?.message || err || '');
    if (/^HTTP \d+/.test(msg) || msg === 'empty file') return `${new URL(url).hostname}: ${msg}`;
    // fetch() rejects with a TypeError for DNS, TLS, proxy, firewall or CORS failures.
    return t('{host} unreachable', { host: new URL(url).hostname });
}

/**
 * Optional download cache (factory stations flash many units with the same build). Keyed by the
 * caller's cacheKey (e.g. build id + manifest checksum) and the URL, so a new build is fetched again.
 * Each caller gets its own copy of the bytes.
 */
const firmwareCache = new Map();
async function cachedDownload(url, label, cacheKey) {
    if (!cacheKey) return downloadFirmware(url, label);
    const key = `${cacheKey}|${url}`;
    if (!firmwareCache.has(key)) {
        firmwareCache.set(key, downloadFirmware(url, label).catch((err) => { firmwareCache.delete(key); throw err; }));
    }
    return (await firmwareCache.get(key)).slice(0);
}

/**
 * A build's .bin (the whole board image), checked against the manifest's SHA-256 when there is one. For
 * updates that don't go through a bootloader on USB (Bluetooth). Throws with a short reason.
 */
export async function pico_download_bin(url, checksum = null) {
    const binUrl = convertUf2ToBinUrl(ensureUf2Url(url));
    let data;
    try {
        data = await downloadFirmware(binUrl, t('Downloading firmware...'));
    } catch (err) {
        throw new Error(`${t('Failed to download firmware.')} (${downloadReason(err, fetchableUrl(binUrl))})`);
    }
    if (checksum && !(await matchesChecksum(data, checksum))) {
        throw new Error(t('The downloaded firmware didn’t match its checksum.'));
    }
    return data;
}

/** Download a build's .bin and .uf2 into the cache ahead of time. Resolves true when both are there. */
export async function pico_prefetch_firmware(url, cacheKey) {
    const uf2Url = ensureUf2Url(url);
    const results = await Promise.allSettled([cachedDownload(convertUf2ToBinUrl(uf2Url), '', cacheKey), cachedDownload(uf2Url, '', cacheKey)]);
    return results.every((r) => r.status === 'fulfilled');
}

async function closePicoDevice() {
    if (!picoDevice) return;
    try {
        if (interfaceNumber != null && picoDevice.opened) {
            await picoDevice.releaseInterface(interfaceNumber);
        }
    } catch (_) { /* ignore */ }
    try {
        if (picoDevice.opened) await picoDevice.close();
    } catch (_) { /* ignore */ }
    picoDevice = null;
    interfaceNumber = null;
    endpointOut = null;
    endpointIn = null;
    activeBootloaderIs2350 = false;
    activeBootloaderIsHoja = false;
}

/**
 * Request the Pico bootloader and claim the Picoboot vendor interface.
 * Prefers an already-authorized device from getDevices() so no picker is needed.
 * @param {{ allowRequestDevice?: boolean, uf2Only?: boolean, cacheKey?: string }} [options] uf2Only: don't look
 *        for a .bin (no PICOBOOT write; goes straight to the RPI-RP2 drive picker / manual download).
 *        cacheKey: reuse downloads made with the same key (see pico_prefetch_firmware).
 * @returns {{ ok: true } | { ok: false, canceled: boolean, needsPermission: boolean, claimFailed?: boolean, error?: Error }}
 */
export async function pico_try_claim_bootloader(options = {}) {
    const allowRequestDevice = options.allowRequestDevice !== false;
    const uf2Only = options.uf2Only === true;
    // claimInterface can hang forever on Windows when WinUSB is not bound
    const claimTimeoutMs = options.claimTimeoutMs ?? 2000;
    interfaceNumber = null;
    endpointOut = null;
    endpointIn = null;

    const tryOpenAndClaim = async (device) => {
        // The picker also lists a running HOJA Gamepad (same IDs as the update mode)
        if (!isPicoBootloader(device)) throw new Error('Not a bootloader');
        picoDevice = device;
        activeBootloaderIs2350 = isRp2350Bootloader(picoDevice);
        activeBootloaderIsHoja = isHojaUpdateMode(picoDevice);
        if (!picoDevice.opened) {
            await withTimeout(picoDevice.open(), claimTimeoutMs, 'USB open');
        }
        await withTimeout(findAndClaimInterface(picoDevice), claimTimeoutMs, 'USB claim');
        if (interfaceNumber === null) {
            throw new Error('Vendor interface not found');
        }
        return { ok: true };
    };

    const failClaim = (error, { canceled = false, needsPermission = false } = {}) => ({
        ok: false,
        canceled,
        needsPermission,
        claimFailed: true,
        error,
    });

    // Already-permitted Pico (e.g. after a connect event): no user gesture required
    let hadKnownDevice = false;
    try {
        const existing = await navigator.usb.getDevices();
        const known = existing.find(isPicoBootloader);
        if (known) {
            hadKnownDevice = true;
            try {
                return await tryOpenAndClaim(known);
            } catch (error) {
                console.warn('Could not claim known Pico bootloader:', error);
                await closePicoDevice();
                // Do not pop another USB picker; fall through to UF2
                return failClaim(error, {
                    needsPermission: !allowRequestDevice,
                });
            }
        }
    } catch (error) {
        console.warn('getDevices failed:', error);
    }

    if (!allowRequestDevice) {
        return failClaim(
            new Error('Bootloader present but not claimable without a user gesture'),
            { needsPermission: true }
        );
    }

    // Known device already failed claim: only skip requestDevice on auto-flow (no user gesture)
    if (hadKnownDevice && !allowRequestDevice) {
        return failClaim(new Error('Picoboot interface unavailable'));
    }

    try {
        updateProgress(0, true, t('Select the Pico bootloader in the browser popup...'));
        const device = await navigator.usb.requestDevice({
            filters: BOOTLOADER_PIDS.map((productId) => ({ vendorId: VID, productId })),
        });
        return await tryOpenAndClaim(device);
    } catch (error) {
        console.error('Picoboot claim failed:', error);
        await closePicoDevice();
        return failClaim(error, { canceled: isUserCancelled(error) });
    }
}

/**
 * Write a UF2 image to the RPI-RP2 drive via the File System Access API.
 * Call this only after the UI has shown instructions, because the OS picker covers the page.
 */
function isExpectedUf2EjectError(error) {
    const msg = String(error?.message || error).toLowerCase();
    const name = error?.name || '';
    // After a UF2 write the Pico reboots and unmounts RPI-RP2 mid-close.
    return (
        name === 'AbortError' ||
        name === 'NotFoundError' ||
        name === 'InvalidStateError' ||
        msg.includes('aborted') ||
        msg.includes('security policy') ||
        msg.includes('not found') ||
        msg.includes('no such file') ||
        msg.includes('the requesting window')
    );
}

export async function pico_write_uf2_via_picker(uf2Data) {
    if (!supportsDirectoryPicker()) {
        throw new Error(N_('Folder picker is blocked here. Use https or http://localhost (not a raw IP).'));
    }

    updateProgress(0, true, t('Waiting for folder selection...'));

    let dirHandle;
    try {
        // id: the browser reopens this picker where it was last used (usually the boot drive again).
        dirHandle = await window.showDirectoryPicker({ id: 'hhl-boot-drive', mode: 'readwrite' });
    } catch (error) {
        if (isUserCancelled(error)) throw error;
        const msg = String(error?.message || error);
        if (error?.name === 'SecurityError' || msg.toLowerCase().includes('security policy')) {
            throw new Error(N_('Folder picker blocked by browser security policy. Use https or http://localhost.'));
        }
        throw error;
    }

    // Confirm this looks like a Pico bootloader volume
    try {
        await dirHandle.getFileHandle('INFO_UF2.TXT');
    } catch (_) {
        throw new Error(N_('That isn’t the controller’s drive. Choose the controller’s drive itself (named after the controller, or RPI-RP2 / RP2350), not a folder on your computer.'));
    }

    updateProgress(30, true, t('Writing the UF2 to the drive...'));

    const fileHandle = await dirHandle.getFileHandle('firmware.uf2', { create: true });
    const writable = await fileHandle.createWritable();

    try {
        await writable.write(uf2Data);
    } catch (error) {
        // Write can also abort if the volume ejects very quickly; treat as success.
        if (!isExpectedUf2EjectError(error)) {
            try { await writable.abort(); } catch (_) { /* ignore */ }
            throw error;
        }
        console.warn('UF2 write ended with expected eject error (device likely rebooted):', error);
    }

    try {
        await writable.close();
    } catch (error) {
        // Expected: Pico reboots as soon as the UF2 lands and the drive disappears.
        console.warn('UF2 close after write (expected if device rebooted):', error);
    }

    cachedUf2ForPicker = null;
    cachedUf2Url = null;

    updateProgress(100, true, t('UF2 written. Device should reboot.'));
    return true;
}

/**
 * Complete a previously staged UF2 write (firmware already downloaded).
 */
export async function pico_complete_uf2_picker_flash() {
    if (!cachedUf2ForPicker) {
        throw new Error(N_('No firmware ready. Click Update to prepare the file again.'));
    }
    return pico_write_uf2_via_picker(cachedUf2ForPicker);
}

/** Forget the staged UF2 (the updater calls this when its dialog closes). */
export function pico_clear_cached_uf2() {
    cachedUf2ForPicker = null;
    cachedUf2Url = null;
}

export function pico_has_cached_uf2() {
    return !!cachedUf2ForPicker;
}

export function pico_get_cached_uf2() {
    return cachedUf2ForPicker;
}

export function pico_get_cached_uf2_url() {
    return cachedUf2Url;
}

function stageUf2Picker(uf2Data, uf2Url) {
    cachedUf2ForPicker = uf2Data;
    cachedUf2Url = uf2Url;
    updateProgress(100, false, t('Firmware ready: select the controller’s drive next.'));
    return { needsUserAction: true, reason: 'directory-picker' };
}

/**
 * Flash firmware: try Picoboot/WebUSB first, fall back to UF2 directory picker,
 * then to a manual UF2 download.
 *
 * @param {string} url Firmware URL (.uf2 or .bin)
 * @param {string|null} checksum Optional SHA-256 of the .bin image
 * @param {{ allowRequestDevice?: boolean, uf2Only?: boolean }} [options] uf2Only: don't look for a .bin
 *        (no PICOBOOT write; goes straight to the RPI-RP2 drive picker / manual download).
 * @returns {Promise<boolean|{ needsUserAction: true, reason: string }>}
 */
export async function pico_update_attempt_flash(url, checksum = null, options = {}) {
    // A file staged by an earlier attempt belongs to that attempt (often a different image: the flash
    // nuke before the firmware, or another build). Drop it, so a failed download here can never leave
    // the drive step writing or saving the old bytes under this image's name.
    pico_clear_cached_uf2();
    const allowRequestDevice = options.allowRequestDevice !== false;
    const uf2Only = options.uf2Only === true;
    const uf2Url = ensureUf2Url(url);
    const binUrl = convertUf2ToBinUrl(uf2Url);

    updateProgress(0, false, t('Preparing firmware...'));

    // WebUSB + File System Access require a secure context.
    // If not secure, we can still provide the UF2 download link.
    if (window.isSecureContext !== true) {
        updateProgress(0, false, t('This page is not in a secure context. Falling back to UF2 download.'));
        if (uf2Url) {
            return { needsUserAction: true, reason: 'manual-download', uf2Url };
        }
        return false;
    }

    let binData = null;
    let uf2Data = null;
    let binVerified = false;

    try {
        const [binResult, uf2Result] = await Promise.allSettled([
            // uf2Only: images with no .bin twin (the flash nuke runs from RAM) skip PICOBOOT entirely.
            uf2Only ? Promise.reject(new Error('UF2-only image')) : cachedDownload(binUrl, t('Downloading firmware...'), options.cacheKey),
            cachedDownload(uf2Url, t('Downloading firmware...'), options.cacheKey),
        ]);

        if (binResult.status === 'fulfilled') {
            binData = binResult.value;
            if (checksum) {
                updateProgress(85, false, t('Verifying firmware...'));
                binVerified = await matchesChecksum(binData, checksum);
                if (!binVerified) {
                    console.error('BIN checksum failure');
                    binData = null;
                }
            } else {
                binVerified = true;
            }
        } else {
            if (!uf2Only) console.warn('BIN download failed:', binResult.reason);
        }

        if (uf2Result.status === 'fulfilled') {
            uf2Data = uf2Result.value;
        } else {
            console.warn('UF2 download failed:', uf2Result.reason);
        }

        if (!binData && !uf2Data) {
            const reason = downloadReason(uf2Result.reason, fetchableUrl(uf2Url));
            updateProgress(0, false, `${t('Failed to download firmware.')} (${reason})`);
            // The host doesn't let this page read the file (no CORS, a proxy or a firewall): the browser can
            // still download it as a file for the RPI-RP2 drive.
            if (uf2Url && navigator.onLine !== false && uf2Result.reason instanceof TypeError) {
                return { needsUserAction: true, reason: 'manual-download', uf2Url, error: reason };
            }
            return false;
        }

        updateProgress(100, false, t('Firmware ready'));
    } catch (error) {
        console.error('Error downloading firmware:', error);
        updateProgress(0, false, t('Failed to download firmware.'));
        return false;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    // --- Try Picoboot / WebUSB first (falls back to UF2 if claim fails or times out) ---
    if (binData && binVerified) {
        updateProgress(0, true, t('Connecting to Pico bootloader...'));
        const claimTimeoutMs = isWindowsHost() ? 1000 : 5000;
        const claim = await pico_try_claim_bootloader({
            allowRequestDevice,
            claimTimeoutMs,
        });

        if (claim.ok) {
            let flashSucceeded = false;
            try {
                await markExclusive(true);
                if (activeBootloaderIsHoja && !(await hojaImageKeepsBootloader(binData))) {
                    return await hojaFlashThroughRom(url, checksum, options);
                }
                await writeImage(binData);
                flashSucceeded = true;
            } catch (error) {
                console.error('Picoboot flash failed:', error);
                const hoja = activeBootloaderIsHoja;
                await closePicoDevice();
                // The update mode has no drive to copy to: it stays put for another try
                if (hoja) {
                    updateProgress(0, false, t('The write didn’t finish. Press Update to try again.'));
                    return false;
                }
                // Fall through to UF2 path only when flash itself failed
            }

            if (flashSucceeded) {
                try {
                    await rebootDevice();
                } catch (rebootError) {
                    // Device often disconnects before the reboot ack arrives.
                    console.warn('Reboot ack missed (device likely rebooted):', rebootError);
                }
                updateProgress(100, true, t('Firmware update complete!'));
                console.log('Flashing complete. Device rebooted.');
                return true;
            }
        } else if (claim.needsPermission && !allowRequestDevice) {
            // May still stage UF2 below if we already have the file
            if (!(uf2Data && supportsDirectoryPicker())) {
                updateProgress(0, false, t('Click Update to authorize the bootloader device.'));
                return { needsUserAction: true, reason: 'permission' };
            }
            setUpdateStatus(t('Direct update unavailable. Copy to the drive next...'));
        } else if (!claim.canceled) {
            setUpdateStatus(t('Direct update unavailable. Copy to the drive next...'));
        } else {
            updateProgress(0, false, t('Device selection canceled.'));
            return false;
        }
    }

    // --- UF2 fallback: stage for a guided picker step (same for update + install) ---
    if (uf2Data && supportsDirectoryPicker()) {
        return stageUf2Picker(uf2Data, uf2Url);
    }

    // --- Manual download last resort (not treated as flash success) ---
    if (uf2Url) {
        // Keep the bytes so the step saves this file instead of fetching it again.
        if (uf2Data) { cachedUf2ForPicker = uf2Data; cachedUf2Url = uf2Url; }
        updateProgress(0, false, t('Download the UF2 and copy it to the controller’s drive.'));
        return { needsUserAction: true, reason: 'manual-download', uf2Url };
    }

    updateProgress(0, false, t('Update failed.'));
    return false;
}

/**
 * Write the image over PICOBOOT: whole through the boot ROM; in the HOJA update mode from just past the
 * bootloader's own sectors (it keeps them), then read back.
 */
async function writeImage(binData) {
    const start = activeBootloaderIsHoja ? HOJA_BOOT_SIZE : 0;
    await writeFlashWithProgress(binData, binData.byteLength, start);
    if (activeBootloaderIsHoja) await verifyFlashWithProgress(binData, start);
}

/**
 * An image the HOJA update mode can't take, as it brings its own bootloader (or none): restart into the
 * boot ROM's bootloader and flash it there. Resolves what that attempt resolves.
 */
async function hojaFlashThroughRom(url, checksum, options) {
    updateProgress(0, true, t('Restarting into the Raspberry Pi bootloader...'));
    if (!(await hojaRestartIntoRom())) {
        updateProgress(0, false, t('Click Update to authorize the bootloader device.'));
        return { needsUserAction: true, reason: 'permission' };
    }
    return pico_update_attempt_flash(url, checksum, { ...options, allowRequestDevice: false });
}

export async function pico_exit_bootloader_attempt() {
    console.log('Attempting pico bootloader exit.');
    updateProgress(0, true, t('Connecting to bootloader to restart...'));

    const claimTimeoutMs = isWindowsHost() ? 1000 : 5000;
    const claim = await pico_try_claim_bootloader({
        allowRequestDevice: true,
        claimTimeoutMs,
    });
    if (!claim.ok) {
        if (claim.canceled) {
            updateProgress(0, false, t('Device selection canceled.'));
        } else {
            updateProgress(0, false, t('Could not restart via Picoboot. Unplug/replug the device.'));
        }
        return false;
    }

    try {
        updateProgress(50, true, t('Restarting device...'));
        try {
            await rebootDevice();
        } catch (rebootError) {
            console.warn('Reboot ack missed (device likely rebooted):', rebootError);
        }
        updateProgress(100, true, t('Device restarted.'));
        return true;
    } catch (error) {
        console.error('Error:', error);
        await closePicoDevice();
        updateProgress(0, false, t('Restart failed.'));
        return false;
    }
}

async function findAndClaimInterface(dev) {
    const configurations = await dev.configurations;

    for (const configuration of configurations) {
        for (const iface of configuration.interfaces) {
            if (iface.alternate.interfaceClass === INTERFACE_CLASS) {
                interfaceNumber = iface.interfaceNumber;
                endpointOut = iface.alternate.endpoints.find((e) => e.direction === 'out');
                endpointIn = iface.alternate.endpoints.find((e) => e.direction === 'in');

                await dev.selectConfiguration(configuration.configurationValue);
                await dev.claimInterface(interfaceNumber);

                console.log(
                    `Claimed interface ${interfaceNumber} with endpoints OUT: ${endpointOut.endpointNumber}, IN: ${endpointIn.endpointNumber}`
                );
                return;
            }
        }
    }
}

async function markExclusive(exclusive) {
    console.log('Marking device exclusive');
    const cmd = new PicobootCmd(EXCLUSIVE_CMD, 0);
    cmd.setExclusiveCmd(0x02);
    const output = cmd.toUint8Array();

    let result = await usbTransferOut(endpointOut.endpointNumber, output, 1500, 'exclusive access');
    console.log('Cmd sent:', result);
    result = await usbTransferIn(endpointIn.endpointNumber, 1, 1500, 'exclusive access ack');
    console.log('Cmd sent confirm:', result);

    await exitXip();
}

async function exitXip() {
    // EXIT_XIP is documented as a no-op on RP2350.
    if (activeBootloaderIs2350) {
        return;
    }
    console.log('Exit XIP');
    var cmd = new PicobootCmd(EXIT_XIP_CMD, 0);
    var output = cmd.toUint8Array();

    let result = await usbTransferOut(endpointOut.endpointNumber, output, 1500, 'exit xip');
    console.log('Cmd sent:', result);
    result = await usbTransferIn(endpointIn.endpointNumber, 1, 1500, 'exit xip ack');
    console.log('Cmd sent exit XIP:', result);
}

const FLASH_TRANSFER_TIMEOUT_MS = 30000;

/** start: where in the image to begin (a sector boundary); the image itself starts at the start of flash. */
async function writeFlashWithProgress(data, size, start = 0) {
    console.log('Attempt write data with progress tracking');

    const pageSize = FLASH_SECTOR_LEN;
    const totalPages = Math.ceil(size / pageSize);
    const firstPage = start / pageSize;
    var addr = FLASH_BASE + start;

    const dataView = new Uint8Array(data);

    updateProgress(0, true, t('Flashing firmware...'));

    for (let i = firstPage; i < totalPages; i++) {
        const progressPercent = ((i - firstPage) / (totalPages - firstPage)) * 100;
        updateProgress(progressPercent, true, t('Flashing firmware...'));

        const ecmd = new PicobootCmd(FLASH_ERASE_CMD, 0);
        ecmd.setRangeCmd(addr, pageSize);
        const ecmdOutput = ecmd.toUint8Array();

        let eresult = await usbTransferOut(endpointOut.endpointNumber, ecmdOutput, FLASH_TRANSFER_TIMEOUT_MS, `erase ${i}`);
        console.log('Data erased:', eresult);
        eresult = await usbTransferIn(endpointIn.endpointNumber, 1, FLASH_TRANSFER_TIMEOUT_MS, `erase ${i} ack`);
        console.log('Confirm erase:', i);

        await exitXip();

        let chunk = dataView.subarray(i * pageSize, (i + 1) * pageSize);

        if (i === totalPages - 1 && chunk.length < pageSize) {
            const paddedChunk = new Uint8Array(pageSize);
            paddedChunk.set(chunk);
            chunk = paddedChunk;
        }

        const cmd = new PicobootCmd(FLASH_WRITE_CMD, pageSize);
        cmd.setRangeCmd(addr, pageSize);
        const cmdOutput = cmd.toUint8Array();

        let result = await usbTransferOut(endpointOut.endpointNumber, cmdOutput, FLASH_TRANSFER_TIMEOUT_MS, `write cmd ${i}`);
        console.log('Data sent:', result);

        result = await usbTransferOut(endpointOut.endpointNumber, chunk, FLASH_TRANSFER_TIMEOUT_MS, `write data ${i}`);
        result = await usbTransferIn(endpointIn.endpointNumber, 1, FLASH_TRANSFER_TIMEOUT_MS, `write ${i} ack`);
        console.log('Confirm write:', i);

        await exitXip();

        addr += pageSize;

        const finalProgressPercent = ((i + 1 - firstPage) / (totalPages - firstPage)) * 100;
        updateProgress(finalProgressPercent, true, t('Flashing firmware...'));
    }
    // "Complete" is shown by the caller, once anything that checks the write has passed
}

/** PICOBOOT READ of at most one sector, then the host's empty acknowledgement. */
async function readFlash(addr, size) {
    const cmd = new PicobootCmd(READ_CMD, size);
    cmd.setRangeCmd(addr, size);
    await usbTransferOut(endpointOut.endpointNumber, cmd.toUint8Array(), FLASH_TRANSFER_TIMEOUT_MS, 'read cmd');
    const result = await usbTransferIn(endpointIn.endpointNumber, size, FLASH_TRANSFER_TIMEOUT_MS, 'read data');
    await usbTransferOut(endpointOut.endpointNumber, new Uint8Array(0), FLASH_TRANSFER_TIMEOUT_MS, 'read ack');
    return new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
}

/** The first index where `a` and `b` differ (where the shorter one ends, if that comes first), or -1. */
function firstDifference(a, b) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        if (a[i] !== b[i]) return i;
    }
    return -1;
}

/** Read the written range back and compare (the HOJA update mode; the boot ROM path doesn't read back). */
async function verifyFlashWithProgress(data, start) {
    const image = new Uint8Array(data);
    const end = image.byteLength;
    for (let at = start; at < end; at += FLASH_SECTOR_LEN) {
        updateProgress(((at - start) / (end - start)) * 100, true, t('Checking the written firmware...'));
        const len = Math.min(FLASH_SECTOR_LEN, end - at);
        const back = await readFlash(FLASH_BASE + at, len);
        const diff = firstDifference(back, image.subarray(at, at + len));
        if (diff >= 0) throw new Error(`Read back differs at 0x${(FLASH_BASE + at + diff).toString(16)}`);
    }
}

/** The HOJA update mode keeps its bootloader: true when the image carries exactly that one. */
async function hojaImageKeepsBootloader(data) {
    updateProgress(0, true, t('Checking the controller...'));
    const image = new Uint8Array(data);
    if (image.byteLength <= HOJA_BOOT_SIZE) return false;
    for (let at = 0; at < HOJA_BOOT_SIZE; at += FLASH_SECTOR_LEN) {
        const board = await readFlash(FLASH_BASE + at, FLASH_SECTOR_LEN);
        if (firstDifference(board, image.subarray(at, at + FLASH_SECTOR_LEN)) >= 0) return false;
    }
    return true;
}

/**
 * From the HOJA update mode, restart into the chip's boot ROM bootloader (PICOBOOT 0x21), for the
 * "boot ROM" recovery reboot on firmware without GAMEPAD_CMD_RESET_TO_ROM_BOOTLOADER. A bootloader
 * that is already the boot ROM is left as it is. Never asks for a device (no user gesture here).
 * @returns {Promise<boolean>} true once the boot ROM bootloader is there
 */
export async function pico_enter_rom_bootloader() {
    const claim = await pico_try_claim_bootloader({ allowRequestDevice: false, uf2Only: true });
    if (!claim.ok) return false;
    if (!activeBootloaderIsHoja) {
        await closePicoDevice();
        return true;
    }
    return hojaRestartIntoRom();
}

/**
 * Leave the HOJA update mode for the boot ROM's bootloader (an image with another bootloader, or
 * none). Resolves true once the boot ROM's device is there and this page may use it.
 */
async function hojaRestartIntoRom() {
    const cmd = new PicobootCmd(HOJA_ROM_BOOTLOADER_CMD, 0);
    try {
        await usbTransferOut(endpointOut.endpointNumber, cmd.toUint8Array(), RESTART_CMD_TIMEOUT_MS, 'rom bootloader');
        await usbTransferIn(endpointIn.endpointNumber, 1, RESTART_ACK_TIMEOUT_MS, 'rom bootloader ack');
    } catch (error) {
        console.warn('ROM bootloader ack not received:', error);
    }
    await closePicoDevice();

    const until = Date.now() + HOJA_ROM_WAIT_MS;
    while (Date.now() < until) {
        await sleep(HOJA_ROM_POLL_MS);
        const devs = await navigator.usb.getDevices();
        if (devs.some((d) => isPicoBootloader(d) && !isHojaUpdateMode(d))) return true;
    }
    return false;
}

async function rebootDevice() {
    console.log('Reboot device');
    const is2350 = activeBootloaderIs2350 || isRp2350Bootloader(picoDevice);
    var cmd = new PicobootCmd(is2350 ? REBOOT2_CMD : REBOOT_CMD, 0);
    if (is2350) {
        // RP2350 normal reboot uses REBOOT2 with flags=0
        cmd.setReboot2Cmd(0, 500, 0, 0);
    } else {
        cmd.setRebootCmd(0, 0x20042000, 500);
    }
    var output = cmd.toUint8Array();

    await usbTransferOut(endpointOut.endpointNumber, output, RESTART_CMD_TIMEOUT_MS, 'reboot');
    try {
        await usbTransferIn(endpointIn.endpointNumber, 1, RESTART_ACK_TIMEOUT_MS, 'reboot ack');
    } catch (error) {
        // Expected when the device reboots and disconnects before the ack is read.
        console.warn('Reboot ack not received:', error);
    }
}
