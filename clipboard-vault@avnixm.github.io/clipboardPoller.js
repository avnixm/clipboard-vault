/**
 * Polls clipboard every ~600ms via GLib.timeout_add; reports changes only.
 * Uses St.Clipboard.get_default() (no arg) and get_text(type, callback).
 * Guard prevents overlapping async callbacks; stop() removes source and clears state.
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
    this._clipboard = null;
    this._lastSeenText = '';
    this._sourceId = 0;
    this._pending = false;
    this._stopped = false;
  }

  start() {
    this._stopped = false;
    if (this._sourceId) {
      console.log('[Clipboard Vault] poller already running');
      return;
    }
    try {
      this._clipboard = St.Clipboard.get_default();
    } catch (e) {
      console.warn('[Clipboard Vault] St.Clipboard.get_default() failed:', e.message);
      return;
    }
    if (!this._clipboard) {
      console.warn('[Clipboard Vault] St.Clipboard.get_default() returned null');
      return;
    }
    this._sourceId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      POLL_INTERVAL_MS,
      () => this._poll()
    );
    console.log('[Clipboard Vault] poller started (interval %d ms)', POLL_INTERVAL_MS);
  }

  stop() {
    this._stopped = true;
    if (this._sourceId) {
      GLib.source_remove(this._sourceId);
      this._sourceId = 0;
    }
    this._pending = false;
    this._clipboard = null;
    console.log('[Clipboard Vault] poller stopped');
  }

  _poll() {
    if (this._stopped || !this._clipboard) return GLib.SOURCE_REMOVE;
    if (this._pending) return GLib.SOURCE_CONTINUE;

    this._pending = true;
    const self = this;
    const onText = (text) => {
      if (self._stopped) return;
      self._pending = false;
      const str = text != null ? String(text) : '';
      const trimmed = str.trim();
      if (trimmed !== self._lastSeenText) {
        self._lastSeenText = trimmed;
        const preview = trimmed.length > 40 ? trimmed.substring(0, 40) + '…' : trimmed;
        console.log('[Clipboard Vault] poll tick clipboard changed:', preview);
        try {
          self._callback(trimmed);
        } catch (e) {
          console.warn('[Clipboard Vault] poller callback error:', e);
        }
      }
    };

    if (typeof this._clipboard.get_text === 'function') {
      this._clipboard.get_text(CLIPBOARD_TYPE, (clipboard, text) => onText(text));
    } else if (typeof this._clipboard.get_text_async === 'function') {
      this._clipboard.get_text_async(CLIPBOARD_TYPE, (clipboard, result) => {
        if (self._stopped) return;
        try {
          const text = clipboard.get_text_finish(result);
          onText(text);
        } catch (e) {
          self._pending = false;
          console.warn('[Clipboard Vault] get_text_finish failed:', e.message);
        }
      });
    } else {
      this._pending = false;
      console.warn('[Clipboard Vault] clipboard get_text/get_text_async not available');
    }
    return GLib.SOURCE_CONTINUE;
  }
}
