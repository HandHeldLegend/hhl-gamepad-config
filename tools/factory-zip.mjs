#!/usr/bin/env node
/**
 * factory-zip.mjs: Build docs/factory/hhl-factory-setup.zip, the one-click download of the factory
 * station's setup scripts and guides (linked from docs/FACTORY.md and FACTORY.zh.md).
 *
 * The zip is committed so the site serves it. It is built byte for byte the same every time (files
 * stored without compression, fixed dates), so --check can tell when a script or guide changed
 * without the zip being rebuilt.
 *
 *   node tools/factory-zip.mjs           write the zip
 *   node tools/factory-zip.mjs --check   exit 1 when the committed zip is stale
 *
 * Zero dependencies.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/factory/hhl-factory-setup.zip';
const FOLDER = 'hhl-factory-setup';
/** [source in the repo, name in the zip, unix mode] */
const FILES = [
  ['docs/factory/setup-windows.bat', 'setup-windows.bat', 0o644],
  ['docs/factory/setup-windows.ps1', 'setup-windows.ps1', 0o644],
  ['docs/factory/setup-linux.sh', 'setup-linux.sh', 0o755],
  ['docs/FACTORY.md', 'FACTORY.md', 0o644],
  ['docs/FACTORY.zh.md', 'FACTORY.zh.md', 0o644],
];
/** Text files that must reach a Windows PC with CRLF line ends whatever the checkout did. */
const CRLF = /\.(bat|ps1)$/;
const LF = /\.(sh|md)$/;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01
const DOS_TIME = 0;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function normalize(name, data) {
  if (!CRLF.test(name) && !LF.test(name)) return data;
  const lf = data.toString('latin1').replace(/\r\n/g, '\n'); // latin1: bytes pass through untouched
  return Buffer.from(CRLF.test(name) ? lf.replace(/\n/g, '\r\n') : lf, 'latin1');
}

async function build() {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [src, name, mode] of FILES) {
    const data = normalize(name, await readFile(path.join(ROOT, src)));
    const fileName = Buffer.from(`${FOLDER}/${name}`, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made on unix: keeps the .sh executable
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(((0o100000 | mode) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, fileName, data);
    centrals.push(central, fileName);
    offset += local.length + fileName.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(FILES.length, 8);
  end.writeUInt16LE(FILES.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

const zip = await build();
const outPath = path.join(ROOT, OUT);
if (process.argv.includes('--check')) {
  const current = await readFile(outPath).catch(() => null);
  if (!current || !current.equals(zip)) {
    console.error(`${OUT} is stale. Run: node tools/factory-zip.mjs`);
    process.exit(1);
  }
  console.log(`${OUT} is up to date`);
} else {
  await writeFile(outPath, zip);
  console.log(`wrote ${OUT} (${FILES.length} files, ${zip.length} bytes)`);
}
