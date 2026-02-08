# Clipboard Vault — Panel icon opens popover (patch notes)

## STEP 0 — Root cause (tooltip-only behavior)

- **Search for "Open clipboard history"**: This string does **not** appear anywhere in the codebase. The only tooltip in the project was `set_tooltip_text('Clipboard history')` in `indicator.js` (previously around line 49). The text "Open clipboard history" was likely:
  - From GNOME Shell’s default behavior for the panel button (e.g. accessibility label or first menu item), or
  - From an older/cached build of the extension still loaded by the session.
- **Panel icon implementation**: The indicator was already a `PanelMenu.Button` with `super(0.0, null, false)`, icon as child, and content added via `addMenuItem` (search row + list section). The problems were:
  1. **Tooltip** was set, so the system could show a tooltip instead of opening the menu on click (or in addition to it).
  2. **No explicit click handler**: Relying only on the default panel button behavior could result in tooltip-only on some setups. There was no guaranteed “click → open menu” path and no logging to confirm clicks.
- **Conclusion**: Tooltip was removed entirely. A **explicit `button-press-event` handler** was added so that a left click always toggles the menu (open/close) and logs that the indicator was clicked and whether the menu is opening or closing.

---

## Changes made

### indicator.js (rebuilt)
- **No tooltip**: Removed `set_tooltip_text` completely.
- **Click toggles menu**: Connected to `button-press-event` (button 1). If menu is open → `menu.close()`. If closed → `_refreshList()`, `menu.open(true)`, then focus search. Handler returns `Clutter.EVENT_STOP` so the panel icon click reliably opens/closes the popover.
- **Logging**: `[Clipboard Vault] indicator clicked`, `[Clipboard Vault] menu opening`, `[Clipboard Vault] menu closing (toggle)`, `[Clipboard Vault] menu opened`, `[Clipboard Vault] menu closing` (from `open-state-changed`).
- **Esc closes menu**: `key-release-event` on `menu.actor` for `Clutter.KEY_Escape` → `menu.close()`.
- **onActivateItem**: Constructor takes `onActivateItem(text)`. On row activate, that callback is invoked (extension sets clipboard) and menu closes.
- **Cleanup**: `destroy()` disconnects `open-state-changed`, search `text-changed`, and menu `key-release-event`; nulls refs; then `super.destroy()`.

### extension.js
- **Status area id**: `addToStatusArea('clipboard-vault', this._indicator, 0, 'right')`.
- **Indicator creation**: Passes `onActivateItem(text)` that uses `St.Clipboard.get_default().set_text()` to set clipboard content. Imported `St` for clipboard API.

### stylesheet.css
- Panel menu: `.clipboard-vault-menu-search` min-width/padding; `.clipboard-vault-empty` and row preview/timestamp in `.popup-menu-content`; `.clipboard-vault-popover .popup-menu-content` min-width 320px and padding.

### popup.js
- Unchanged. Still used for the Win+V-style floating popup if you use that path; panel UI is self-contained in the indicator.

---

## Verification commands

1. **Disable then enable the extension**
   ```bash
   gnome-extensions disable clipboard-vault@avnixm.github.io
   gnome-extensions enable clipboard-vault@avnixm.github.io
   ```
   Then **restart GNOME Shell** so the new code loads (required after code changes):
   - **Wayland**: log out and log back in, or reboot.
   - **X11**: `Alt+F2`, type `r`, Enter.

2. **Watch logs**
   ```bash
   journalctl -f -o cat /usr/bin/gnome-shell
   ```
   Or if your session logs to a different unit:
   ```bash
   journalctl -f -o cat | grep -E 'Clipboard Vault|gnome-shell'
   ```
   Click the panel icon: you should see `[Clipboard Vault] indicator clicked` and then `[Clipboard Vault] menu opening` / `[Clipboard Vault] menu opened` (and on close, `menu closing`).

---

## Verification checklist

- [ ] **Click icon → popover opens under icon (not a tooltip)**  
  One click opens the menu; no “Open clipboard history” tooltip as the only response.
- [ ] **Popover shows list**  
  Search entry at top; below it, history list (or “No clipboard history yet” when empty).
- [ ] **Copy text → reopen popover → new item appears**  
  Copy something, open the popover again; the new copy is at the top.
- [ ] **Click item → clipboard changes and popover closes**  
  Selecting a row sets the clipboard to that item and closes the menu.
- [ ] **Esc closes**  
  Pressing Esc closes the popover.
- [ ] **Disable removes icon with no errors**  
  Disable the extension; panel icon disappears and `journalctl` shows no relevant errors.

---

## Files touched

- `indicator.js` — rewritten (click handler, no tooltip, logging, Esc, cleanup, onActivateItem).
- `extension.js` — status area id `clipboard-vault`, St import, onActivateItem callback.
- `stylesheet.css` — panel menu width/padding and popover class.
- `PATCH_NOTES.md` — this file (STEP 0 report + verification).

No new file (e.g. `popoverContent.js`); the panel UI stays inside the indicator via `addMenuItem` (search row + list section).
