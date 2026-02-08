/**
 * In-memory clipboard history store.
 * O(1) dedupe via _byText Map.
 * Entry shape: { id, text, timestamp, pinned, favorite }
 * Ordering: pinned first, then favorite, then recents (newest first).
 * Dedupe: re-copying same text updates timestamp and moves to top; preserves pinned/favorite.
 */

const MAX_ITEMS_DEFAULT = 50;

export class HistoryStore {
  /**
   * @param {number} [maxItems=50]
   * @param {Array<{ id?: number, text: string, timestamp: number, pinned?: boolean, favorite?: boolean }>} [initialEntries=[]]
   */
  constructor(maxItems = MAX_ITEMS_DEFAULT, initialEntries = []) {
    this._maxItems = Math.max(1, maxItems);
    this._items = [];
    this._byText = new Map();
    this._nextId = 1;

    for (const e of initialEntries || []) {
      if (e && typeof e.text === 'string' && e.text.trim()) {
        const text = e.text.trim();
        const entry = {
          id: typeof e.id === 'number' ? e.id : this._nextId++,
          text,
          timestamp: typeof e.timestamp === 'number' ? e.timestamp : Date.now(),
          pinned: !!e.pinned,
          favorite: !!e.favorite,
        };
        if (entry.id >= this._nextId) this._nextId = entry.id + 1;
        this._items.push(entry);
        this._byText.set(text, entry);
      }
    }
    this._prune();
    this._sortOrder();
    this._onChange = null;
  }

  setMaxItems(n) {
    this._maxItems = Math.max(1, n);
    this._prune();
    this._sortOrder();
    if (this._onChange) this._onChange();
  }

  /**
   * @param {string} text
   * @returns {boolean} true if the list changed
   */
  addText(text) {
    if (text == null || typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (!trimmed) return false;

    const existing = this._byText.get(trimmed);
    if (existing) {
      existing.timestamp = Date.now();
      this._moveToFrontOfRecents(existing);
      if (this._onChange) this._onChange();
      return true;
    }

    const entry = {
      id: this._nextId++,
      text: trimmed,
      timestamp: Date.now(),
      pinned: false,
      favorite: false,
    };
    this._items.unshift(entry);
    this._byText.set(trimmed, entry);
    this._prune();
    this._sortOrder();
    if (this._onChange) this._onChange();
    return true;
  }

  /** Move entry to top of recents if it is a recent item; otherwise just re-sort. */
  _moveToFrontOfRecents(entry) {
    if (entry.pinned || entry.favorite) {
      this._sortOrder();
      return;
    }
    const pinned = this._items.filter((e) => e.pinned);
    const favorite = this._items.filter((e) => !e.pinned && e.favorite);
    const recents = this._items.filter((e) => !e.pinned && !e.favorite);
    const without = recents.filter((e) => e !== entry);
    without.unshift(entry);
    this._items = [...pinned, ...favorite, ...without];
    this._prune();
  }

  /** Sort: pinned first, then favorite, then recents by timestamp (newest first). */
  _sortOrder() {
    const pinned = this._items.filter((e) => e.pinned);
    const favorite = this._items.filter((e) => !e.pinned && e.favorite);
    const recents = this._items.filter((e) => !e.pinned && !e.favorite);
    recents.sort((a, b) => b.timestamp - a.timestamp);
    this._items = [...pinned, ...favorite, ...recents];
  }

  _prune() {
    const pinned = this._items.filter((e) => e.pinned);
    const favorite = this._items.filter((e) => !e.pinned && e.favorite);
    const recents = this._items.filter((e) => !e.pinned && !e.favorite);
    const maxRecents = Math.max(0, this._maxItems - pinned.length - favorite.length);
    const keptRecents = recents.slice(0, maxRecents);
    const removed = recents.slice(maxRecents);
    for (const e of removed) this._byText.delete(e.text);
    this._items = [...pinned, ...favorite, ...keptRecents];
  }

  /**
   * Set pinned state for an entry by text. Preserves order (pinned section).
   * @param {string} text
   * @param {boolean} pinned
   */
  setPinned(text, pinned) {
    const entry = this._byText.get(text);
    if (!entry) return false;
    if (entry.pinned === pinned) return false;
    entry.pinned = pinned;
    this._sortOrder();
    if (this._onChange) this._onChange();
    return true;
  }

  /**
   * Set favorite state for an entry by text.
   * @param {string} text
   * @param {boolean} favorite
   */
  setFavorite(text, favorite) {
    const entry = this._byText.get(text);
    if (!entry) return false;
    if (entry.favorite === favorite) return false;
    entry.favorite = favorite;
    this._sortOrder();
    if (this._onChange) this._onChange();
    return true;
  }

  /** @returns {Array<{ id: number, text: string, timestamp: number, pinned: boolean, favorite: boolean }>} */
  getItems() {
    return [...this._items];
  }

  /** Items that should be persisted as pinned/favorite (pinned or favorite or both). */
  getPinnedAndFavoriteEntries() {
    return this._items.filter((e) => e.pinned || e.favorite).map((e) => ({
      id: e.id,
      text: e.text,
      timestamp: e.timestamp,
      pinned: e.pinned,
      favorite: e.favorite,
    }));
  }

  clear() {
    this._items = [];
    this._byText.clear();
    if (this._onChange) this._onChange();
  }

  size() {
    return this._items.length;
  }

  /** @param {(() => void)|null} fn */
  setOnChange(fn) {
    this._onChange = fn;
  }
}
