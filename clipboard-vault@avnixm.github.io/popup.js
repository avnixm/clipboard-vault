/**
 * Win+V-style popup: search, scrollable list, keyboard nav, mouse selection.
 * Phase 7: open/close animation, focus trap, accessibility, selection persistence.
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const PREVIEW_MAX_LEN = 60;
const CLOSE_AFTER_ACTIVATION = true;
const ANIMATION_DURATION_MS = 200;

const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

/**
 * @param {number} ts
 * @returns {string}
 */
function formatTimestamp(ts) {
  const now = Date.now();
  const d = (now - ts) / 1000;
  if (d < 60) return 'now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  if (d < 172800) return 'Yesterday';
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class ClipboardPopup {
  constructor() {
    this._actor = null;
    this._searchEntry = null;
    this._listContainer = null;
    this._scrollView = null;
    this._rows = [];
    this._items = [];
    this._filteredIndices = [];
    this._prevFilteredIndices = [];
    this._selectedIndex = -1;
    this._destroyed = false;
    this._savedFocus = null;
    this._focusOutId = 0;
    this._closeAnimation = null;
  }

  _build() {
    const box = new St.BoxLayout({
      style_class: 'clipboard-vault-popup',
      vertical: true,
      reactive: true,
      track_hover: true,
      can_focus: true,
    });

    this._searchEntry = new St.Entry({
      style_class: 'clipboard-vault-search-entry',
      hint_text: 'Search clipboard history…',
      can_focus: true,
      track_hover: true,
      x_expand: true,
    });
    const searchAccessible = this._searchEntry.get_accessible?.();
    if (searchAccessible?.set_accessible_name) searchAccessible.set_accessible_name('Search clipboard history');
    box.add_child(this._searchEntry);

    this._listContainer = new St.BoxLayout({
      style_class: 'clipboard-vault-list',
      vertical: true,
    });
    this._scrollView = new St.ScrollView({
      style_class: 'clipboard-vault-list-scroll',
      overlay_scrollbars: true,
      x_expand: true,
      y_expand: true,
    });
    this._scrollView.add_child(this._listContainer);
    box.add_child(this._scrollView);

    this._actor = box;

    this._searchEntry.clutter_text.connect('text-changed', () => this._onSearchChanged());
    this._actor.connect('key-release-event', (actor, event) => this._onKeyRelease(actor, event));
  }

  _onSearchChanged() {
    this._applyFilter();
  }

  _applyFilter() {
    const query = (this._searchEntry?.get_text() || '').trim().toLowerCase();
    if (!query) {
      this._filteredIndices = this._items.map((_, i) => i);
    } else {
      this._filteredIndices = this._items
        .map((item, i) => ({ item, i }))
        .filter(({ item }) => item.text.toLowerCase().includes(query))
        .map(({ i }) => i);
    }

    const prevSelectedItemIndex = this._selectedIndex >= 0 && this._filteredIndices.length
      ? this._filteredIndices[this._selectedIndex]
      : -1;
    const needRebuild =
      !arraysEqual(this._filteredIndices, this._prevFilteredIndices) ||
      this._filteredIndices.length === 0;
    this._prevFilteredIndices = this._filteredIndices.slice();

    if (this._filteredIndices.length === 0) {
      this._selectedIndex = -1;
    } else {
      const keepSelection = prevSelectedItemIndex >= 0 && this._filteredIndices.includes(prevSelectedItemIndex);
      this._selectedIndex = keepSelection
        ? this._filteredIndices.indexOf(prevSelectedItemIndex)
        : 0;
    }

    if (needRebuild) this._rebuildRows();
    else this._updateSelection();
  }

  _rebuildRows() {
    if (!this._listContainer) return;
    this._listContainer.destroy_all_children();
    this._rows = [];

    const indices = this._filteredIndices;
    if (indices.length === 0) {
      const empty = new St.Label({
        style_class: 'clipboard-vault-empty',
        text: this._items.length === 0 ? 'No clipboard history yet' : 'No matching items',
      });
      this._listContainer.add_child(empty);
      return;
    }

    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      const item = this._items[idx];
      const preview = item.text.length > PREVIEW_MAX_LEN
        ? item.text.substring(0, PREVIEW_MAX_LEN) + '…'
        : item.text;
      const row = new St.BoxLayout({
        style_class: 'clipboard-vault-row',
        vertical: false,
        reactive: true,
        track_hover: true,
        x_expand: true,
        can_focus: true,
      });
      const rowAccessible = row.get_accessible?.();
      if (rowAccessible?.set_accessible_name) rowAccessible.set_accessible_name(preview);
      const previewLabel = new St.Label({
        style_class: 'clipboard-vault-row-preview',
        text: preview,
        ellipsize: 3,
        x_expand: true,
      });
      const tsLabel = new St.Label({
        style_class: 'clipboard-vault-row-timestamp',
        text: formatTimestamp(item.timestamp),
      });
      row.add_child(previewLabel);
      row.add_child(tsLabel);
      row._itemIndex = idx;
      row._listIndex = i;
      row.connect('button-press-event', (actor, event) => {
        if (event.get_button() === 1) this._activateIndex(actor._listIndex);
        return Clutter.EVENT_STOP;
      });
      this._listContainer.add_child(row);
      this._rows.push(row);
    }

    this._updateSelection();
  }

  _updateSelection() {
    this._rows.forEach((row, i) => {
      row.remove_style_class_name('clipboard-vault-row-selected');
      if (i === this._selectedIndex) row.add_style_class_name('clipboard-vault-row-selected');
    });
  }

  _activateIndex(listIndex) {
    if (this._items.length === 0 || this._filteredIndices.length === 0) return;
    const idx = this._filteredIndices[listIndex];
    if (idx == null) return;
    const item = this._items[idx];
    const text = item?.text;
    if (!text) return;

    console.log('[Clipboard Vault] activated:', text.substring(0, 40) + (text.length > 40 ? '…' : ''));
    try {
      const clipboard = St.Clipboard.get_default(CLIPBOARD_TYPE);
      clipboard.set_text(CLIPBOARD_TYPE, text);
      console.log('[Clipboard Vault] clipboard set success');
    } catch (e) {
      console.warn('[Clipboard Vault] clipboard set failed:', e.message);
    }
    if (CLOSE_AFTER_ACTIVATION) this.close();
  }

  _onKeyRelease(actor, event) {
    const key = event.get_key_symbol();
    if (key === Clutter.KEY_Escape) {
      this.close();
      return Clutter.EVENT_STOP;
    }
    if (key === Clutter.KEY_Up) {
      if (this._selectedIndex > 0) {
        this._selectedIndex--;
        this._updateSelection();
      }
      return Clutter.EVENT_STOP;
    }
    if (key === Clutter.KEY_Down) {
      if (this._selectedIndex < this._rows.length - 1) {
        this._selectedIndex++;
        this._updateSelection();
      }
      return Clutter.EVENT_STOP;
    }
    if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
      if (this._selectedIndex >= 0 && this._rows[this._selectedIndex]) {
        this._activateIndex(this._selectedIndex);
      }
      return Clutter.EVENT_STOP;
    }
    return Clutter.EVENT_PROPAGATE;
  }

  _trapFocus(actor, event) {
    const stage = global.stage;
    const focus = stage.get_key_focus();
    if (focus && this._actor && this._actor.contains(focus)) return Clutter.EVENT_PROPAGATE;
    this._searchEntry.grab_key_focus();
    return Clutter.EVENT_STOP;
  }

  open() {
    if (this._destroyed) return;
    if (!this._actor) this._build();
    if (!this._actor.get_parent()) {
      this._savedFocus = global.stage.get_key_focus();
      Main.uiGroup.add_child(this._actor);
      this._position();

      this._actor.opacity = 0;
      this._actor.set_scale(0.95, 0.95);
      this._actor.show();
      this._searchEntry.grab_key_focus();

      this._actor.ease({
        duration: ANIMATION_DURATION_MS,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        opacity: 255,
        scale_x: 1,
        scale_y: 1,
      });

      this._focusOutId = this._actor.connect('key-focus-out', (actor, event) => this._trapFocus(actor, event));

      console.log('[Clipboard Vault] popup open');
    }
  }

  close() {
    if (!this._actor || !this._actor.get_parent()) return;
    if (this._closeAnimation) return;

    if (this._focusOutId) {
      this._actor.disconnect(this._focusOutId);
      this._focusOutId = 0;
    }

    const parent = this._actor.get_parent();
    const savedFocus = this._savedFocus;

    this._closeAnimation = this._actor.ease({
      duration: ANIMATION_DURATION_MS,
      mode: Clutter.AnimationMode.EASE_IN_QUAD,
      opacity: 0,
      scale_x: 0.95,
      scale_y: 0.95,
      onComplete: () => {
        this._closeAnimation = null;
        parent.remove_child(this._actor);
        this._actor.hide();
        this._actor.opacity = 255;
        this._actor.set_scale(1, 1);
        if (savedFocus && savedFocus.get_stage()) savedFocus.grab_key_focus();
        console.log('[Clipboard Vault] popup close');
      },
    });
  }

  toggle() {
    if (this._actor && this._actor.get_parent()) this.close();
    else this.open();
  }

  _position() {
    const monitor = Main.layoutManager.primaryMonitor;
    const [minWidth, minHeight] = this._actor.get_preferred_size(-1, -1);
    const w = Math.max(minWidth, 320);
    const h = Math.min(minHeight, monitor.height - 80);
    this._actor.width = w;
    this._actor.height = h;
    this._actor.set_position(
      monitor.x + Math.floor((monitor.width - w) / 2),
      monitor.y + 40
    );
  }

  /**
   * @param {Array<{ text: string, timestamp: number, pinned?: boolean }>} items
   */
  setItems(items) {
    this._items = items || [];
    this._prevFilteredIndices = [];
    this._applyFilter();
  }

  destroy() {
    this._destroyed = true;
    if (this._closeAnimation) {
      this._actor?.remove_all_transitions?.();
      this._closeAnimation = null;
    }
    if (this._focusOutId && this._actor) {
      this._actor.disconnect(this._focusOutId);
      this._focusOutId = 0;
    }
    if (this._actor) {
      if (this._actor.get_parent()) this._actor.get_parent().remove_child(this._actor);
      this._actor.destroy();
      this._actor = null;
    }
    if (this._savedFocus && this._savedFocus.get_stage()) this._savedFocus.grab_key_focus();
    this._searchEntry = null;
    this._listContainer = null;
    this._scrollView = null;
    this._rows = [];
  }
}
