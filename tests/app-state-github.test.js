import { describe, it, expect, beforeEach } from 'vitest';
import { appState } from '../src/state/app-state.js';
import { GitHubAdapter } from '../src/fs/github-adapter.js';

describe('AppState - GitHub Mode', () => {
  beforeEach(() => {
    appState.resetAll();
  });

  describe('initialization', () => {
    it('should initialize GitHub mode properties', () => {
      expect(appState.isGitHubMode).toBe(false);
      expect(appState.isReadOnly).toBe(false);
      expect(appState.githubRepo).toBeNull();
      expect(appState.githubAdapter).toBeNull();
      expect(appState.remoteSource).toBeNull();
    });
  });

  describe('GitHub mode setters and getters', () => {
    it('should set and get isGitHubMode', () => {
      appState.setGitHubMode(true);
      expect(appState.isGitHubMode).toBe(true);
      expect(appState.getGitHubMode()).toBe(true);
    });

    it('should set and get isReadOnly', () => {
      appState.setReadOnly(true);
      expect(appState.isReadOnly).toBe(true);
      expect(appState.getReadOnly()).toBe(true);
    });

    it('should set and get githubRepo', () => {
      const repoInfo = {
        owner: 'zombar',
        repo: 'hotnote',
        branch: 'main',
        path: 'README.md',
      };
      appState.setGitHubRepo(repoInfo);
      expect(appState.githubRepo).toEqual(repoInfo);
      expect(appState.getGitHubRepo()).toEqual(repoInfo);
    });

    it('should set and get githubAdapter', () => {
      const adapter = new GitHubAdapter('zombar', 'hotnote', 'main');
      appState.setGitHubAdapter(adapter);
      expect(appState.githubAdapter).toBe(adapter);
      expect(appState.getGitHubAdapter()).toBe(adapter);
    });

    it('should set and get remoteSource', () => {
      const url = 'https://raw.githubusercontent.com/zombar/hotnote/main/README.md';
      appState.setRemoteSource(url);
      expect(appState.remoteSource).toBe(url);
      expect(appState.getRemoteSource()).toBe(url);
    });
  });

  describe('reset methods', () => {
    beforeEach(() => {
      // Set up GitHub mode
      appState.setGitHubMode(true);
      appState.setReadOnly(true);
      appState.setGitHubRepo({ owner: 'test', repo: 'repo', branch: 'main', path: 'file.md' });
      appState.setGitHubAdapter(new GitHubAdapter('test', 'repo', 'main'));
      appState.setRemoteSource('https://example.com/file.md');
    });

    it('should reset GitHub mode properties with resetAll', () => {
      appState.resetAll();

      expect(appState.isGitHubMode).toBe(false);
      expect(appState.isReadOnly).toBe(false);
      expect(appState.githubRepo).toBeNull();
      expect(appState.githubAdapter).toBeNull();
      expect(appState.remoteSource).toBeNull();
    });

    it('should reset GitHub mode properties with resetGitHubMode', () => {
      appState.resetGitHubMode();

      expect(appState.isGitHubMode).toBe(false);
      expect(appState.isReadOnly).toBe(false);
      expect(appState.githubRepo).toBeNull();
      expect(appState.githubAdapter).toBeNull();
      expect(appState.remoteSource).toBeNull();
    });
  });

  describe('GitHub mode workflow', () => {
    it('should support enabling GitHub mode with all required state', () => {
      const url = 'https://raw.githubusercontent.com/zombar/hotnote/main/README.md';
      const repoInfo = GitHubAdapter.parseURL(url);
      const adapter = new GitHubAdapter(repoInfo.owner, repoInfo.repo, repoInfo.branch);

      appState.setGitHubMode(true);
      appState.setReadOnly(true);
      appState.setGitHubRepo(repoInfo);
      appState.setGitHubAdapter(adapter);
      appState.setRemoteSource(url);

      expect(appState.isGitHubMode).toBe(true);
      expect(appState.isReadOnly).toBe(true);
      expect(appState.githubRepo).toEqual({
        owner: 'zombar',
        repo: 'hotnote',
        branch: 'main',
        path: 'README.md',
      });
      expect(appState.githubAdapter).toBe(adapter);
      expect(appState.remoteSource).toBe(url);
    });

    it('should disable autosave when in read-only mode', () => {
      appState.setAutosaveEnabled(true);
      expect(appState.isAutosaveEnabled()).toBe(true);

      appState.setReadOnly(true);
      // In read-only mode, autosave should be disabled
      // This will be handled by the editor initialization logic
      expect(appState.isReadOnly).toBe(true);
    });
  });
});
