/**
 * urls.js: Firmware and manifest locations reported by a controller, made readable by fetch().
 *
 * A controller reports its own manifest_url and firmware_url, so the host isn't always ours. GitHub
 * page-style file links (github.com/<owner>/<repo>/raw/<ref>/<path>, …/blob/<ref>/<path>?raw=true)
 * redirect without CORS headers, so fetch() can't follow them; the same file on
 * raw.githubusercontent.com can be read. Other hosts are used as reported: when a download is
 * blocked there, the updater falls back to downloading the file in the browser (picoboot.js).
 */
const GITHUB_FILE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:raw|blob)\/(.+)$/i;

/** The fetch()-readable form of a reported URL (unchanged when there is none). */
export function fetchableUrl(url) {
  if (!url) return url;
  const m = GITHUB_FILE.exec(String(url).replace(/\?raw=(?:true|1)$/i, ''));
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : url;
}
