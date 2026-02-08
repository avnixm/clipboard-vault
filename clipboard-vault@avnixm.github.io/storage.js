/**
 * Persist clipboard history as JSON. Atomic write (temp + rename).
 * Path: XDG data dir / <uuid> / history.json
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const FILENAME = 'history.json';

/**
 * @param {string} filePath - full path to history.json
 * @returns {Array<{ text: string, timestamp: number, pinned?: boolean }>}
 */
export function loadHistory(filePath) {
  const file = Gio.File.new_for_path(filePath);
  if (!file.query_exists(null)) return [];

  try {
    const [ok, contents] = file.load_contents(null);
    if (!ok || !contents) return [];
    const decoder = new TextDecoder('utf-8');
    const str = decoder.decode(contents);
    const data = JSON.parse(str);
    if (!Array.isArray(data)) return [];
    return data
      .filter((e) => e && typeof e.text === 'string')
      .map((e) => ({
        text: String(e.text),
        timestamp: typeof e.timestamp === 'number' ? e.timestamp : Date.now(),
        pinned: !!e.pinned,
      }));
  } catch (e) {
    console.warn('[Clipboard Vault] loadHistory failed:', e.message);
    return [];
  }
}

/**
 * @param {string} filePath
 * @param {Array<{ text: string, timestamp: number, pinned?: boolean }>} items
 */
export function saveHistory(filePath, items) {
  const dirPath = GLib.path_get_dirname(filePath);
  const dir = Gio.File.new_for_path(dirPath);
  try {
    if (!dir.query_exists(null)) dir.make_directory_with_parents(null);
  } catch (e) {
    console.warn('[Clipboard Vault] saveHistory mkdir failed:', e.message);
    return;
  }

  const data = items.map((e) => ({
    text: e.text,
    timestamp: e.timestamp,
    pinned: e.pinned || false,
  }));
  const str = JSON.stringify(data, null, 0);
  const tempPath = filePath + '.' + GLib.get_real_time() + '.tmp';
  const tempFile = Gio.File.new_for_path(tempPath);

  try {
    tempFile.replace_contents(
      new TextEncoder().encode(str),
      null,
      false,
      Gio.FileCreateFlags.NONE,
      null
    );
    const targetFile = Gio.File.new_for_path(filePath);
    tempFile.move(targetFile, Gio.FileCopyFlags.OVERWRITE, null, null);
  } catch (e) {
    console.warn('[Clipboard Vault] saveHistory failed:', e.message);
    try {
      if (tempFile.query_exists(null)) tempFile.delete(null);
    } catch (_e) {}
  }
}

/**
 * @param {string} filePath
 */
export function deleteHistory(filePath) {
  const file = Gio.File.new_for_path(filePath);
  try {
    if (file.query_exists(null)) file.delete(null);
  } catch (e) {
    console.warn('[Clipboard Vault] deleteHistory failed:', e.message);
  }
}

/**
 * @param {string} uuid - extension UUID
 * @returns {string} full path to history.json
 */
export function getHistoryPath(uuid) {
  const dataDir = GLib.get_user_data_dir();
  return GLib.build_filenamev([dataDir, uuid, FILENAME]);
}
