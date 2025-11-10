import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AutosaveManager,
  createAutosaveManager,
  animateAutosaveLabel,
  setupAutosaveUI,
} from '../../src/editor/autosave.js';

describe('AutosaveManager', () => {
  let manager;
  let callbacks;

  beforeEach(() => {
    vi.useFakeTimers();
    callbacks = {
      onSave: vi.fn(),
      shouldSave: vi.fn(() => true),
      onStart: vi.fn(),
      onStop: vi.fn(),
    };
  });

  afterEach(() => {
    if (manager) {
      manager.stop();
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      manager = new AutosaveManager();

      expect(manager.interval).toBe(2000);
      expect(manager.enabled).toBe(true);
      expect(manager.intervalId).toBeNull();
    });

    it('should accept custom interval', () => {
      manager = new AutosaveManager({ interval: 5000 });

      expect(manager.interval).toBe(5000);
    });

    it('should accept enabled state', () => {
      manager = new AutosaveManager({ enabled: false });

      expect(manager.enabled).toBe(false);
    });

    it('should accept callbacks', () => {
      manager = new AutosaveManager(callbacks);

      expect(manager.callbacks.onSave).toBe(callbacks.onSave);
      expect(manager.callbacks.shouldSave).toBe(callbacks.shouldSave);
    });

    it('should provide default callbacks', () => {
      manager = new AutosaveManager();

      expect(typeof manager.callbacks.onSave).toBe('function');
      expect(typeof manager.callbacks.shouldSave).toBe('function');
      expect(typeof manager.callbacks.onStart).toBe('function');
      expect(typeof manager.callbacks.onStop).toBe('function');
    });
  });

  describe('start', () => {
    it('should start autosave interval', () => {
      manager = new AutosaveManager(callbacks);
      manager.start();

      expect(manager.intervalId).not.toBeNull();
    });

    it('should call onStart callback', () => {
      manager = new AutosaveManager(callbacks);
      manager.start();

      expect(callbacks.onStart).toHaveBeenCalledTimes(1);
    });

    it('should trigger save on interval', async () => {
      manager = new AutosaveManager(callbacks);
      manager.start();

      // Advance time by interval
      await vi.advanceTimersByTimeAsync(2000);

      expect(callbacks.shouldSave).toHaveBeenCalled();
      expect(callbacks.onSave).toHaveBeenCalledTimes(1);
    });

    it('should trigger multiple saves', async () => {
      manager = new AutosaveManager(callbacks);
      manager.start();

      // Advance time by 3 intervals
      await vi.advanceTimersByTimeAsync(6000);

      expect(callbacks.onSave).toHaveBeenCalledTimes(3);
    });

    it('should not save if shouldSave returns false', async () => {
      callbacks.shouldSave = vi.fn(() => false);
      manager = new AutosaveManager(callbacks);
      manager.start();

      await vi.advanceTimersByTimeAsync(2000);

      expect(callbacks.shouldSave).toHaveBeenCalled();
      expect(callbacks.onSave).not.toHaveBeenCalled();
    });

    it('should handle save errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      callbacks.onSave = vi.fn().mockRejectedValue(new Error('Save failed'));
      manager = new AutosaveManager(callbacks);
      manager.start();

      await vi.advanceTimersByTimeAsync(2000);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Autosave error:', expect.any(Error));
      consoleErrorSpy.mockRestore();
    });

    it('should clear existing interval before starting new one', () => {
      manager = new AutosaveManager(callbacks);
      manager.start();
      const firstIntervalId = manager.intervalId;

      manager.start();
      const secondIntervalId = manager.intervalId;

      expect(firstIntervalId).not.toBe(secondIntervalId);
    });

    it('should respect custom interval', async () => {
      manager = new AutosaveManager({ ...callbacks, interval: 5000 });
      manager.start();

      // Should not save after 2 seconds
      await vi.advanceTimersByTimeAsync(2000);
      expect(callbacks.onSave).not.toHaveBeenCalled();

      // Should save after 5 seconds
      await vi.advanceTimersByTimeAsync(3000);
      expect(callbacks.onSave).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('should stop autosave interval', () => {
      manager = new AutosaveManager(callbacks);
      manager.start();
      manager.stop();

      expect(manager.intervalId).toBeNull();
    });

    it('should call onStop callback', () => {
      manager = new AutosaveManager(callbacks);
      manager.start();
      manager.stop();

      expect(callbacks.onStop).toHaveBeenCalledTimes(1);
    });

    it('should prevent further saves after stopping', async () => {
      manager = new AutosaveManager(callbacks);
      manager.start();
      manager.stop();

      await vi.advanceTimersByTimeAsync(5000);

      expect(callbacks.onSave).not.toHaveBeenCalled();
    });

    it('should handle stopping when not started', () => {
      manager = new AutosaveManager(callbacks);

      expect(() => manager.stop()).not.toThrow();
      expect(callbacks.onStop).toHaveBeenCalledTimes(1);
    });
  });

  describe('toggle', () => {
    it('should start autosave when toggled on', () => {
      manager = new AutosaveManager({ ...callbacks, enabled: false });
      manager.toggle(true);

      expect(manager.enabled).toBe(true);
      expect(manager.intervalId).not.toBeNull();
    });

    it('should stop autosave when toggled off', () => {
      manager = new AutosaveManager(callbacks);
      manager.start();
      manager.toggle(false);

      expect(manager.enabled).toBe(false);
      expect(manager.intervalId).toBeNull();
    });

    it('should update enabled state', () => {
      manager = new AutosaveManager(callbacks);

      manager.toggle(false);
      expect(manager.enabled).toBe(false);

      manager.toggle(true);
      expect(manager.enabled).toBe(true);
    });
  });

  describe('isRunning', () => {
    it('should return false when not started', () => {
      manager = new AutosaveManager(callbacks);

      expect(manager.isRunning()).toBe(false);
    });

    it('should return true when started', () => {
      manager = new AutosaveManager(callbacks);
      manager.start();

      expect(manager.isRunning()).toBe(true);
    });

    it('should return false after stopped', () => {
      manager = new AutosaveManager(callbacks);
      manager.start();
      manager.stop();

      expect(manager.isRunning()).toBe(false);
    });
  });

  describe('isEnabled', () => {
    it('should return default enabled state', () => {
      manager = new AutosaveManager();

      expect(manager.isEnabled()).toBe(true);
    });

    it('should return custom enabled state', () => {
      manager = new AutosaveManager({ enabled: false });

      expect(manager.isEnabled()).toBe(false);
    });

    it('should reflect toggle state', () => {
      manager = new AutosaveManager(callbacks);

      manager.toggle(false);
      expect(manager.isEnabled()).toBe(false);

      manager.toggle(true);
      expect(manager.isEnabled()).toBe(true);
    });
  });

  describe('setInterval', () => {
    it('should update interval', () => {
      manager = new AutosaveManager(callbacks);
      manager.setInterval(3000);

      expect(manager.interval).toBe(3000);
    });

    it('should restart if currently running', () => {
      manager = new AutosaveManager(callbacks);
      manager.start();
      const oldIntervalId = manager.intervalId;

      manager.setInterval(3000);

      expect(manager.intervalId).not.toBe(oldIntervalId);
      expect(manager.intervalId).not.toBeNull();
    });

    it('should not start if not currently running', () => {
      manager = new AutosaveManager(callbacks);
      manager.setInterval(3000);

      expect(manager.intervalId).toBeNull();
    });

    it('should use new interval for subsequent saves', async () => {
      manager = new AutosaveManager(callbacks);
      manager.start();
      manager.setInterval(4000);

      // Should not save after 2 seconds
      await vi.advanceTimersByTimeAsync(2000);
      expect(callbacks.onSave).not.toHaveBeenCalled();

      // Should save after 4 seconds
      await vi.advanceTimersByTimeAsync(2000);
      expect(callbacks.onSave).toHaveBeenCalledTimes(1);
    });
  });

  describe('getInterval', () => {
    it('should return current interval', () => {
      manager = new AutosaveManager({ interval: 3000 });

      expect(manager.getInterval()).toBe(3000);
    });

    it('should return updated interval', () => {
      manager = new AutosaveManager(callbacks);
      manager.setInterval(5000);

      expect(manager.getInterval()).toBe(5000);
    });
  });

  describe('saveNow', () => {
    it('should trigger immediate save', async () => {
      manager = new AutosaveManager(callbacks);

      await manager.saveNow();

      expect(callbacks.onSave).toHaveBeenCalledTimes(1);
    });

    it('should not save if shouldSave returns false', async () => {
      callbacks.shouldSave = vi.fn(() => false);
      manager = new AutosaveManager(callbacks);

      await manager.saveNow();

      expect(callbacks.onSave).not.toHaveBeenCalled();
    });

    it('should throw error if save fails', async () => {
      callbacks.onSave = vi.fn().mockRejectedValue(new Error('Save failed'));
      manager = new AutosaveManager(callbacks);

      await expect(manager.saveNow()).rejects.toThrow('Save failed');
    });

    it('should log error for failed saves', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      callbacks.onSave = vi.fn().mockRejectedValue(new Error('Save failed'));
      manager = new AutosaveManager(callbacks);

      try {
        await manager.saveNow();
      } catch (_err) {
        // Expected
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith('Manual save error:', expect.any(Error));
      consoleErrorSpy.mockRestore();
    });
  });

  describe('reset', () => {
    it('should stop autosave', () => {
      manager = new AutosaveManager(callbacks);
      manager.start();
      manager.reset();

      expect(manager.intervalId).toBeNull();
    });

    it('should reset to default values', () => {
      manager = new AutosaveManager({ interval: 5000, enabled: false });
      manager.reset();

      expect(manager.enabled).toBe(true);
      expect(manager.interval).toBe(2000);
    });
  });
});

