import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubAdapter } from '../src/fs/github-adapter.js';

describe('GitHubAdapter', () => {
  describe('parseURL', () => {
    it('should parse raw.githubusercontent.com URLs', () => {
      const url = 'https://raw.githubusercontent.com/zombar/hotnote/main/README.md';
      const result = GitHubAdapter.parseURL(url);

      expect(result).toEqual({
        owner: 'zombar',
        repo: 'hotnote',
        branch: 'main',
        path: 'README.md',
      });
    });

    it('should parse raw.githubusercontent.com URLs with nested paths', () => {
      const url = 'https://raw.githubusercontent.com/owner/repo/main/docs/guide/intro.md';
      const result = GitHubAdapter.parseURL(url);

      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        branch: 'main',
        path: 'docs/guide/intro.md',
      });
    });

    it('should parse github.com blob URLs', () => {
      const url = 'https://github.com/zombar/hotnote/blob/main/README.md';
      const result = GitHubAdapter.parseURL(url);

      expect(result).toEqual({
        owner: 'zombar',
        repo: 'hotnote',
        branch: 'main',
        path: 'README.md',
      });
    });

    it('should throw error for invalid URLs', () => {
      expect(() => GitHubAdapter.parseURL('https://invalid.com/file.md')).toThrow(
        'Invalid GitHub URL format'
      );
    });

    it('should throw error for malformed GitHub URLs', () => {
      expect(() => GitHubAdapter.parseURL('https://github.com/owner')).toThrow(
        'Invalid GitHub URL format'
      );
    });
  });

  describe('constructor', () => {
    it('should create instance with parsed URL data', () => {
      const adapter = new GitHubAdapter('owner', 'repo', 'main');

      expect(adapter.owner).toBe('owner');
      expect(adapter.repo).toBe('repo');
      expect(adapter.branch).toBe('main');
    });

    it('should default to main branch if not specified', () => {
      const adapter = new GitHubAdapter('owner', 'repo');

      expect(adapter.branch).toBe('main');
    });
  });

  describe('readFile', () => {
    let adapter;
    let fetchMock;

    beforeEach(() => {
      adapter = new GitHubAdapter('owner', 'repo', 'main');
      fetchMock = vi.fn();
      global.fetch = fetchMock;
    });

    it('should fetch file content from raw.githubusercontent.com', async () => {
      const mockContent = '# Hello World';
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => mockContent,
      });

      const content = await adapter.readFile('README.md');

      expect(content).toBe(mockContent);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/owner/repo/main/README.md'
      );
    });

    it('should throw error for failed fetch', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(adapter.readFile('missing.md')).rejects.toThrow('HTTP 404: Not Found');
    });

    it('should handle network errors', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));

      await expect(adapter.readFile('README.md')).rejects.toThrow('Network error');
    });
  });

  describe('listDirectory', () => {
    let adapter;
    let fetchMock;

    beforeEach(() => {
      adapter = new GitHubAdapter('owner', 'repo', 'main');
      fetchMock = vi.fn();
      global.fetch = fetchMock;
    });

    it('should list directory contents via GitHub API', async () => {
      const mockResponse = [
        {
          name: 'README.md',
          type: 'file',
          size: 1234,
          path: 'README.md',
          download_url: 'https://raw.githubusercontent.com/owner/repo/main/README.md',
        },
        {
          name: 'src',
          type: 'dir',
          size: 0,
          path: 'src',
          download_url: null,
        },
      ];

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const items = await adapter.listDirectory('');

      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        name: 'README.md',
        type: 'file',
        path: 'README.md',
      });
      expect(items[1]).toMatchObject({
        name: 'src',
        type: 'dir',
        path: 'src',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/contents/?ref=main'
      );
    });

    it('should list nested directory contents', async () => {
      const mockResponse = [
        {
          name: 'index.js',
          type: 'file',
          size: 500,
          path: 'src/index.js',
          download_url: 'https://raw.githubusercontent.com/owner/repo/main/src/index.js',
        },
      ];

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const items = await adapter.listDirectory('src');

      expect(items).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/contents/src?ref=main'
      );
    });

    it('should throw error for failed API call', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(adapter.listDirectory('invalid')).rejects.toThrow('HTTP 404: Not Found');
    });
  });

  describe('getMetadata', () => {
    let adapter;
    let fetchMock;

    beforeEach(() => {
      adapter = new GitHubAdapter('owner', 'repo', 'main');
      fetchMock = vi.fn();
      global.fetch = fetchMock;
    });

    it('should fetch file metadata from GitHub API', async () => {
      const mockResponse = {
        name: 'README.md',
        size: 1234,
        sha: 'abc123',
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const metadata = await adapter.getMetadata('README.md');

      expect(metadata).toMatchObject({
        size: 1234,
        sha: 'abc123',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/contents/README.md?ref=main'
      );
    });
  });

  describe('URL validation', () => {
    it('should validate whitelisted GitHub domains', () => {
      expect(() =>
        GitHubAdapter.parseURL('https://raw.githubusercontent.com/a/b/c/d.md')
      ).not.toThrow();

      expect(() => GitHubAdapter.parseURL('https://github.com/a/b/blob/c/d.md')).not.toThrow();
    });

    it('should reject non-GitHub URLs', () => {
      expect(() => GitHubAdapter.parseURL('https://evil.com/fake/path')).toThrow(
        'Invalid GitHub URL format'
      );
    });
  });
});
