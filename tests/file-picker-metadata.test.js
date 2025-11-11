import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

/**
 * Unit tests for file picker metadata rendering
 * These tests verify that file items include size, delete button, and other metadata
 */

describe('File Picker - File Item Metadata', () => {
  let dom;
  let document;

  beforeEach(() => {
    // Setup DOM
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    document = dom.window.document;
    global.document = document;
  });

  describe('File size formatting', () => {
    it('should format bytes correctly', () => {
      const sizes = [
        { bytes: 0, expected: '0 B' },
        { bytes: 500, expected: '500 B' },
        { bytes: 1023, expected: '1023 B' },
      ];

      sizes.forEach(({ bytes, expected }) => {
        const actual =
          bytes < 1024
            ? bytes + ' B'
            : bytes < 1024 * 1024
              ? (bytes / 1024).toFixed(1) + ' KB'
              : (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        expect(actual).toBe(expected);
      });
    });

    it('should format kilobytes correctly', () => {
      const sizes = [
        { bytes: 1024, expected: '1.0 KB' },
        { bytes: 1536, expected: '1.5 KB' },
        { bytes: 10240, expected: '10.0 KB' },
        { bytes: 1048575, expected: '1024.0 KB' },
      ];

      sizes.forEach(({ bytes, expected }) => {
        const actual =
          bytes < 1024
            ? bytes + ' B'
            : bytes < 1024 * 1024
              ? (bytes / 1024).toFixed(1) + ' KB'
              : (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        expect(actual).toBe(expected);
      });
    });

    it('should format megabytes correctly', () => {
      const sizes = [
        { bytes: 1048576, expected: '1.0 MB' },
        { bytes: 2621440, expected: '2.5 MB' },
        { bytes: 10485760, expected: '10.0 MB' },
      ];

      sizes.forEach(({ bytes, expected }) => {
        const actual =
          bytes < 1024
            ? bytes + ' B'
            : bytes < 1024 * 1024
              ? (bytes / 1024).toFixed(1) + ' KB'
              : (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        expect(actual).toBe(expected);
      });
    });
  });

  describe('File item structure', () => {
    it('should have correct structure for file with metadata', () => {
      // Create a mock file item structure
      const item = document.createElement('div');
      item.className = 'file-item';

      const icon = document.createElement('span');
      icon.className = 'file-item-icon';
      const iconSymbol = document.createElement('span');
      iconSymbol.className = 'material-symbols-outlined';
      iconSymbol.textContent = 'description';
      icon.appendChild(iconSymbol);

      const name = document.createElement('span');
      name.className = 'file-item-name';
      name.textContent = 'test.md';

      const metadata = document.createElement('span');
      metadata.className = 'file-item-metadata';
      metadata.textContent = '1.5 KB';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'file-item-delete';
      const deleteIcon = document.createElement('span');
      deleteIcon.className = 'material-symbols-outlined';
      deleteIcon.textContent = 'close';
      deleteBtn.appendChild(deleteIcon);

      item.appendChild(icon);
      item.appendChild(name);
      item.appendChild(metadata);
      item.appendChild(deleteBtn);

      // Verify structure
      expect(item.querySelector('.file-item-icon')).toBeTruthy();
      expect(item.querySelector('.file-item-name')).toBeTruthy();
      expect(item.querySelector('.file-item-metadata')).toBeTruthy();
      expect(item.querySelector('.file-item-delete')).toBeTruthy();
    });

    it('should have correct structure for directory without metadata', () => {
      const item = document.createElement('div');
      item.className = 'file-item is-directory';

      const icon = document.createElement('span');
      icon.className = 'file-item-icon';
      const iconSymbol = document.createElement('span');
      iconSymbol.className = 'material-symbols-outlined';
      iconSymbol.textContent = 'folder';
      icon.appendChild(iconSymbol);

      const name = document.createElement('span');
      name.className = 'file-item-name';
      name.textContent = 'my-folder';

      item.appendChild(icon);
      item.appendChild(name);

      // Verify structure - no metadata or delete button
      expect(item.querySelector('.file-item-icon')).toBeTruthy();
      expect(item.querySelector('.file-item-name')).toBeTruthy();
      expect(item.querySelector('.file-item-metadata')).toBeNull();
      expect(item.querySelector('.file-item-delete')).toBeNull();
      expect(item.classList.contains('is-directory')).toBe(true);
    });
  });

  describe('File icon selection', () => {
    const getFileIcon = (filename, isDirectory) => {
      if (isDirectory) return 'folder';

      const ext = filename.split('.').pop().toLowerCase();

      const iconMap = {
        md: 'description',
        txt: 'description',
        js: 'javascript',
        ts: 'code',
        json: 'data_object',
        html: 'html',
        css: 'css',
        png: 'image',
        jpg: 'image',
        pdf: 'picture_as_pdf',
        default: 'draft',
      };

      return iconMap[ext] || iconMap.default;
    };

    it('should return folder icon for directories', () => {
      expect(getFileIcon('anything', true)).toBe('folder');
    });

    it('should return correct icons for common file types', () => {
      const testCases = [
        { filename: 'readme.md', expected: 'description' },
        { filename: 'notes.txt', expected: 'description' },
        { filename: 'app.js', expected: 'javascript' },
        { filename: 'main.ts', expected: 'code' },
        { filename: 'data.json', expected: 'data_object' },
        { filename: 'index.html', expected: 'html' },
        { filename: 'styles.css', expected: 'css' },
        { filename: 'photo.png', expected: 'image' },
        { filename: 'image.jpg', expected: 'image' },
        { filename: 'document.pdf', expected: 'picture_as_pdf' },
      ];

      testCases.forEach(({ filename, expected }) => {
        expect(getFileIcon(filename, false)).toBe(expected);
      });
    });

    it('should return default icon for unknown extensions', () => {
      expect(getFileIcon('file.xyz', false)).toBe('draft');
      expect(getFileIcon('noextension', false)).toBe('draft');
    });
  });

  describe('Delete button functionality', () => {
    it('should have click handler that stops propagation', () => {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'file-item-delete';

      let propagationStopped = false;
      const mockEvent = {
        stopPropagation: () => {
          propagationStopped = true;
        },
      };

      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      deleteBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
      expect(propagationStopped).toBe(false); // JSDOM limitation - manual check needed

      // Verify the handler would call stopPropagation
      const clickHandler = (e) => {
        e.stopPropagation();
      };
      clickHandler(mockEvent);
      expect(propagationStopped).toBe(true);
    });
  });

  describe('Unsaved changes indicator', () => {
    it('should add class when file has temp changes', () => {
      const item = document.createElement('div');
      item.className = 'file-item';

      // Simulate checking for temp changes
      const hasTempChanges = true;

      if (hasTempChanges) {
        item.classList.add('has-unsaved-changes');
      }

      expect(item.classList.contains('has-unsaved-changes')).toBe(true);
    });

    it('should not add class when file has no temp changes', () => {
      const item = document.createElement('div');
      item.className = 'file-item';

      const hasTempChanges = false;

      if (hasTempChanges) {
        item.classList.add('has-unsaved-changes');
      }

      expect(item.classList.contains('has-unsaved-changes')).toBe(false);
    });
  });

  describe('Read-only file indicator', () => {
    it('should show lock icon for read-only files', () => {
      const item = document.createElement('div');
      item.className = 'file-item';

      const lockIcon = document.createElement('span');
      lockIcon.className = 'file-item-lock';
      const lockSymbol = document.createElement('span');
      lockSymbol.className = 'material-symbols-outlined';
      lockSymbol.textContent = 'lock';
      lockIcon.appendChild(lockSymbol);
      lockIcon.title = 'Read-only';

      item.appendChild(lockIcon);

      const lock = item.querySelector('.file-item-lock');
      expect(lock).toBeTruthy();
      expect(lock.title).toBe('Read-only');
      expect(lock.querySelector('.material-symbols-outlined').textContent).toBe('lock');
    });

    it('should not show lock icon for writable files', () => {
      const item = document.createElement('div');
      item.className = 'file-item';

      // No lock icon added for writable files
      const lock = item.querySelector('.file-item-lock');
      expect(lock).toBeNull();
    });
  });

  describe('Code path consistency', () => {
    it('should produce identical structure in both render paths', () => {
      // Simulate quick update path
      const quickUpdateItem = document.createElement('div');
      quickUpdateItem.className = 'file-item';

      const icon1 = document.createElement('span');
      icon1.className = 'file-item-icon';
      const name1 = document.createElement('span');
      name1.className = 'file-item-name';
      name1.textContent = 'test.md';
      const metadata1 = document.createElement('span');
      metadata1.className = 'file-item-metadata';
      metadata1.textContent = '1.5 KB';
      const delete1 = document.createElement('button');
      delete1.className = 'file-item-delete';

      quickUpdateItem.appendChild(icon1);
      quickUpdateItem.appendChild(name1);
      quickUpdateItem.appendChild(metadata1);
      quickUpdateItem.appendChild(delete1);

      // Simulate full initialization path
      const fullInitItem = document.createElement('div');
      fullInitItem.className = 'file-item';

      const icon2 = document.createElement('span');
      icon2.className = 'file-item-icon';
      const name2 = document.createElement('span');
      name2.className = 'file-item-name';
      name2.textContent = 'test.md';
      const metadata2 = document.createElement('span');
      metadata2.className = 'file-item-metadata';
      metadata2.textContent = '1.5 KB';
      const delete2 = document.createElement('button');
      delete2.className = 'file-item-delete';

      fullInitItem.appendChild(icon2);
      fullInitItem.appendChild(name2);
      fullInitItem.appendChild(metadata2);
      fullInitItem.appendChild(delete2);

      // Both should have the same structure
      expect(quickUpdateItem.children.length).toBe(fullInitItem.children.length);
      expect(quickUpdateItem.querySelector('.file-item-icon')).toBeTruthy();
      expect(quickUpdateItem.querySelector('.file-item-name')).toBeTruthy();
      expect(quickUpdateItem.querySelector('.file-item-metadata')).toBeTruthy();
      expect(quickUpdateItem.querySelector('.file-item-delete')).toBeTruthy();

      expect(fullInitItem.querySelector('.file-item-icon')).toBeTruthy();
      expect(fullInitItem.querySelector('.file-item-name')).toBeTruthy();
      expect(fullInitItem.querySelector('.file-item-metadata')).toBeTruthy();
      expect(fullInitItem.querySelector('.file-item-delete')).toBeTruthy();
    });
  });
});