describe('createAutosaveManager', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create an AutosaveManager instance', () => {
    const manager = createAutosaveManager();

    expect(manager).toBeInstanceOf(AutosaveManager);
  });

  it('should pass options to constructor', () => {
    const manager = createAutosaveManager({ interval: 3000, enabled: false });

    expect(manager.interval).toBe(3000);
    expect(manager.enabled).toBe(false);
  });
});

describe('animateAutosaveLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Setup DOM
    document.body.innerHTML = '<div id="autosave-label" class=""></div>';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('should add fade-out class after linger duration', async () => {
    animateAutosaveLabel(true);

    const label = document.getElementById('autosave-label');
    expect(label.classList.contains('fade-out')).toBe(false);

    await vi.advanceTimersByTimeAsync(2000);
    expect(label.classList.contains('fade-out')).toBe(true);
  });

  it('should add hidden class after fade duration', async () => {
    animateAutosaveLabel(true);

    const label = document.getElementById('autosave-label');

    await vi.advanceTimersByTimeAsync(2500);
    expect(label.classList.contains('hidden')).toBe(true);
  });

  it('should remove classes when showing', () => {
    const label = document.getElementById('autosave-label');
    label.classList.add('hidden', 'fade-out');

    animateAutosaveLabel(false);

    expect(label.classList.contains('hidden')).toBe(false);
    expect(label.classList.contains('fade-out')).toBe(false);
  });

  it('should accept custom label ID', async () => {
    document.body.innerHTML = '<div id="custom-label" class=""></div>';

    animateAutosaveLabel(true, { labelId: 'custom-label' });

    await vi.advanceTimersByTimeAsync(2000);

    const label = document.getElementById('custom-label');
    expect(label.classList.contains('fade-out')).toBe(true);
  });

  it('should accept custom durations', async () => {
    animateAutosaveLabel(true, { lingerDuration: 1000, fadeDuration: 200 });

    const label = document.getElementById('autosave-label');

    // Should not fade after 500ms
    await vi.advanceTimersByTimeAsync(500);
    expect(label.classList.contains('fade-out')).toBe(false);

    // Should fade after 1000ms
    await vi.advanceTimersByTimeAsync(500);
    expect(label.classList.contains('fade-out')).toBe(true);

    // Should be hidden after 1200ms total
    await vi.advanceTimersByTimeAsync(200);
    expect(label.classList.contains('hidden')).toBe(true);
  });

  it('should handle missing label gracefully', () => {
    document.body.innerHTML = '';

    expect(() => animateAutosaveLabel(true)).not.toThrow();
  });
});

