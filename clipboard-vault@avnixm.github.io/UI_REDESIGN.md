# Clipboard Vault — UI redesign (Adwaita-style, GNOME 49.3)

## Summary

- **popoverContent.js**: New `ClipboardPopoverContent` component. Search + scroll list; no `spacing` on St.BoxLayout, no `ellipsize` in St.Label constructor. Truncation via `set_ellipsize(Pango.EllipsizeMode.END)` and `set_single_line_mode(true)` on the label/clutter_text after creation.
- **indicator.js**: Embeds `ClipboardPopoverContent` in a single `PopupBaseMenuItem`; on open/click calls `setItems()`, `setQuery('')`, `openFocus()`.
- **stylesheet.css**: Adwaita-like popover (rounded 16px, shadow, padding), search bar, action rows (48px min-height, hover/selected), icon buttons, empty state. No hard-coded dark colors; uses `inherit`/opacity for theme.
- **extension.js**: No changes.

## Test checklist (GNOME 49.3)

- [ ] **No invalid property warnings**  
  `journalctl -f -o cat /usr/bin/gnome-shell 2>&1 | grep -E 'Clipboard Vault|Error|No property'`  
  Must not show "No property spacing on StBoxLayout" or "No property ellipsize on StLabel".

- [ ] **Open popup → search focused**  
  Click panel icon; popup opens; search field has focus.

- [ ] **List rows truncate**  
  Long clipboard text shows one line with ellipsis (…).

- [ ] **Hover/selected states**  
  Row hover: subtle background; selected/focus: stronger highlight; row corners rounded.

- [ ] **Pin/favorite**  
  Pin and star icons toggle state; active state visible (pin blue, star yellow); clicking them does not activate the row.

- [ ] **Esc closes**  
  Pressing Esc closes the popup.

- [ ] **HiDPI**  
  UI is crisp (no blurry icons/text).

- [ ] **Theme**  
  Popup respects light/dark (colors inherit from shell theme).
