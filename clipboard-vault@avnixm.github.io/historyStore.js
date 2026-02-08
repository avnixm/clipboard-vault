/**
 * In-memory clipboard history store.
 * O(1) dedupe via _byText Map; array (newest first) for order.
 * Entry shape: { id?, text, timestamp, pinned? }
 */

const MAX_ITEMS_DEFAULT = 50;

export class HistoryStore {
  /**
   * @param {number} [maxItems=50]
   * @param {Array<{ id?: number, text: string, timestamp: number, pinned?: boolean }>} [initialEntries=[]]
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
        };
        if (entry.id >= this._nextId) this._nextId = entry.id + 1;
        this._items.push(entry);
        this._byText.set(text, entry);
      }
    }
    this._prune();
    this._onChange = null;
  }

  setMaxItems(n) {
    this._maxItems = Math.max(1, n);
    this._prune();
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
      this._moveToFront(existing);
      if (this._onChange) this._onChange();
      return true;
    }

    const entry = {
      id: this._nextId++,
      text: trimmed,
      timestamp: Date.now(),
      pinned: false,
    };
    this._items.unshift(entry);
    this._byText.set(trimmed, entry);
    this._prune();
    if (this._onChange) this._onChange();
    return true;
  }

  _moveToFront(entry) {
    this._items = this._items.filter((e) => e !== entry);
    this._items.unshift(entry);
    this._prune();
  }

  _prune() {
    if (this._items.length <= this._maxItems) return;
    const removed = this._items.slice(this._maxItems);
    this._items = this._items.slice(0, this._maxItems);
    for (const e of removed) this._byText.delete(e.text);
  }

  /** @returns {Array<{ id?: number, text: string, timestamp: number, pinned?: boolean }>} newest first */
  getItems() {
    return [...this._items];
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
