/**
 * Clipboard Vault — GNOME Shell extension (ESModules, GNOME 45+).
 * Panel icon opens menu with clipboard history (pinned, favorite, recents).
 * Pinned/favorite persist to disk and survive Shell restart.
 */

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { HistoryStore } from './historyStore.js';
import { ClipboardPoller } from './clipboardPoller.js';
import { ClipboardVaultIndicator } from './indicator.js';
import * as Storage from './storage.js';
import { debounce, isPasswordLike } from './util.js';

const KEYBINDING_KEY = 'shortcut';
const SETTINGS_SCHEMA = 'org.gnome.shell.extensions.clipboard-vault';
const FALLBACK_SHORTCUT = ['<Super><Shift>v'];
const SAVE_DEBOUNCE_MS = 1000;
const ActionModes = Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW;

export default class ClipboardVaultExtension extends Extension {
  enable() {
    console.log('[Clipboard Vault] enable()');

    this._settings = this.getSettings(SETTINGS_SCHEMA);
    const maxItems = this._settings.get_int('max-items');
    const persist = this._settings.get_boolean('persist-history');
    this._historyPath = Storage.getHistoryPath(this.uuid);
    this._pinnedPath = Storage.getPinnedPath(this.uuid);

    const pinnedEntries = Storage.loadPinned(this._pinnedPath);
    console.log('[Clipboard Vault] loaded pinned/favorite:', pinnedEntries.length);

    let historyEntries = [];
    if (persist) {
      historyEntries = Storage.loadHistory(this._historyPath);
      console.log('[Clipboard Vault] loaded history:', historyEntries.length);
    }

    const seen = new Set();
    const merged = [];
    for (const e of pinnedEntries) {
      const t = (e.text || '').trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      merged.push({
        id: e.id,
        text: t,
        timestamp: typeof e.timestamp === 'number' ? e.timestamp : Date.now(),
        pinned: !!e.pinned,
        favorite: !!e.favorite,
      });
    }
    for (const e of historyEntries) {
      const t = (e.text || '').trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      merged.push({
        id: e.id,
        text: t,
        timestamp: typeof e.timestamp === 'number' ? e.timestamp : Date.now(),
        pinned: !!e.pinned,
        favorite: !!e.favorite,
      });
    }
    console.log('[Clipboard Vault] merged initial entries:', merged.length);

    this._historyStore = new HistoryStore(maxItems, merged);

    this._historyStore.setOnChange(() => {
      if (this._indicator) this._indicator.setItems();
      if (this._settings.get_boolean('persist-history') && this._saveHistoryDebounce) {
        this._saveHistoryDebounce.run();
      }
      if (this._savePinnedDebounce) {
        this._savePinnedDebounce.run();
      }
    });

    this._saveHistoryDebounce = debounce(() => {
      if (!this._historyStore || !persist) return;
      Storage.saveHistory(this._historyPath, this._historyStore.getItems());
      console.log('[Clipboard Vault] history saved');
    }, SAVE_DEBOUNCE_MS);

    this._savePinnedDebounce = debounce(() => {
      if (!this._historyStore) return;
      const entries = this._historyStore.getPinnedAndFavoriteEntries();
      Storage.savePinned(this._pinnedPath, entries);
      console.log('[Clipboard Vault] pinned saved, count=%d', entries.length);
    }, SAVE_DEBOUNCE_MS);

    const ignorePasswordLike = this._settings.get_boolean('ignore-password-like');
    this._poller = new ClipboardPoller((newText) => {
      if (!newText || !String(newText).trim()) return;
      if (ignorePasswordLike && isPasswordLike(newText)) return;
      const changed = this._historyStore.addText(newText);
      if (!changed) return;
      const size = this._historyStore.size();
      const preview = newText.length > 40 ? newText.substring(0, 40) + '…' : newText;
      console.log('[Clipboard Vault] store.addText done, size=%d:', size, preview);
    });
    this._poller.start();

    const ext = Extension.lookupByURL(import.meta.url);
    const dirObj = ext?.dir ?? this.dir;
    const extensionDir = typeof dirObj === 'string' ? dirObj : (dirObj?.get_path?.() ?? '');

    const clipboard = St.Clipboard.get_default();
    this._indicator = new ClipboardVaultIndicator(
      extensionDir,
      () => (this._historyStore ? this._historyStore.getItems() : []),
      (text) => {
        try {
          clipboard.set_text(St.ClipboardType.CLIPBOARD, text);
        } catch (e) {
          console.warn('[Clipboard Vault] clipboard set failed:', e.message);
        }
      },
      (text, pinned) => {
        if (this._historyStore) this._historyStore.setPinned(text, pinned);
      },
      (text, favorite) => {
        if (this._historyStore) this._historyStore.setFavorite(text, favorite);
      }
    );
    Main.panel.addToStatusArea('clipboard-vault', this._indicator, 0, 'right');
    console.log('[Clipboard Vault] indicator added to panel');

    if (this._settings.get_boolean('enable-keybindings')) {
      this._bindKeybinding();
    }
    this._settings.connect('changed::enable-keybindings', () => {
      try {
        Main.wm.removeKeybinding(KEYBINDING_KEY);
      } catch (_e) {}
      if (this._settings.get_boolean('enable-keybindings')) {
        this._bindKeybinding();
      }
    });

    this._settings.connect('changed::max-items', () => {
      this._historyStore?.setMaxItems(this._settings.get_int('max-items'));
    });
    this._settings.connect('changed::clear-history-trigger', () => {
      const trigger = this._settings.get_int('clear-history-trigger');
      if (trigger > 0 && this._historyStore) {
        this._historyStore.clear();
        Storage.deleteHistory(this._historyPath);
        Storage.deletePinned(this._pinnedPath);
        this._settings.set_int('clear-history-trigger', 0);
        console.log('[Clipboard Vault] history cleared');
      }
    });
  }

