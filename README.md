# Clipboard Vault

GNOME Shell extension: clipboard history with a Win+V-style popup. Persist history to disk, search, keyboard shortcut (default **Super+V**). ESModules, GNOME 45+.

---

## Install

### From source (local)

1. Copy the extension directory into the GNOME extensions folder (use the **exact** UUID as the folder name):

   ```bash
   mkdir -p ~/.local/share/gnome-shell/extensions
   cp -r clipboard-vault@example.com ~/.local/share/gnome-shell/extensions/
   ```

2. Compile GSettings schemas:

   ```bash
   cd ~/.local/share/gnome-shell/extensions/clipboard-vault@example.com
   glib-compile-schemas schemas/
   ```

3. Enable the extension:

   ```bash
   gnome-extensions enable clipboard-vault@example.com
   ```

   On **X11** you can reload Shell: **Alt+F2** → type `r` → Enter. On **Wayland**, log out and back in (or use a nested session to test).

### From ZIP

1. Build the ZIP (see [Packaging](#packaging) below).
2. In GNOME Extensions (https://extensions.gnome.org/local/) or via CLI:

   ```bash
   gnome-extensions install clipboard-vault@example.com.zip --force
   cd ~/.local/share/gnome-shell/extensions/clipboard-vault@example.com
   glib-compile-schemas schemas/
   gnome-extensions enable clipboard-vault@example.com
   ```

---

## Usage

- **Shortcut:** **Super+V** (or the shortcut set in preferences) opens and closes the clipboard history popup.
- **Popup:** Search box at the top; list of recent clipboard entries below with timestamps (e.g. “2m”, “1h”, “Yesterday”).
- **Keyboard:** **Up/Down** to move selection, **Enter** to copy the selected item to the clipboard and close the popup. **Escape** closes without copying.
- **Mouse:** Click an entry to copy it to the clipboard and close the popup.
- **Preferences:** Run `gnome-extensions prefs clipboard-vault@example.com` (or open from the Extensions app) to set max history items, persistence, “ignore password-like text”, shortcut, and **Clear history**.

---

## Preferences

- **Maximum items** — Cap on number of entries (5–200).
- **Persist history on disk** — Save history under `~/.local/share/clipboard-vault@example.com/history.json` so it survives restarts.
- **Ignore password-like text** — Do not store text that looks like a password (conservative heuristic).
- **Keyboard shortcut** — Keybinding to toggle the popup (e.g. `<Super>v` or `<Super><Shift>v`). Changes apply after toggling the extension or reloading Shell.
- **Clear history** — Removes all entries and deletes the saved file; the extension reacts immediately.

---

## Development

### Folder layout

| File / folder | Purpose |
|---------------|--------|
| **metadata.json** | UUID, name, description, **shell-version** (supported versions), **version**, **settings-schema**. |
| **extension.js** | Entry point; `enable()` / `disable()`. |
| **stylesheet.css** | Popup and list styling. |
| **prefs.js** | Libadwaita preferences window (GTK4). |
| **historyStore.js** | In-memory history store. |
| **clipboardPoller.js** | Clipboard polling. |
| **popup.js** | Popup UI and behavior. |
| **storage.js** | Load/save/delete history JSON. |
| **util.js** | Debounce and password heuristic. |
| **schemas/*.gschema.xml** | GSettings schema; must be compiled. |

### Commands

```bash
# Enable / disable
gnome-extensions enable clipboard-vault@example.com
gnome-extensions disable clipboard-vault@example.com

# Reload Shell (X11 only)
# Alt+F2 → r → Enter

# Logs (all Shell)
journalctl -f -o cat /usr/bin/gnome-shell

# Logs (extension only)
journalctl -f -o cat /usr/bin/gnome-shell 2>&1 | grep -E 'Clipboard Vault|clipboard-vault'

# Open preferences
gnome-extensions prefs clipboard-vault@example.com

# Nested Wayland (test without logging out)
dbus-run-session -- gnome-shell --wayland --nested
```

### Schema (after editing schema or first install)

```bash
cd ~/.local/share/gnome-shell/extensions/clipboard-vault@example.com
glib-compile-schemas schemas/
```

---

## Packaging

Reproducible build:

1. **Clean** the extension directory (no build artifacts beyond `schemas/gschemas.compiled`).
2. **Compile schemas:**

   ```bash
   cd clipboard-vault@example.com
   glib-compile-schemas schemas/
   ```

3. **Create ZIP** (from the **parent** of the extension directory):

   **Option A — `gnome-extensions pack` (if available):**

   ```bash
   cd /path/to/clipboard-vault
   gnome-extensions pack clipboard-vault@example.com -f
   ```

   **Option B — Manual ZIP:**

   ```bash
   cd /path/to/clipboard-vault
   zip -r clipboard-vault@example.com.zip clipboard-vault@example.com \
     -x '*.git*' -x '*~' -x '*.swp'
   ```

4. **Verify** the ZIP contains:

   - `metadata.json`
   - `extension.js`
   - `popup.js`, `historyStore.js`, `clipboardPoller.js`, `storage.js`, `util.js`
   - `stylesheet.css`
   - `prefs.js`
   - `schemas/org.gnome.shell.extensions.clipboard-vault.gschema.xml`
   - `schemas/gschemas.compiled`
   - Optional: `clipboard-list.png` (or other icon) if you add one for the Extensions app

---

## Screenshots (extensions.gnome.org)

1. Start **nested** GNOME Shell:  
   `dbus-run-session -- gnome-shell --wayland --nested`
2. In the nested session, enable Clipboard Vault and press **Super+V** to open the popup.
3. Capture the window (e.g. Screenshot tool, or `gnome-screenshot -w`).
4. Use a clear, cropped image of the popup (and optionally the prefs window). Recommended size: 1280×720 or similar; avoid full desktop unless needed.

---

## Troubleshooting

| Problem | What to do |
|--------|------------|
| Extension not listed | Directory must be exactly `~/.local/share/gnome-shell/extensions/clipboard-vault@example.com`. Check `metadata.json` is valid and **shell-version** includes your Shell version. Run `gnome-extensions list`. |
| Enable fails / crash | Check logs: `journalctl -f -o cat /usr/bin/gnome-shell \| grep -E 'Clipboard Vault|Error|extension'`. Fix syntax and imports; ensure `export default class ... extends Extension`. |
| Keybinding does nothing | Run `glib-compile-schemas schemas/`. Try another shortcut, e.g. `gsettings set org.gnome.shell.extensions.clipboard-vault shortcut "['<Super><Shift>v']"`. Toggle extension or reload Shell. |
| Preferences don’t open | Run `glib-compile-schemas schemas/`. Ensure **settings-schema** in `metadata.json` matches the schema id. Debug: `gnome-extensions prefs clipboard-vault@example.com` and check terminal/journalctl for prefs process. |
| History not persisting | Ensure “Persist history on disk” is on in prefs. Check `~/.local/share/clipboard-vault@example.com/history.json` exists and is valid JSON after copying some text. |
| Clear history not working | Extension watches **clear-history-trigger** in GSettings; prefs increments it. If it still doesn’t clear, check logs for “history cleared” and that the extension is enabled. |

---

## extensions.gnome.org review pitfalls

- **shell-version:** Must list every Shell version you support (e.g. `["45","46","47","48","49"]`). Mismatch causes “incompatible” or no install.
- **Schema:** Include **schemas/** with both `.gschema.xml` and **gschemas.compiled** in the ZIP. Without compiled schema, keybinding and prefs can fail.
- **metadata.json:** Valid JSON; **uuid** must match the folder name and the ZIP’s inner folder name (e.g. `clipboard-vault@example.com`).
- **No external commands:** Don’t rely on `grep`, `xclip`, etc. Use GJS/St/Gio only so it works on Wayland and in sandboxed environments.
- **Descriptions:** Keep description and prefs labels clear so reviewers and users understand behavior and settings.

---

## Verification checklist (before upload)

- [ ] `metadata.json`: correct **uuid**, **name**, **description**, **shell-version**, **version**, **settings-schema**.
- [ ] `glib-compile-schemas schemas/` run; `schemas/gschemas.compiled` present in ZIP.
- [ ] ZIP contains all JS modules, **stylesheet.css**, **prefs.js**, and **schemas/**.
- [ ] Enable extension → popup opens with **Super+V**; select item → clipboard updates; close with **Escape**.
- [ ] Prefs open with `gnome-extensions prefs clipboard-vault@example.com`; toggles and Clear history work.
- [ ] With persistence on: add items, restart Shell (or session), confirm history reloaded.
- [ ] Corrupt `history.json` → extension still enables and falls back to empty history.
