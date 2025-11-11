import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { URLParamManager } from '../../src/navigation/url-param-manager.js';

/**
 * Unit tests for URLParamManager
 * Tests URL parameter validation, parsing, and state management
 */
describe('URLParamManager', () => {
  let originalLocation;
  let originalHistory;

  beforeEach(() => {
    // Save original location and history
    originalLocation = window.location;
    originalHistory = window.history;

    // Mock window.location
    delete window.location;
    window.location = {
      search: '',
      href: 'http://localhost:3000/',
      origin: 'http://localhost:3000',
      pathname: '/',
    };

    // Mock window.history
    window.history = {
      replaceState: vi.fn(),
      pushState: vi.fn(),
    };
  });

  afterEach(() => {
    // Restore original location and history
    window.location = originalLocation;
    window.history = originalHistory;
  });

  describe('validate()', () => {
    it('should return null for both params when URL has no params', () => {
      window.location.search = '';

      const result = URLParamManager.validate();

      expect(result).toEqual({ workdir: null, file: null });
    });

    it('should return workdir only when only workdir param exists', () => {
      window.location.search = '?workdir=/Users/test/projects/myapp';

      const result = URLParamManager.validate();

      expect(result).toEqual({
        workdir: '/Users/test/projects/myapp',
        file: null,
      });
    });

    it('should return both params when workdir and file exist', () => {
      window.location.search = '?workdir=/Users/test/projects/myapp&file=README.md';

      const result = URLParamManager.validate();

      expect(result).toEqual({
        workdir: '/Users/test/projects/myapp',
        file: 'README.md',
      });
    });

    it('should return null for both when file exists without workdir (INVALID)', () => {
      window.location.search = '?file=README.md';

      const result = URLParamManager.validate();

      expect(result).toEqual({ workdir: null, file: null });
    });

    it('should treat empty workdir as invalid', () => {
      window.location.search = '?workdir=';

      const result = URLParamManager.validate();

      expect(result).toEqual({ workdir: null, file: null });
    });

    it('should treat empty file as no file param', () => {
      window.location.search = '?workdir=/path&file=';

      const result = URLParamManager.validate();

      expect(result).toEqual({
        workdir: '/path',
        file: null,
      });
    });

    it('should handle workdir with file param in different order', () => {
      window.location.search = '?file=test.md&workdir=/path/to/folder';

      const result = URLParamManager.validate();

      expect(result).toEqual({
        workdir: '/path/to/folder',
        file: 'test.md',
      });
    });

    it('should handle URL-encoded paths', () => {
      window.location.search = '?workdir=%2FUsers%2Ftest%2Fmy%20project&file=src%2Findex.js';

      const result = URLParamManager.validate();

      expect(result).toEqual({
        workdir: '/Users/test/my project',
        file: 'src/index.js',
      });
    });

    it('should ignore extra params not related to workdir/file', () => {
      window.location.search = '?workdir=/path&file=test.md&other=value&foo=bar';

      const result = URLParamManager.validate();

      expect(result).toEqual({
        workdir: '/path',
        file: 'test.md',
      });
    });
  });

  describe('getWorkdir()', () => {
    it('should return null when no workdir param', () => {
      window.location.search = '';

      const workdir = URLParamManager.getWorkdir();

      expect(workdir).toBeNull();
    });

    it('should return workdir value', () => {
      window.location.search = '?workdir=/Users/test/projects';

      const workdir = URLParamManager.getWorkdir();

      expect(workdir).toBe('/Users/test/projects');
    });

    it('should return null when workdir is empty', () => {
      window.location.search = '?workdir=';

      const workdir = URLParamManager.getWorkdir();

      expect(workdir).toBeNull();
    });

    it('should decode URL-encoded workdir', () => {
      window.location.search = '?workdir=%2FUsers%2Ftest%2Fmy%20project';

      const workdir = URLParamManager.getWorkdir();

      expect(workdir).toBe('/Users/test/my project');
    });
  });

  describe('getFile()', () => {
    it('should return null when no file param', () => {
      window.location.search = '?workdir=/path';

      const file = URLParamManager.getFile();

      expect(file).toBeNull();
    });

    it('should return null when file exists without workdir (invalid state)', () => {
      window.location.search = '?file=test.md';

      const file = URLParamManager.getFile();

      expect(file).toBeNull();
    });

    it('should return file value when valid (workdir exists)', () => {
      window.location.search = '?workdir=/path&file=README.md';

      const file = URLParamManager.getFile();

      expect(file).toBe('README.md');
    });

    it('should return null when file is empty', () => {
      window.location.search = '?workdir=/path&file=';

      const file = URLParamManager.getFile();

      expect(file).toBeNull();
    });

    it('should decode URL-encoded file path', () => {
      window.location.search = '?workdir=/path&file=src%2Fmy%20component.tsx';

      const file = URLParamManager.getFile();

      expect(file).toBe('src/my component.tsx');
    });
  });

  describe('isInvalidState()', () => {
    it('should return false when no params', () => {
      window.location.search = '';

      expect(URLParamManager.isInvalidState()).toBe(false);
    });

    it('should return false when workdir only', () => {
      window.location.search = '?workdir=/path';

      expect(URLParamManager.isInvalidState()).toBe(false);
    });

    it('should return false when workdir + file', () => {
      window.location.search = '?workdir=/path&file=test.md';

      expect(URLParamManager.isInvalidState()).toBe(false);
    });

    it('should return true when file without workdir (INVALID)', () => {
      window.location.search = '?file=test.md';

      expect(URLParamManager.isInvalidState()).toBe(true);
    });

    it('should return false when empty file with workdir', () => {
      window.location.search = '?workdir=/path&file=';

      expect(URLParamManager.isInvalidState()).toBe(false);
    });
  });

  describe('update()', () => {
    it('should set workdir param only when file is null', () => {
      URLParamManager.update('/Users/test/projects/myapp', null);

      expect(window.history.replaceState).toHaveBeenCalledWith(
        null,
        '',
        '/?workdir=/Users/test/projects/myapp'
      );
    });

    it('should set both workdir and file params', () => {
      URLParamManager.update('/Users/test/projects/myapp', 'README.md');

      expect(window.history.replaceState).toHaveBeenCalledWith(
        null,
        '',
        '/?workdir=/Users/test/projects/myapp&file=README.md'
      );
    });

    it('should clear params when both are null', () => {
      URLParamManager.update(null, null);

      expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/');
    });

    it('should clear params when workdir is null and file is provided (invalid combo)', () => {
      URLParamManager.update(null, 'test.md');

      expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/');
    });

    it('should URL-encode paths with spaces and special chars', () => {
      URLParamManager.update('/Users/test/my project', 'src/my component.tsx');

      // URLSearchParams encodes spaces as + or %20 (both valid)
      // We just verify the call was made and can decode properly
      expect(window.history.replaceState).toHaveBeenCalled();

      const callArgs = window.history.replaceState.mock.calls[0];
      const url = callArgs[2];

      // Verify URL contains encoded workdir and file
      expect(url).toContain('workdir=');
      expect(url).toContain('file=');

      // Verify decoding works correctly
      const urlObj = new URL(`http://localhost${url}`);
      expect(urlObj.searchParams.get('workdir')).toBe('/Users/test/my project');
      expect(urlObj.searchParams.get('file')).toBe('src/my component.tsx');
    });

    it('should treat empty string workdir as null', () => {
      URLParamManager.update('', null);

      expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/');
    });

    it('should treat empty string file as null', () => {
      URLParamManager.update('/path', '');

      expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/?workdir=/path');
    });

    it('should use history.replaceState (not pushState)', () => {
      URLParamManager.update('/path', 'file.md');

      expect(window.history.replaceState).toHaveBeenCalled();
      expect(window.history.pushState).not.toHaveBeenCalled();
    });
  });

  describe('clear()', () => {
    it('should remove workdir and file params only', () => {
      window.location.search = '?workdir=/path&file=test.md';

      URLParamManager.clear();

      expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/');
    });

    it('should work when already no params', () => {
      window.location.search = '';

      URLParamManager.clear();

      expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/');
    });

    it('should preserve other unrelated URL params', () => {
      window.location.search = '?workdir=/path&file=test.md&foo=bar&other=value';
      window.location.href = 'http://localhost/?workdir=/path&file=test.md&foo=bar&other=value';

      URLParamManager.clear();

      // Should preserve foo and other params
      const callArgs = window.history.replaceState.mock.calls[0];
      const url = callArgs[2];
      expect(url).toContain('foo=bar');
      expect(url).toContain('other=value');
      expect(url).not.toContain('workdir=');
      expect(url).not.toContain('file=');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle workspace open → file open → file close flow', () => {
      // Workspace opened
      URLParamManager.update('/Users/test/myapp', null);
      expect(window.history.replaceState).toHaveBeenLastCalledWith(
        null,
        '',
        '/?workdir=/Users/test/myapp'
      );

      // File opened
      window.location.search = '?workdir=/Users/test/myapp';
      URLParamManager.update('/Users/test/myapp', 'README.md');
      expect(window.history.replaceState).toHaveBeenLastCalledWith(
        null,
        '',
        '/?workdir=/Users/test/myapp&file=README.md'
      );

      // File closed (back to workspace only)
      window.location.search = '?workdir=/Users/test/myapp&file=README.md';
      URLParamManager.update('/Users/test/myapp', null);
      expect(window.history.replaceState).toHaveBeenLastCalledWith(
        null,
        '',
        '/?workdir=/Users/test/myapp'
      );
    });

    it('should handle invalid URL load → cleanup flow', () => {
      // Page loads with invalid combo
      window.location.search = '?file=test.md';

      // Validation detects invalid state
      const isInvalid = URLParamManager.isInvalidState();
      expect(isInvalid).toBe(true);

      // Clear params
      URLParamManager.clear();
      expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/');
    });

    it('should preserve workdir when switching files', () => {
      const workdir = '/Users/test/myapp';

      // Open first file
      URLParamManager.update(workdir, 'file1.md');
      expect(window.history.replaceState).toHaveBeenLastCalledWith(
        null,
        '',
        '/?workdir=/Users/test/myapp&file=file1.md'
      );

      // Switch to second file
      window.location.search = '?workdir=/Users/test/myapp&file=file1.md';
      URLParamManager.update(workdir, 'file2.md');
      expect(window.history.replaceState).toHaveBeenLastCalledWith(
        null,
        '',
        '/?workdir=/Users/test/myapp&file=file2.md'
      );
    });
  });
});
