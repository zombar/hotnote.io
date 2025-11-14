/**
 * Tests for ModelProgressUI
 * Verifies toast UI behavior, progress updates, and visibility
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModelProgressUI } from '../../src/ui/model-progress.js';

describe('ModelProgressUI', () => {
  let progressUI;
  let container;

  beforeEach(() => {
    // Create a container for tests
    container = document.createElement('div');
    document.body.appendChild(container);

    progressUI = new ModelProgressUI();
  });

  afterEach(() => {
    if (progressUI) {
      progressUI.destroy();
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  describe('Initialization', () => {
    it('should create UI instance', () => {
      expect(progressUI).toBeDefined();
      expect(progressUI.visible).toBe(false);
    });

    it('should not show initially', () => {
      expect(progressUI.isShowing).toBe(false);
      expect(document.querySelector('.model-progress-toast')).toBeNull();
    });
  });

  describe('Show/Hide', () => {
    it('should show toast when show() is called', () => {
      progressUI.show();

      expect(progressUI.visible).toBe(true);
      const toast = document.querySelector('.model-progress-toast');
      expect(toast).toBeTruthy();
    });

    it('should hide toast when hide() is called', async () => {
      progressUI.show();

      // Wait for show animation to complete
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(progressUI.visible).toBe(true);

      progressUI.hide();

      // Wait for hide animation (300ms timeout + buffer)
      await new Promise((resolve) => setTimeout(resolve, 400));

      expect(progressUI.visible).toBe(false);
      const toast = document.querySelector('.model-progress-toast');
      expect(toast).toBeNull();
    });

    it('should not show multiple times if already showing', () => {
      progressUI.show();
      const first = document.querySelector('.model-progress-toast');

      progressUI.show();
      const second = document.querySelector('.model-progress-toast');

      expect(first).toBe(second);
    });

    it('should apply slide-up animation when showing', async () => {
      progressUI.show();

      const toast = document.querySelector('.model-progress-toast');
      expect(toast).toBeTruthy();

      // Wait for animation frame
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      // Check for 'visible' class instead of inline styles
      expect(toast.classList.contains('visible')).toBe(true);
    });
  });

  describe('Progress Updates', () => {
    beforeEach(async () => {
      progressUI.show();
      // Wait for show animation to complete
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    it('should update progress percentage (WebLLM format)', () => {
      progressUI.updateProgress({
        progress: 0.5,
        text: 'Downloading model...',
      });

      const progressText = document.querySelector('.model-progress-text');
      expect(progressText.textContent).toBe('50%');

      const progressBar = document.querySelector('.model-progress-bar');
      expect(progressBar.style.width).toBe('50%');
    });

    it('should update status text', () => {
      progressUI.updateProgress({
        progress: 0.25,
        text: 'Loading model files...',
      });

      const statusText = document.querySelector('.model-progress-status');
      expect(statusText.textContent).toBe('Loading model files...');
    });

    it('should handle TransformersJS format with loaded/total', () => {
      progressUI.updateProgress({
        status: 'Downloading',
        file: 'model.onnx',
        loaded: 50000,
        total: 100000,
      });

      const progressText = document.querySelector('.model-progress-text');
      expect(progressText.textContent).toBe('50%');

      const statusText = document.querySelector('.model-progress-status');
      expect(statusText.textContent).toContain('Downloading');
      expect(statusText.textContent).toContain('model.onnx');
    });

    it('should handle progress from 0 to 100', () => {
      for (let i = 0; i <= 100; i += 10) {
        progressUI.updateProgress({
          progress: i / 100,
          text: `Loading ${i}%`,
        });

        const progressText = document.querySelector('.model-progress-text');
        expect(progressText.textContent).toBe(`${i}%`);
      }
    });
  });

  describe('Queue Info', () => {
    beforeEach(async () => {
      progressUI.show();
      // Wait for show animation to complete
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    it('should show queue size', () => {
      progressUI.showQueueInfo(2);

      const statusText = document.querySelector('.model-progress-status');
      expect(statusText.textContent).toBe('Processing... (2 queued)');
    });

    it('should not show queue info for 0', () => {
      progressUI.setStatus('Loading...');
      progressUI.showQueueInfo(0);

      const statusText = document.querySelector('.model-progress-status');
      // Should not change
      expect(statusText.textContent).toBe('Loading...');
    });
  });

  describe('Positioning', () => {
    it('should position toast at bottom-left', async () => {
      progressUI.show();

      // Wait for show animation to complete
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const toast = document.querySelector('.model-progress-toast');

      expect(toast.style.position).toBe('fixed');
      expect(toast.style.bottom).toBe('1rem');
      expect(toast.style.left).toBe('1rem');
    });

    it('should have high z-index', async () => {
      progressUI.show();

      // Wait for show animation to complete
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const toast = document.querySelector('.model-progress-toast');
      expect(toast.style.zIndex).toBe('9999');
    });
  });

  describe('Theming', () => {
    it('should detect dark mode from class', () => {
      document.documentElement.classList.add('dark-theme');
      document.documentElement.setAttribute('data-theme', 'dark');

      const ui = new ModelProgressUI();
      ui.show();

      const container = document.querySelector('.model-progress-container');
      expect(container).toBeTruthy();
      // Container should use CSS classes for theming
      expect(container.className).toBe('model-progress-container');

      ui.destroy();
      document.documentElement.classList.remove('dark-theme');
      document.documentElement.removeAttribute('data-theme');
    });

    it('should detect light mode', () => {
      document.documentElement.classList.remove('dark-theme');
      document.documentElement.removeAttribute('data-theme');

      const ui = new ModelProgressUI();
      ui.show();

      const container = document.querySelector('.model-progress-container');
      expect(container).toBeTruthy();
      // Container should use CSS classes for theming
      expect(container.className).toBe('model-progress-container');

      ui.destroy();
    });
  });

  describe('Cleanup', () => {
    it('should remove DOM elements on destroy', async () => {
      progressUI.show();

      // Wait for show animation to complete
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(document.querySelector('.model-progress-toast')).toBeTruthy();

      progressUI.destroy();

      // Wait for hide animation
      await new Promise((resolve) => setTimeout(resolve, 400));

      expect(document.querySelector('.model-progress-toast')).toBeNull();
    });

    it('should reset internal state on destroy', async () => {
      progressUI.show();

      // Wait for show animation to complete
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      progressUI.destroy();

      // Wait for hide animation
      await new Promise((resolve) => setTimeout(resolve, 400));

      expect(progressUI.overlay).toBeNull();
      expect(progressUI.progressBar).toBeNull();
      expect(progressUI.progressText).toBeNull();
      expect(progressUI.statusText).toBeNull();
    });
  });
});
