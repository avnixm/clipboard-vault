# Clipboard Vault — Test plan and root cause

## PART 1 — Root cause: why clipboard items were not showing

Diagnosis of the data flow:

1. **Clipboard capture**  
   `clipboardPoller.js` uses `GLib.timeout_add` (600 ms) and calls `St.Clipboard.get_default(CLIPBOARD_TYPE)` then `get_text(CLIPBOARD_TYPE, callback)`.

2. **Exact break**  
   **`St.Clipboard.get_default()` was called with an argument** (`CLIPBOARD_TYPE`). In GNOME Shell / GJS, the correct API is **`St.Clipboard.get_default()` with no arguments**. The clipboard type is passed only to `get_text(type, callback)`.  
   Using `get_default(CLIPBOARD_TYPE)` could return a wrong object or behave in an undefined way, so the async `get_text` callback might never run or might receive no text. As a result:
   - The poller callback rarely/never fired with new text.
   - `lastSeenText` was never updated, or the callback never ran.
   - `store.addText()` was never (or almost never) called.
   - The popup list stayed empty because the store stayed empty.

3. **Popup refresh path**  
   The UI path was correct: `extension.js` calls `indicator.setItems()` in the store’s `onChange`; the indicator’s `_refreshList()` uses `_getItems()` to read from the store. So the only fix needed for “items not showing” was making the **poller actually deliver clipboard text** by using `St.Clipboard.get_default()` (no arg) and passing the type only to `get_text()`.

4. **Fixes applied**  
   - Poller: `this._clipboard = St.Clipboard.get_default()` (no argument).  
   - Guard: `_pending` and `_stopped` so callbacks don’t overlap and `stop()` prevents late callbacks after disable.  
   - Logging: poll tick when clipboard changed (first 40 chars), store.addText + size, popup setItems + count, list render finished + row count.

---

## Commands to test and view logs

**Enable / disable**
```bash
gnome-extensions disable clipboard-vault@avnixm.github.io
gnome-extensions enable clipboard-vault@avnixm.github.io
```
Then restart GNOME Shell (Wayland: log out/in; X11: Alt+F2 → `r` → Enter).

**Follow logs**
```bash
journalctl -f -o cat /usr/bin/gnome-shell 2>&1 | grep -E 'Clipboard Vault|clipboard-vault'
```
Or:
```bash
journalctl -f -o cat 2>&1 | grep 'Clipboard Vault'
```

You should see: `enable()`, `poller started`, `loaded pinned/favorite`, `loaded history` / `merged initial entries`, then when copying: `poll tick clipboard changed`, `store.addText done, size=N`, and when opening the popup: `popup setItems called, count=N`, `list render finished, rows=N`.

---

## Test checklist (explicit)

- [ ] **Enable extension → open popup → shows persisted pinned section (if any)**  
  Enable, open popup. If you had pinned/favorite items before, they appear at the top after restart.

- [ ] **Copy text → appears in list**  
  Copy any text. Open popup. The new item appears at the top of the list (or under pinned/favorite).

- [ ] **Copy text while popup is open → appears without closing**  
  Open popup, then copy new text in another app. The list updates and the new item appears without closing/reopening.

- [ ] **Copy another → appears at top**  
  Copy a second string. Open popup. Both appear; the most recent is at the top (of the recents section).

- [ ] **Copy same text again → no duplicate; moves to top; pinned/favorite preserved**  
  Copy the same string again. List still has one entry for it; it moves to top of recents; if it was pinned or favorited, it stays pinned/favorited.

- [ ] **Pin an item → moves into pinned section**  
  Open popup, click the pin icon on a row. The row moves to the pinned section at the top.

- [ ] **Favorite an item → moves into favorite section**  
  Click the star icon. The row moves to the favorite section (below pinned, above recents).

- [ ] **Restart GNOME Shell (or logout/login) → pinned/favorite still present**  
  Restart Shell or log out and back in. Open popup. Pinned and favorite items are still there.

- [ ] **Disable → no further captures**  
  Disable the extension. Copy text. Re-enable and open popup: that copy may appear only after re-enable (poller was stopped).

- [ ] **Re-enable → works again**  
  Re-enable. Open popup; history (and pinned/favorite) load; copying still adds items.

---

## Files changed (deliverables)

| File | Changes |
|------|--------|
| **historyStore.js** | Entry shape includes `pinned`, `favorite`. Ordering: pinned → favorite → recents. `setPinned(text, pinned)`, `setFavorite(text, favorite)`. Dedupe preserves pinned/favorite. `getPinnedAndFavoriteEntries()`. |
| **clipboardPoller.js** | `St.Clipboard.get_default()` (no arg). Guard `_pending`/`_stopped`; `stop()` clears source and state. Log on clipboard change. |
| **storage.js** | `getPinnedPath(uuid)`, `loadPinned(path)`, `savePinned(path, entries)`, `deletePinned(path)`. Atomic write; corrupted JSON → log and return []. |
| **indicator.js** | `refreshFromStore()` (logs setItems + list render). Pin/favorite toggle per row; `onSetPinned`, `onSetFavorite` callbacks. |
| **extension.js** | Load pinned + history; merge by text (pinned first); create store. On change: setItems, save history (if persist), save pinned (debounced). Disable: flush both debounces, stop poller, destroy indicator. |
| **stylesheet.css** | `.clipboard-vault-row-action`, `.clipboard-vault-pinned-on`, `.clipboard-vault-fav-on`. |

popup.js was not changed (Win+V floating popup unchanged). This test plan and root cause are in TEST_PLAN.md.
