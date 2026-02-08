/**
 * Clipboard Vault preferences — Libadwaita GTK4.
 * Binds to GSettings: max-items, persist-history, ignore-password-like, shortcut.
 * Clear History increments clear-history-trigger; extension clears store and file.
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ClipboardVaultPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    const page = new Adw.PreferencesPage({ title: 'General', icon_name: 'emblem-documents-symbolic' });
    window.add(page);

    // ——— History group ———
    const historyGroup = new Adw.PreferencesGroup({
      title: 'History',
      description: 'Limit and persistence of clipboard history.',
    });

    const maxRow = new Adw.SpinRow({
      title: 'Maximum items',
      subtitle: 'Cap the number of entries kept (5–200).',
      adjustment: new Gtk.Adjustment({ lower: 5, upper: 200, step_increment: 5, value: 50 }),
    });
    settings.bind('max-items', maxRow, 'value', Gio.SettingsBindFlags.DEFAULT);

    const persistRow = new Adw.SwitchRow({
      title: 'Persist history on disk',
      subtitle: 'Save history so it survives restarts.',
    });
    settings.bind('persist-history', persistRow, 'active', Gio.SettingsBindFlags.DEFAULT);

    const ignorePasswordRow = new Adw.SwitchRow({
      title: 'Ignore password-like text',
      subtitle: 'Do not store text that looks like a password (conservative heuristic).',
    });
    settings.bind('ignore-password-like', ignorePasswordRow, 'active', Gio.SettingsBindFlags.DEFAULT);

    const clearRow = new Adw.ActionRow({
      title: 'Clear history',
      subtitle: 'Remove all entries from history and delete the saved file.',
    });
    const clearBtn = new Gtk.Button({ label: 'Clear' });
    clearBtn.add_css_class('destructive-action');
    clearBtn.connect('clicked', () => {
      const v = settings.get_int('clear-history-trigger');
      settings.set_int('clear-history-trigger', v + 1);
    });
    clearRow.add_suffix(clearBtn);
    clearRow.set_activatable_widget(clearBtn);

    historyGroup.add(maxRow);
    historyGroup.add(persistRow);
    historyGroup.add(ignorePasswordRow);
    historyGroup.add(clearRow);
    page.add(historyGroup);

    // ——— Shortcut group ———
    const shortcutGroup = new Adw.PreferencesGroup({
      title: 'Shortcut',
      description: 'Keybinding to open the clipboard popup. Use format like &lt;Super&gt;v or &lt;Super&gt;&lt;Shift&gt;v. Changes apply after the extension is toggled or Shell is reloaded. If the shortcut does nothing, try Super+Shift+V or disable another extension that uses the same key.',
    });

    const enableKeybindingsRow = new Adw.SwitchRow({
      title: 'Enable keyboard shortcut',
      subtitle: 'When disabled, the shortcut is not registered.',
    });
    settings.bind('enable-keybindings', enableKeybindingsRow, 'active', Gio.SettingsBindFlags.DEFAULT);

    const shortcutRow = new Adw.EntryRow({
      title: 'Keyboard shortcut',
    });
    const current = settings.get_strv('shortcut');
    shortcutRow.text = (current && current[0]) ? current[0] : '<Super>v';
    shortcutRow.connect('notify::text', () => {
      const t = (shortcutRow.text || '').trim();
      settings.set_strv('shortcut', t ? [t] : []);
    });

    shortcutGroup.add(enableKeybindingsRow);
    shortcutGroup.add(shortcutRow);
    page.add(shortcutGroup);
  }
}
