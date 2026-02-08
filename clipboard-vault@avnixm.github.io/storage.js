/**
 * Persist clipboard history and pinned/favorite items under XDG data dir.
 * Paths: <user_data_dir>/<uuid>/history.json, <user_data_dir>/<uuid>/pinned.json
 * Atomic write: temp file then rename. Robust to corrupted JSON (log and fallback to []).
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const HISTORY_FILENAME = 'history.json';
const PINNED_FILENAME = 'pinned.json';

function _ensureDir(filePath) {
  const dirPath = GLib.path_get_dirname(filePath);
  const dir = Gio.File.new_for_path(dirPath);
  try {
    if (!dir.query_exists(null)) dir.make_directory_with_parents(null);
  } catch (e) {
    console.warn('[Clipboard Vault] mkdir failed:', e.message);
    return false;
  }
  return true;
}

/**
 * @param {string} uuid - extension UUID
 * @returns {string} full path to history.json
 */
export function getHistoryPath(uuid) {
  const dataDir = GLib.get_user_data_dir();
  return GLib.build_filenamev([dataDir, uuid, HISTORY_FILENAME]);
}

/**
 * @param {string} uuid - extension UUID
 * @returns {string} full path to pinned.json
 */
export function getPinnedPath(uuid) {
  const dataDir = GLib.get_user_data_dir();
  return GLib.build_filenamev([dataDir, uuid, PINNED_FILENAME]);
}

/**
 * @param {string} filePath - full path to history.json
 * @returns {Array<{ id?: number, text: string, timestamp: number, pinned?: boolean, favorite?: boolean }>}
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
        id: typeof e.id === 'number' ? e.id : undefined,
        text: String(e.text),
        timestamp: typeof e.timestamp === 'number' ? e.timestamp : Date.now(),
        pinned: !!e.pinned,
        favorite: !!e.favorite,
      }));
  } catch (e) {
    console.warn('[Clipboard Vault] loadHistory failed:', e.message);
    return [];
  }
}

/**
 * Load pinned/favorite entries from pinned.json. Merges id, text, timestamp, pinned, favorite.
 * @param {string} filePath - full path to pinned.json
 * @returns {Array<{ id?: number, text: string, timestamp: number, pinned?: boolean, favorite?: boolean }>}
 */
export function loadPinned(filePath) {
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
        id: typeof e.id === 'number' ? e.id : undefined,
        text: String(e.text),
        timestamp: typeof e.timestamp === 'number' ? e.timestamp : Date.now(),
        pinned: !!e.pinned,
        favorite: !!e.favorite,
      }));
  } catch (e) {
    console.warn('[Clipboard Vault] loadPinned failed (corrupted or missing):', e.message);
    return [];
  }
}

/**
 * @param {string} filePath
 * @param {Array<{ text: string, timestamp: number, pinned?: boolean, favorite?: boolean }>} items
 */
export function saveHistory(filePath, items) {
  if (!_ensureDir(filePath)) return;

  const data = items.map((e) => ({
    text: e.text,
    timestamp: e.timestamp,
    pinned: !!e.pinned,
    favorite: !!e.favorite,
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
 * Atomic save of pinned/favorite entries to pinned.json.
 * @param {string} filePath - full path to pinned.json
 * @param {Array<{ id?: number, text: string, timestamp: number, pinned?: boolean, favorite?: boolean }>} entries
 */
export function savePinned(filePath, entries) {
  if (!_ensureDir(filePath)) return;

  const data = entries.map((e) => ({
    id: e.id,
    text: e.text,
    timestamp: e.timestamp,
    pinned: !!e.pinned,
    favorite: !!e.favorite,
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
    console.warn('[Clipboard Vault] savePinned failed:', e.message);
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
 * @param {string} filePath - full path to pinned.json
 */
export function deletePinned(filePath) {
  const file = Gio.File.new_for_path(filePath);
  try {
    if (file.query_exists(null)) file.delete(null);
  } catch (e) {
    console.warn('[Clipboard Vault] deletePinned failed:', e.message);
  }
}
