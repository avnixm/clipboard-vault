/**
 * Panel icon: PanelMenu.Button. Click opens popover under icon with clipboard UI.
 * No tooltip. Toggle on click; content = search + list in menu; Esc/outside close.
 */

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const PREVIEW_MAX_LEN = 45;
const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;
const MAX_VISIBLE_ITEMS = 20;

function formatTimestamp(ts) {
  const now = Date.now();
  const d = (now - ts) / 1000;
  if (d < 60) return 'now';
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  if (d < 172800) return 'Yesterday';
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export class ClipboardVaultIndicator extends PanelMenu.Button {
  static {
    GObject.registerClass(this);
  }

  constructor(extensionDir, getItems, onActivateItem) {
    super(0.0, null, false);

    this._getItems = getItems;
    this._onActivateItem = onActivateItem;
    this._searchEntry = null;
    this._searchQuery = '';
    this._historyMenuItems = [];
    this._listSection = null;
    this._openStateChangedId = 0;
    this._searchChangedId = 0;
    this._keyReleaseId = 0;

    const iconPath = extensionDir + '/clipboard-list.png';
    const file = Gio.File.new_for_path(iconPath);
    const icon = file.query_exists(null)
      ? new St.Icon({ gicon: Gio.FileIcon.new(file), style_class: 'system-status-icon' })
      : new St.Icon({ icon_name: 'edit-copy-symbolic', style_class: 'system-status-icon' });

    this.add_child(icon);

    this._openStateChangedId = this.menu.connect('open-state-changed', () => {
      if (this.menu.isOpen) {
        console.log('[Clipboard Vault] menu opened');
        this._refreshList();
        if (this._searchEntry) this._searchEntry.grab_key_focus();
      } else {
        console.log('[Clipboard Vault] menu closing');
      }
    });

    const searchRow = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
    this._searchEntry = new St.Entry({
      style_class: 'clipboard-vault-menu-search',
      hint_text: 'Search…',
      can_focus: true,
      x_expand: true,
    });
    this._searchChangedId = this._searchEntry.clutter_text.connect('text-changed', () => {
      this._searchQuery = (this._searchEntry.get_text() || '').trim().toLowerCase();
      this._refreshList();
    });
    searchRow.add_child(this._searchEntry);
    this.menu.addMenuItem(searchRow);

    this.menu.actor.add_style_class_name('clipboard-vault-popover');
    this._listSection = new PopupMenu.PopupMenuSection();
    this.menu.addMenuItem(this._listSection);

    this._keyReleaseId = this.menu.actor.connect('key-release-event', (actor, event) => {
      const key = event.get_key_symbol();
      if (key === Clutter.KEY_Escape) {
        this.menu.close();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });

    this.connect('button-press-event', (actor, event) => {
      if (event.get_button() !== 1) return Clutter.EVENT_PROPAGATE;
      console.log('[Clipboard Vault] indicator clicked');
      if (this.menu.isOpen) {
        console.log('[Clipboard Vault] menu closing (toggle)');
        this.menu.close();
      } else {
        console.log('[Clipboard Vault] menu opening');
        this._refreshList();
        this.menu.open(true);
        if (this._searchEntry) this._searchEntry.grab_key_focus();
      }
      return Clutter.EVENT_STOP;
    });

    this._refreshList();
  }

  _refreshList() {
    if (!this._listSection) return;

    this._listSection.removeAll();

    const items = this._getItems ? this._getItems() : [];
    const query = this._searchQuery || '';
    const filtered = query
      ? items.filter((e) => e.text.toLowerCase().includes(query))
      : items;
    const toShow = filtered.slice(0, MAX_VISIBLE_ITEMS);

    if (toShow.length === 0) {
      const emptyItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
      emptyItem.actor.add_child(new St.Label({
        style_class: 'clipboard-vault-empty',
        text: items.length === 0 ? 'No clipboard history yet' : 'No matching items',
      }));
      this._listSection.addMenuItem(emptyItem);
      this._historyMenuItems = [];
      return;
    }

    this._historyMenuItems = [];
    for (const item of toShow) {
      const preview = item.text.length > PREVIEW_MAX_LEN
        ? item.text.substring(0, PREVIEW_MAX_LEN) + '…'
        : item.text;
      const menuItem = new PopupMenu.PopupBaseMenuItem();
      const box = new St.BoxLayout({ vertical: false, x_expand: true });
      const labelActor = new St.Label({
        style_class: 'clipboard-vault-row-preview',
        text: preview,
        ellipsize: 3,
        x_expand: true,
      });
      const tsActor = new St.Label({
        style_class: 'clipboard-vault-row-timestamp',
        text: formatTimestamp(item.timestamp),
      });
      box.add_child(labelActor);
      box.add_child(tsActor);
      menuItem.actor.add_child(box);

      const textToCopy = item.text;
      const onActivate = this._onActivateItem;
      menuItem.connect('activate', () => {
        if (onActivate) onActivate(textToCopy);
        this.menu.close();
      });

      this._listSection.addMenuItem(menuItem);
      this._historyMenuItems.push(menuItem);
    }

    if (filtered.length > MAX_VISIBLE_ITEMS) {
      const moreItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
      moreItem.actor.add_child(new St.Label({
        text: `(${filtered.length - MAX_VISIBLE_ITEMS} more…)`,
        style_class: 'clipboard-vault-empty',
      }));
      this._listSection.addMenuItem(moreItem);
    }
  }

  setItems() {
    this._refreshList();
  }

  destroy() {
    if (this._openStateChangedId && this.menu) {
      this.menu.disconnect(this._openStateChangedId);
      this._openStateChangedId = 0;
    }
    if (this._searchChangedId && this._searchEntry?.clutter_text) {
      this._searchEntry.clutter_text.disconnect(this._searchChangedId);
      this._searchChangedId = 0;
    }
    if (this._keyReleaseId && this.menu?.actor) {
      this.menu.actor.disconnect(this._keyReleaseId);
      this._keyReleaseId = 0;
    }
    this._getItems = null;
    this._onActivateItem = null;
    this._searchEntry = null;
    this._historyMenuItems = [];
    this._listSection = null;
    super.destroy();
  }
}