describe('setupAutosaveUI', () => {
  let manager;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <input type="checkbox" id="autosave-checkbox" />
      <div id="autosave-label"></div>
    `;

    manager = new AutosaveManager();
  });

  afterEach(() => {
    if (manager) {
      manager.stop();
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('should set initial checkbox state', () => {
    setupAutosaveUI(manager);

    const checkbox = document.getElementById('autosave-checkbox');
    expect(checkbox.checked).toBe(true);
  });

  it('should set initial checkbox state to false', () => {
    manager = new AutosaveManager({ enabled: false });
    setupAutosaveUI(manager);

    const checkbox = document.getElementById('autosave-checkbox');
    expect(checkbox.checked).toBe(false);
  });

  it('should toggle manager on checkbox change', () => {
    setupAutosaveUI(manager);

    const checkbox = document.getElementById('autosave-checkbox');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));

    expect(manager.isEnabled()).toBe(false);
    expect(manager.isRunning()).toBe(false);
  });

  it('should animate label on change', async () => {
    setupAutosaveUI(manager, { animateLabel: true });

    const checkbox = document.getElementById('autosave-checkbox');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    await vi.advanceTimersByTimeAsync(2000);

    const label = document.getElementById('autosave-label');
    expect(label.classList.contains('fade-out')).toBe(true);
  });

  it('should skip animation when disabled', async () => {
    setupAutosaveUI(manager, { animateLabel: false });

    const checkbox = document.getElementById('autosave-checkbox');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    await vi.advanceTimersByTimeAsync(2000);

    const label = document.getElementById('autosave-label');
    expect(label.classList.contains('fade-out')).toBe(false);
  });

  it('should accept custom checkbox ID', () => {
    document.body.innerHTML = '<input type="checkbox" id="custom-checkbox" />';

    setupAutosaveUI(manager, { checkboxId: 'custom-checkbox' });

    const checkbox = document.getElementById('custom-checkbox');
    expect(checkbox.checked).toBe(true);
  });

  it('should handle missing checkbox gracefully', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    document.body.innerHTML = '';

    expect(() => setupAutosaveUI(manager)).not.toThrow();
    expect(consoleWarnSpy).toHaveBeenCalledWith('Autosave checkbox not found: autosave-checkbox');

    consoleWarnSpy.mockRestore();
  });
});
