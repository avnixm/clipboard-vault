/**
 * ClipboardPopoverContent — Adwaita-style popover UI for clipboard history.
 * Single component: search + scroll list. No invalid St properties (no spacing on BoxLayout, no ellipsize on Label constructor).
 * Truncation via clutter_text / set_ellipsize after creation. Spacing via CSS only.
 */

import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

const PREVIEW_MAX_LEN = 48;
const MAX_VISIBLE_ITEMS = 30;

function formatTimestamp(ts) {
  const now = Date.now();
  const d = (now - ts) / 1000;
  if (d < 60) return 'now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 172800) return 'Yesterday';
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function setLabelEllipsize(label) {
  try {
    if (typeof label.set_ellipsize === 'function') {
      label.set_ellipsize(Pango.EllipsizeMode.END);
    }
    if (typeof label.set_single_line_mode === 'function') {
      label.set_single_line_mode(true);
    }
    const ct = label.clutter_text;
    if (ct) {
      if (typeof ct.set_ellipsize === 'function') ct.set_ellipsize(Pango.EllipsizeMode.END);
      if (typeof ct.set_single_line_mode === 'function') ct.set_single_line_mode(true);
    }
  } catch (_e) {}
}

export class ClipboardPopoverContent {
  /**
   * @param {Object} opts
   * @param {(text: string) => void} [opts.onActivateItem]
   * @param {(text: string, pinned: boolean) => void} [opts.onSetPinned]
   * @param {(text: string, favorite: boolean) => void} [opts.onSetFavorite]
   * @param {() => void} [opts.onClose]
   */
  constructor(opts = {}) {
    this._onActivateItem = opts.onActivateItem || null;
    this._onSetPinned = opts.onSetPinned || null;
    this._onSetFavorite = opts.onSetFavorite || null;
    this._onClose = opts.onClose || null;
    this._items = [];
    this._query = '';
    this._searchEntry = null;
    this._listContainer = null;
    this._scrollView = null;
    this._actor = null;
    this._keyId = 0;
    this._destroyed = false;
  }

  get actor() {
    if (!this._actor) this._build();
    return this._actor;
  }

  _build() {
    const container = new St.BoxLayout({
      vertical: true,
      style_class: 'clipboard-vault-popover-content',
    });
    this._actor = container;

    const searchBox = new St.BoxLayout({
      vertical: false,
      style_class: 'clipboard-vault-search-box',
    });
    const searchIcon = new St.Icon({
      style_class: 'clipboard-vault-search-icon',
      icon_name: 'system-search-symbolic',
    });
    this._searchEntry = new St.Entry({
      style_class: 'clipboard-vault-search-entry',
      hint_text: 'Search…',
      can_focus: true,
      x_expand: true,
    });
    searchBox.add_child(searchIcon);
    searchBox.add_child(this._searchEntry);
    container.add_child(searchBox);

    this._listContainer = new St.BoxLayout({
      vertical: true,
      style_class: 'clipboard-vault-list-box',
    });
    this._scrollView = new St.ScrollView({
      style_class: 'clipboard-vault-scroll',
      overlay_scrollbars: true,
      x_expand: true,
      y_expand: true,
    });
    this._scrollView.add_child(this._listContainer);
    container.add_child(this._scrollView);

    this._searchEntry.clutter_text.connect('text-changed', () => {
      this._query = (this._searchEntry.get_text() || '').trim().toLowerCase();
      this._rebuildList();
    });

    this._keyId = container.connect('key-release-event', (actor, event) => {
      if (event.get_key_symbol() === Clutter.KEY_Escape) {
        if (this._onClose) this._onClose();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });
  }

  setQuery(text) {
    this._query = (text || '').trim().toLowerCase();
    if (this._searchEntry) this._searchEntry.set_text(this._query);
    this._rebuildList();
  }

  setItems(items) {
    this._items = Array.isArray(items) ? items.filter((e) => e && typeof e.text === 'string') : [];
    this._rebuildList();
  }

  openFocus() {
    if (this._searchEntry) this._searchEntry.grab_key_focus();
  }

  _rebuildList() {
    if (!this._listContainer || this._destroyed) return;

    this._listContainer.destroy_all_children();

    const query = this._query || '';
    const filtered = query
      ? this._items.filter((e) => String(e.text).toLowerCase().includes(query))
      : this._items;
    const toShow = filtered.slice(0, MAX_VISIBLE_ITEMS);

    if (toShow.length === 0) {
      const empty = new St.Label({
        style_class: 'clipboard-vault-empty-state',
        text: this._items.length === 0 ? 'No clipboard history yet' : 'No matching items',
      });
      this._listContainer.add_child(empty);
      return;
    }

    for (const item of toShow) {
      const text = String(item.text || '');
      const ts = typeof item.timestamp === 'number' ? item.timestamp : Date.now();
      const row = new St.BoxLayout({
        vertical: false,
        style_class: 'clipboard-vault-action-row',
        reactive: true,
        track_hover: true,
        x_expand: true,
      });

      const leftBox = new St.BoxLayout({
        vertical: false,
        x_expand: true,
        style_class: 'clipboard-vault-row-left',
      });
      const primaryLabel = new St.Label({
        style_class: 'clipboard-vault-row-title',
        text: text,
        x_expand: true,
      });
      setLabelEllipsize(primaryLabel);
      leftBox.add_child(primaryLabel);
      row.add_child(leftBox);

      const rightBox = new St.BoxLayout({
        vertical: false,
        style_class: 'clipboard-vault-row-right',
      });
      const tsLabel = new St.Label({
        style_class: 'clipboard-vault-row-time',
        text: formatTimestamp(ts),
      });
      rightBox.add_child(tsLabel);

      const pinBtn = new St.Icon({
        style_class: 'clipboard-vault-icon-btn',
        icon_name: 'view-pin-symbolic',
        reactive: true,
        track_hover: true,
      });
      if (item.pinned) pinBtn.add_style_class_name('clipboard-vault-pinned-on');
      pinBtn.connect('button-press-event', (actor, event) => {
        if (event.get_button() !== 1) return Clutter.EVENT_PROPAGATE;
        if (this._onSetPinned) this._onSetPinned(text, !item.pinned);
        return Clutter.EVENT_STOP;
      });

      const favBtn = new St.Icon({
        style_class: 'clipboard-vault-icon-btn',
        icon_name: item.favorite ? 'starred-symbolic' : 'non-starred-symbolic',
        reactive: true,
        track_hover: true,
      });
      if (item.favorite) favBtn.add_style_class_name('clipboard-vault-fav-on');
      favBtn.connect('button-press-event', (actor, event) => {
        if (event.get_button() !== 1) return Clutter.EVENT_PROPAGATE;
        if (this._onSetFavorite) this._onSetFavorite(text, !item.favorite);
        return Clutter.EVENT_STOP;
      });

      rightBox.add_child(pinBtn);
      rightBox.add_child(favBtn);
      row.add_child(rightBox);

      row.connect('button-press-event', (actor, event) => {
        if (event.get_button() !== 1) return Clutter.EVENT_PROPAGATE;
        if (this._onActivateItem) this._onActivateItem(text);
        if (this._onClose) this._onClose();
        return Clutter.EVENT_STOP;
      });

      this._listContainer.add_child(row);
    }

    if (filtered.length > MAX_VISIBLE_ITEMS) {
      const more = new St.Label({
        style_class: 'clipboard-vault-row-more',
        text: `(${filtered.length - MAX_VISIBLE_ITEMS} more…)`,
      });
      this._listContainer.add_child(more);
    }
  }

  destroy() {
    this._destroyed = true;
    if (this._keyId && this._actor) {
      this._actor.disconnect(this._keyId);
      this._keyId = 0;
    }
    this._onActivateItem = null;
    this._onSetPinned = null;
    this._onSetFavorite = null;
    this._onClose = null;
    this._searchEntry = null;
    this._listContainer = null;
    this._scrollView = null;
    if (this._actor) {
      this._actor.destroy();
      this._actor = null;
    }
  }
}
