import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../../src/utils/helpers.js';

describe('helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('debounce', () => {
    it('should delay function execution', () => {
      const func = vi.fn();
      const debounced = debounce(func, 100);

      debounced();
      expect(func).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(func).toHaveBeenCalledTimes(1);
    });

    it('should cancel previous calls when called rapidly', () => {
      const func = vi.fn();
      const debounced = debounce(func, 100);

      debounced();
      debounced();
      debounced();

      vi.advanceTimersByTime(100);
      expect(func).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to the debounced function', () => {
      const func = vi.fn();
      const debounced = debounce(func, 100);

      debounced('arg1', 'arg2');
      vi.advanceTimersByTime(100);

      expect(func).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should handle multiple sequential calls with different arguments', () => {
      const func = vi.fn();
      const debounced = debounce(func, 100);

      debounced('first');
      vi.advanceTimersByTime(50);
      debounced('second');
      vi.advanceTimersByTime(100);

      expect(func).toHaveBeenCalledTimes(1);
      expect(func).toHaveBeenCalledWith('second');
    });

    it('should handle zero delay', () => {
      const func = vi.fn();
      const debounced = debounce(func, 0);

      debounced();
      vi.advanceTimersByTime(0);

      expect(func).toHaveBeenCalledTimes(1);
    });

    it('should allow execution after wait period expires', () => {
      const func = vi.fn();
      const debounced = debounce(func, 100);

      debounced();
      vi.advanceTimersByTime(100);
      debounced();
      vi.advanceTimersByTime(100);

      expect(func).toHaveBeenCalledTimes(2);
    });

    it('should preserve this context when called', () => {
      const obj = {
        value: 42,
        method: vi.fn(function () {
          return this.value;
        }),
      };

      const debounced = debounce(obj.method, 100);
      debounced.call(obj);

      vi.advanceTimersByTime(100);

      expect(obj.method).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple arguments correctly', () => {
      const func = vi.fn();
      const debounced = debounce(func, 100);

      debounced(1, 2, 3, 4, 5);
      vi.advanceTimersByTime(100);

      expect(func).toHaveBeenCalledWith(1, 2, 3, 4, 5);
    });

    it('should not execute if time has not elapsed', () => {
      const func = vi.fn();
      const debounced = debounce(func, 100);

      debounced();
      vi.advanceTimersByTime(99);

      expect(func).not.toHaveBeenCalled();
    });

    it('should clear timeout on subsequent calls', () => {
      const func = vi.fn();
      const debounced = debounce(func, 100);

      debounced();
      vi.advanceTimersByTime(50);
      debounced();
      vi.advanceTimersByTime(50);

      // Should not have been called yet (total time 100ms but reset after 50ms)
      expect(func).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(func).toHaveBeenCalledTimes(1);
    });

    it('should handle rapid successive calls correctly', () => {
      const func = vi.fn();
      const debounced = debounce(func, 100);

      for (let i = 0; i < 10; i++) {
        debounced(i);
        vi.advanceTimersByTime(10);
      }

      // Should not have executed yet
      expect(func).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(func).toHaveBeenCalledTimes(1);
      expect(func).toHaveBeenCalledWith(9); // Last argument
    });

    it('should work with different wait times', () => {
      const func1 = vi.fn();
      const func2 = vi.fn();
      const debounced1 = debounce(func1, 50);
      const debounced2 = debounce(func2, 200);

      debounced1();
      debounced2();

      vi.advanceTimersByTime(50);
      expect(func1).toHaveBeenCalledTimes(1);
      expect(func2).not.toHaveBeenCalled();

      vi.advanceTimersByTime(150);
      expect(func2).toHaveBeenCalledTimes(1);
    });
  });
});
