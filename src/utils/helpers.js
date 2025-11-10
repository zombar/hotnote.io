/**
 * Creates a debounced function that delays execution until after wait milliseconds
 * have elapsed since the last time it was invoked.
 *
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to delay
 * @returns {Function} Debounced function
 *
 * @example
 * const debouncedSave = debounce(() => saveFile(), 1000);
 * debouncedSave(); // Will execute after 1000ms of no further calls
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const context = this;
    const later = () => {
      clearTimeout(timeout);
      func.apply(context, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
