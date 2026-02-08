/**
 * Panel icon: PanelMenu.Button. Click opens popover with clipboard UI.
 * Embeds ClipboardPopoverContent (Adwaita-style) into the menu.
 */

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { ClipboardPopoverContent } from './popoverContent.js';

export class ClipboardVaultIndicator extends PanelMenu.Button {
  static {
    GObject.registerClass(this);
  }

  constructor(extensionDir, getItems, onActivateItem, onSetPinned, onSetFavorite) {
    super(0.0, null, false);

    this._getItems = getItems;
    this._onActivateItem = onActivateItem;
    this._onSetPinned = onSetPinned;
    this._onSetFavorite = onSetFavorite;
    this._content = null;
    this._openStateChangedId = 0;
    this._keyReleaseId = 0;
    this._wrapperItem = null;

    const iconPath = extensionDir + '/clipboard-list.png';
    const file = Gio.File.new_for_path(iconPath);
    const icon = file.query_exists(null)
      ? new St.Icon({ gicon: Gio.FileIcon.new(file), style_class: 'system-status-icon' })
      : new St.Icon({ icon_name: 'edit-copy-symbolic', style_class: 'system-status-icon' });

    this.add_child(icon);

    this._content = new ClipboardPopoverContent({
      onActivateItem: (text) => {
        if (this._onActivateItem) this._onActivateItem(text);
        this.menu.close();
      },
      onSetPinned: (text, pinned) => {
        if (this._onSetPinned) this._onSetPinned(text, pinned);
      },
      onSetFavorite: (text, favorite) => {
        if (this._onSetFavorite) this._onSetFavorite(text, favorite);
      },
      onClose: () => this.menu.close(),
    });

    this.menu.actor.add_style_class_name('clipboard-vault-popover');
    this._wrapperItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
    this._wrapperItem.actor.add_child(this._content.actor);
    this.menu.addMenuItem(this._wrapperItem);

    this._openStateChangedId = this.menu.connect('open-state-changed', () => {
      if (this.menu.isOpen) {
        try {
          const items = this._getItems ? this._getItems() : [];
          this._content.setItems(items);
          this._content.setQuery('');
          this._content.openFocus();
        } catch (e) {
          console.warn('[Clipboard Vault] open refresh error:', e.message);
        }
      }
    });

    this._keyReleaseId = this.menu.actor.connect('key-release-event', (actor, event) => {
      if (event.get_key_symbol() === Clutter.KEY_Escape) {
        this.menu.close();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });

    this.connect('button-press-event', (actor, event) => {
      const button = event.get_button();
      if (button !== 1 && button !== 3) return Clutter.EVENT_PROPAGATE;
      try {
        const items = this._getItems ? this._getItems() : [];
        this._content.setItems(items);
        this._content.setQuery('');
      } catch (e) {
        console.warn('[Clipboard Vault] click refresh error:', e.message);
      }
      if (button === 1) return Clutter.EVENT_PROPAGATE;
      if (button === 3) {
        if (!this.menu.isOpen) this.menu.open(true);
        this._content.openFocus();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });
  }

  setItems() {
    if (!this._content) return;
    try {
      const items = this._getItems ? this._getItems() : [];
      this._content.setItems(items);
    } catch (e) {
      console.warn('[Clipboard Vault] setItems error:', e.message);
    }
  }

  destroy() {
    if (this._openStateChangedId && this.menu) {
      this.menu.disconnect(this._openStateChangedId);
      this._openStateChangedId = 0;
    }
    if (this._keyReleaseId && this.menu?.actor) {
      this.menu.actor.disconnect(this._keyReleaseId);
      this._keyReleaseId = 0;
    }
    this._content?.destroy();
    this._content = null;
    this._wrapperItem = null;
    this._getItems = null;
    this._onActivateItem = null;
    this._onSetPinned = null;
    this._onSetFavorite = null;
    super.destroy();
  }
}