  _onKeybindingTriggered() {
    console.log('[Clipboard Vault] keybinding triggered');
    if (this._indicator) this._indicator.menu.toggle();
  }

  _bindKeybinding() {
    let accelerator = this._settings.get_strv(KEYBINDING_KEY);
    if (!accelerator || accelerator.length === 0) {
      accelerator = ['<Super>v'];
      this._settings.set_strv(KEYBINDING_KEY, accelerator);
    }

    try {
      Main.wm.addKeybinding(
        KEYBINDING_KEY,
        this._settings,
        Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
        ActionModes,
        () => this._onKeybindingTriggered()
      );
      console.log('[Clipboard Vault] keybinding registered:', this._settings.get_strv(KEYBINDING_KEY));
      return;
    } catch (e) {
      console.warn('[Clipboard Vault] keybinding registration failed:', e.message);
    }

    this._settings.set_strv(KEYBINDING_KEY, FALLBACK_SHORTCUT);
    try {
      Main.wm.addKeybinding(
        KEYBINDING_KEY,
        this._settings,
        Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
        ActionModes,
        () => this._onKeybindingTriggered()
      );
      console.warn('[Clipboard Vault] using fallback shortcut:', FALLBACK_SHORTCUT);
      return;
    } catch (e2) {
      console.warn('[Clipboard Vault] fallback keybinding also failed:', e2.message);
    }

    console.warn('[Clipboard Vault] shortcut inactive due to conflict; use Preferences to set another shortcut.');
  }

  disable() {
    console.log('[Clipboard Vault] disable()');
    if (this._saveHistoryDebounce) this._saveHistoryDebounce.flush();
    if (this._savePinnedDebounce) this._savePinnedDebounce.flush();
    this._saveHistoryDebounce = null;
    this._savePinnedDebounce = null;
    try {
      Main.wm.removeKeybinding(KEYBINDING_KEY);
    } catch (_e) {}
    this._indicator?.destroy();
    this._indicator = null;
    this._poller?.stop();
    this._poller = null;
    console.log('[Clipboard Vault] poller stopped');
    this._historyStore = null;
    this._settings = null;
  }
}
