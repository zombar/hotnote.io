import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SettingsPanel } from '../../src/ui/settings-panel.js';
import * as environment from '../../src/utils/environment.js';

describe('Settings Panel', () => {
  let settingsPanel;
  let mockEditor;
  let mockActiveEditor;

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();

    // Mock environment as hosted by default
    // This ensures the privacy banner is shown in tests (shown when hosted)
    vi.spyOn(environment, 'isLocalEnvironment').mockReturnValue(false);

    // Create mock active editor with blur/focus capabilities
    mockActiveEditor = {
      view: {
        dom: {
          blur: vi.fn(),
        },
      },
    };

    // Create mock editor manager
    mockEditor = {
      focus: vi.fn(),
      getActiveEditor: vi.fn(() => mockActiveEditor),
    };
  });

  afterEach(() => {
    if (settingsPanel) {
      settingsPanel.destroy();
    }
  });

  describe('Editor focus management', () => {
    it('should blur editor when settings panel opens', () => {
      settingsPanel = new SettingsPanel({
        getEditor: () => mockEditor,
      });

      // Open the settings panel
      settingsPanel.open();

      // Verify editor was blurred
      expect(mockEditor.getActiveEditor).toHaveBeenCalled();
      expect(mockActiveEditor.view.dom.blur).toHaveBeenCalled();
    });

    it('should restore focus to editor when settings panel closes', () => {
      settingsPanel = new SettingsPanel({
        getEditor: () => mockEditor,
      });

      // Open the settings panel
      settingsPanel.open();

      // Close the settings panel
      settingsPanel.close();

      // Verify editor focus was restored
      expect(mockEditor.focus).toHaveBeenCalled();
    });

    it('should handle editor blur and focus on open/close cycle', () => {
      settingsPanel = new SettingsPanel({
        getEditor: () => mockEditor,
      });

      // Open the settings panel
      settingsPanel.open();
      expect(mockActiveEditor.view.dom.blur).toHaveBeenCalledTimes(1);

      // Close the settings panel
      settingsPanel.close();
      expect(mockEditor.focus).toHaveBeenCalledTimes(1);

      // Open again
      settingsPanel.open();
      expect(mockActiveEditor.view.dom.blur).toHaveBeenCalledTimes(2);

      // Close again
      settingsPanel.close();
      expect(mockEditor.focus).toHaveBeenCalledTimes(2);
    });

    it('should not crash if getEditor is not provided', () => {
      settingsPanel = new SettingsPanel();

      // Should not throw when opening/closing without editor
      expect(() => {
        settingsPanel.open();
        settingsPanel.close();
      }).not.toThrow();
    });

    it('should not crash if editor does not have expected methods', () => {
      const incompleteEditor = {
        // Missing getActiveEditor and focus methods
      };

      settingsPanel = new SettingsPanel({
        getEditor: () => incompleteEditor,
      });

      // Should not throw even with incomplete editor
      expect(() => {
        settingsPanel.open();
        settingsPanel.close();
      }).not.toThrow();
    });

    it('should not crash if getEditor returns null', () => {
      settingsPanel = new SettingsPanel({
        getEditor: () => null,
      });

      // Should not throw when editor is null
      expect(() => {
        settingsPanel.open();
        settingsPanel.close();
      }).not.toThrow();
    });
  });

  describe('Privacy info banner', () => {
    it('should display privacy info banner when panel is created', () => {
      settingsPanel = new SettingsPanel({
        getEditor: () => mockEditor,
      });

      settingsPanel.open();

      // Verify info banner exists
      const infoBanner = document.querySelector('.settings-info-banner');
      expect(infoBanner).toBeTruthy();

      // Verify it contains the lock icon
      const infoIcon = document.querySelector('.settings-info-icon');
      expect(infoIcon).toBeTruthy();
      expect(infoIcon.textContent).toBe('🔒');

      // Verify it contains the privacy message
      const infoText = document.querySelector('.settings-info-text');
      expect(infoText).toBeTruthy();
      expect(infoText.textContent).toContain('Local-First & Private');
      expect(infoText.textContent).toContain('Your data never leaves your device');

      // Verify source code link
      const sourceLink = document.querySelector('[data-testid="settings-source-code-link"]');
      expect(sourceLink).toBeTruthy();
      expect(sourceLink.textContent).toBe('source code');
      expect(sourceLink.getAttribute('href')).toBe('https://github.com/zombar/hotnote.io');
      expect(sourceLink.getAttribute('target')).toBe('_blank');
      expect(sourceLink.getAttribute('rel')).toBe('noopener noreferrer');
    });
  });

  describe('Panel state management', () => {
    it('should track open/closed state correctly', () => {
      settingsPanel = new SettingsPanel({
        getEditor: () => mockEditor,
      });

      expect(settingsPanel.isOpen).toBe(false);

      settingsPanel.open();
      expect(settingsPanel.isOpen).toBe(true);

      settingsPanel.close();
      expect(settingsPanel.isOpen).toBe(false);
    });

    it('should not open if already open', () => {
      settingsPanel = new SettingsPanel({
        getEditor: () => mockEditor,
      });

      settingsPanel.open();
      const firstCallCount = mockActiveEditor.view.dom.blur.mock.calls.length;

      // Try to open again
      settingsPanel.open();

      // Blur should not be called again
      expect(mockActiveEditor.view.dom.blur.mock.calls.length).toBe(firstCallCount);
    });

    it('should not close if already closed', () => {
      settingsPanel = new SettingsPanel({
        getEditor: () => mockEditor,
      });

      // Close without opening
      settingsPanel.close();

      // Focus should not be called
      expect(mockEditor.focus).not.toHaveBeenCalled();
    });
  });

  describe('ESC key handling', () => {
    it('should close settings panel when ESC is pressed', () => {
      settingsPanel = new SettingsPanel({
        getEditor: () => mockEditor,
      });

      settingsPanel.open();
      expect(settingsPanel.isOpen).toBe(true);

      // Simulate ESC key press
      const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escEvent);

      expect(settingsPanel.isOpen).toBe(false);
      expect(mockEditor.focus).toHaveBeenCalled();
    });

    it('should remove ESC handler after closing', () => {
      settingsPanel = new SettingsPanel({
        getEditor: () => mockEditor,
      });

      settingsPanel.open();
      settingsPanel.close();

      // Reset mock
      mockEditor.focus.mockClear();

      // ESC should not trigger close after panel is closed
      const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escEvent);

      // Focus should not be called again
      expect(mockEditor.focus).not.toHaveBeenCalled();
    });
  });
});
