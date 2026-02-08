/**
 * Debounce: run fn at most once after delay ms after the last call.
 * Returns a function that cancels any pending invocation.
 */

import GLib from 'gi://GLib';

/**
 * @param {() => void} fn
 * @param {number} delayMs
 * @returns {{ run: () => void, cancel: () => void }}
 */
export function debounce(fn, delayMs) {
  let timeoutId = 0;
  return {
    run() {
      if (timeoutId) {
        GLib.source_remove(timeoutId);
        timeoutId = 0;
      }
      timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
        timeoutId = 0;
        fn();
        return GLib.SOURCE_REMOVE;
      });
    },
    flush() {
      if (timeoutId) {
        GLib.source_remove(timeoutId);
        timeoutId = 0;
      }
      fn();
    },
    cancel() {
      if (timeoutId) {
        GLib.source_remove(timeoutId);
        timeoutId = 0;
      }
    },
  };
}

/**
 * Conservative heuristic: text that might be a password.
 * - Long (e.g. >= 16) with no spaces
 * - Or mixed case + digits + length >= 12 with no spaces
 * Can have false positives; use setting to disable.
 * @param {string} text
 * @returns {boolean}
 */
export function isPasswordLike(text) {
  if (!text || text.length < 12) return false;
  const trimmed = text.trim();
  if (trimmed.indexOf(' ') >= 0) return false;
  if (trimmed.length >= 16) return true;
  const hasLower = /[a-z]/.test(trimmed);
  const hasUpper = /[A-Z]/.test(trimmed);
  const hasDigit = /[0-9]/.test(trimmed);
  const hasSpecial = /[^a-zA-Z0-9]/.test(trimmed);
  const varietyCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
  return varietyCount >= 2 && trimmed.length >= 12;
}
