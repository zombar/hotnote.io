import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { URLParamManager } from '../../src/navigation/url-param-manager.js';

/**
 * Unit tests for URLParamManager - GitHub Reader support
 * Tests gitreader URL parameter handling
 */
describe('URLParamManager - GitHub Reader', () => {
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

  describe('getGitReader()', () => {
    it('should return null when no gitreader param exists', () => {
      window.location.search = '';

      const result = URLParamManager.getGitReader();

      expect(result).toBeNull();
    });

    it('should return gitreader URL for raw.githubusercontent.com', () => {
      const githubUrl = 'https://raw.githubusercontent.com/zombar/hotnote/main/README.md';
      window.location.search = `?gitreader=${encodeURIComponent(githubUrl)}`;

      const result = URLParamManager.getGitReader();

      expect(result).toBe(githubUrl);
    });

    it('should return gitreader URL for github.com blob', () => {
      const githubUrl = 'https://github.com/zombar/hotnote/blob/main/README.md';
      window.location.search = `?gitreader=${encodeURIComponent(githubUrl)}`;

      const result = URLParamManager.getGitReader();

      expect(result).toBe(githubUrl);
    });

    it('should return null for empty gitreader param', () => {
      window.location.search = '?gitreader=';

      const result = URLParamManager.getGitReader();

      expect(result).toBeNull();
    });

    it('should handle nested path URLs', () => {
      const githubUrl = 'https://raw.githubusercontent.com/owner/repo/branch/docs/guide/intro.md';
      window.location.search = `?gitreader=${encodeURIComponent(githubUrl)}`;

      const result = URLParamManager.getGitReader();

      expect(result).toBe(githubUrl);
    });
  });

  describe('hasGitReader()', () => {
    it('should return false when no gitreader param exists', () => {
      window.location.search = '';

      expect(URLParamManager.hasGitReader()).toBe(false);
    });

    it('should return true when gitreader param exists with value', () => {
      window.location.search = '?gitreader=https://raw.githubusercontent.com/a/b/c/d.md';

      expect(URLParamManager.hasGitReader()).toBe(true);
    });

    it('should return false when gitreader param is empty', () => {
      window.location.search = '?gitreader=';

      expect(URLParamManager.hasGitReader()).toBe(false);
    });
  });

  describe('setGitReader()', () => {
    it('should set gitreader parameter', () => {
      const githubUrl = 'https://raw.githubusercontent.com/zombar/hotnote/main/README.md';

      URLParamManager.setGitReader(githubUrl);

      expect(window.history.replaceState).toHaveBeenCalledWith(
        null,
        '',
        expect.stringContaining('gitreader=')
      );
    });

    it('should encode gitreader URL properly', () => {
      const githubUrl = 'https://raw.githubusercontent.com/owner/repo/main/file with spaces.md';

      URLParamManager.setGitReader(githubUrl);

      const call = window.history.replaceState.mock.calls[0];
      const newUrl = call[2];
      expect(newUrl).toContain('gitreader=');
      // URL should be encoded (URLSearchParams encodes spaces as + which is valid)
      expect(newUrl).toMatch(/file[\+%20]with[\+%20]spaces\.md/);
    });

    it('should clear gitreader parameter when passed null', () => {
      window.location.search = '?gitreader=https://example.com/file.md';

      URLParamManager.setGitReader(null);

      const call = window.history.replaceState.mock.calls[0];
      const newUrl = call[2];
      expect(newUrl).not.toContain('gitreader');
    });

    it('should clear gitreader parameter when passed empty string', () => {
      window.location.search = '?gitreader=https://example.com/file.md';

      URLParamManager.setGitReader('');

      const call = window.history.replaceState.mock.calls[0];
      const newUrl = call[2];
      expect(newUrl).not.toContain('gitreader');
    });

    it('should preserve other query parameters when setting gitreader', () => {
      window.location.search = '?foo=bar&baz=qux';
      window.location.href = 'http://localhost:3000/?foo=bar&baz=qux';

      URLParamManager.setGitReader('https://example.com/file.md');

      const call = window.history.replaceState.mock.calls[0];
      const newUrl = call[2];
      expect(newUrl).toContain('gitreader=');
      expect(newUrl).toContain('foo=bar');
      expect(newUrl).toContain('baz=qux');
    });
  });

  describe('clearGitReader()', () => {
    it('should clear gitreader parameter', () => {
      window.location.search = '?gitreader=https://example.com/file.md';
      window.location.href = 'http://localhost:3000/?gitreader=https://example.com/file.md';

      URLParamManager.clearGitReader();

      const call = window.history.replaceState.mock.calls[0];
      const newUrl = call[2];
      expect(newUrl).not.toContain('gitreader');
    });

    it('should preserve other query parameters when clearing gitreader', () => {
      window.location.search = '?gitreader=https://example.com/file.md&foo=bar';
      window.location.href = 'http://localhost:3000/?gitreader=https://example.com/file.md&foo=bar';

      URLParamManager.clearGitReader();

      const call = window.history.replaceState.mock.calls[0];
      const newUrl = call[2];
      expect(newUrl).not.toContain('gitreader');
      expect(newUrl).toContain('foo=bar');
    });

    it('should handle clearing when no gitreader exists', () => {
      window.location.search = '?foo=bar';
      window.location.href = 'http://localhost:3000/?foo=bar';

      URLParamManager.clearGitReader();

      const call = window.history.replaceState.mock.calls[0];
      const newUrl = call[2];
      expect(newUrl).not.toContain('gitreader');
      expect(newUrl).toContain('foo=bar');
    });
  });

  describe('gitreader and workdir independence', () => {
    it('should allow gitreader and workdir to coexist', () => {
      window.location.search = '?workdir=/path&gitreader=https://example.com/file.md';
      window.location.href =
        'http://localhost:3000/?workdir=/path&gitreader=https://example.com/file.md';

      const workdir = URLParamManager.getWorkdir();
      const gitreader = URLParamManager.getGitReader();

      expect(workdir).toBe('/path');
      expect(gitreader).toBe('https://example.com/file.md');
    });

    it('should not affect workdir/file when setting gitreader', () => {
      window.location.search = '?workdir=/path&file=test.md';
      window.location.href = 'http://localhost:3000/?workdir=/path&file=test.md';

      URLParamManager.setGitReader('https://example.com/file.md');

      const call = window.history.replaceState.mock.calls[0];
      const newUrl = call[2];
      // workdir may be encoded as %2F or / depending on URLSearchParams implementation
      expect(newUrl).toMatch(/workdir=(%2F|\/)path/);
      expect(newUrl).toContain('file=test.md');
      expect(newUrl).toContain('gitreader=');
    });

    it('should not affect gitreader when updating workdir/file', () => {
      window.location.search = '?gitreader=https://example.com/file.md';
      window.location.href = 'http://localhost:3000/?gitreader=https://example.com/file.md';

      URLParamManager.update('/new/path', 'newfile.md');

      const call = window.history.replaceState.mock.calls[0];
      const newUrl = call[2];
      expect(newUrl).toContain('gitreader=');
      expect(newUrl).toContain('workdir=/new/path');
      expect(newUrl).toContain('file=newfile.md');
    });
  });
});
