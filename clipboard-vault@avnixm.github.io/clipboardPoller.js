/**
 * Polls clipboard every ~600ms via GLib.timeout_add; reports changes only.
 * Uses St.Clipboard.get_default() and get_text (async callback).
 */

import St from 'gi://St';
import GLib from 'gi://GLib';

const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;
const POLL_INTERVAL_MS = 600;

export class ClipboardPoller {
  /**
   * @param {(newText: string) => void} callback
   */
  constructor(callback) {
    this._callback = callback;
    this._clipboard = St.Clipboard.get_default(CLIPBOARD_TYPE);
    this._lastSeenText = '';
    this._sourceId = 0;
    this._pending = false;
  }

  start() {
    if (this._sourceId) return;
    this._sourceId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      POLL_INTERVAL_MS,
      () => this._poll()
    );
  }

  stop() {
    if (this._sourceId) {
      GLib.source_remove(this._sourceId);
      this._sourceId = 0;
    }
    this._pending = false;
  }

  _poll() {
    if (this._pending) return GLib.SOURCE_CONTINUE;
    this._pending = true;
    const onText = (text) => {
      this._pending = false;
      if (text != null && text !== this._lastSeenText) {
        this._lastSeenText = text;
        try {
          this._callback(text);
        } catch (e) {
          console.warn('[Clipboard Vault] poller callback error:', e);
        }
      }
    };
    if (typeof this._clipboard.get_text === 'function') {
      this._clipboard.get_text(CLIPBOARD_TYPE, (clipboard, text) => onText(text));
    } else if (typeof this._clipboard.get_text_async === 'function') {
      this._clipboard.get_text_async(CLIPBOARD_TYPE, (clipboard, result) => {
        try {
          const text = clipboard.get_text_finish(result);
          onText(text);
        } catch (_e) {
          this._pending = false;
        }
      });
    } else {
      this._pending = false;
      console.warn('[Clipboard Vault] clipboard get_text/get_text_async not available');
    }
    return GLib.SOURCE_CONTINUE;
  }
}
