import { FocusManager } from '../focus-manager.js';

/**
 * Centralized application state management
 * Consolidates all application state variables into a single, manageable class
 */
class AppState {
  constructor() {
    // Editor state
    this.editorView = null; // For non-markdown files (direct CodeMirror)
    this.editorManager = null; // For markdown files (handles WYSIWYG/source switching)
    this.isDirty = false;
    this.originalContent = ''; // For detecting undo to original state

    // File system state
    this.currentFileHandle = null;
    this.currentFilename = 'untitled';
    this.currentDirHandle = null;
    this.rootDirHandle = null; // The initially opened directory (for session file)
    this.currentPath = []; // Array of {name, handle} objects

    // Previous file state (for restoration when canceling breadcrumb navigation)
    this.previousFileHandle = null;
    this.previousFilename = '';
    this.previousPath = null; // For restoring path when canceling breadcrumb navigation
    this.isNavigatingBreadcrumbs = false; // Flag to enable restoration on picker close

    // Navigation state
    this.navigationHistory = [];
    this.historyIndex = -1;
    this.isPopStateNavigation = false; // Prevent duplicate history entries during browser back/forward

    // Autosave state
    this.autosaveEnabled = true;
    this.autosaveInterval = null;

    // Session restoration state
    this.isRestoringSession = false; // Track if we're currently restoring from session
    this.lastRestorationTime = 0; // Track when we last restored state to prevent premature saves

    // GitHub mode state
    this.isGitHubMode = false; // Flag indicating GitHub reader mode
    this.isReadOnly = false; // Flag indicating read-only mode (for GitHub and other remote files)
    this.githubRepo = null; // GitHub repository info: {owner, repo, branch, path}
    this.githubAdapter = null; // GitHubAdapter instance for API calls
    this.remoteSource = null; // Remote source URL for the current file

    // Focus management
    this.focusManager = new FocusManager();
  }

  // Getters
  getEditor() {
    return this.editorView;
  }

  getEditorManager() {
    return this.editorManager;
  }

  getCurrentFile() {
    return this.currentFileHandle;
  }

  getCurrentFilename() {
    return this.currentFilename;
  }

  isDirtyState() {
    return this.isDirty;
  }

  getOriginalContent() {
    return this.originalContent;
  }

  getCurrentPath() {
    return this.currentPath;
  }

  getNavigationHistory() {
    return this.navigationHistory;
  }

  getHistoryIndex() {
    return this.historyIndex;
  }

  isAutosaveEnabled() {
    return this.autosaveEnabled;
  }

  getFocusManager() {
    return this.focusManager;
  }

  getGitHubMode() {
    return this.isGitHubMode;
  }

  getReadOnly() {
    return this.isReadOnly;
  }

  getGitHubRepo() {
    return this.githubRepo;
  }

  getGitHubAdapter() {
    return this.githubAdapter;
  }

  getRemoteSource() {
    return this.remoteSource;
  }

  // Setters
  setEditor(editor) {
    this.editorView = editor;
  }

  setEditorManager(manager) {
    this.editorManager = manager;
  }

  setCurrentFile(handle) {
    this.currentFileHandle = handle;
  }

  setCurrentFilename(filename) {
    this.currentFilename = filename;
  }

  setCurrentDirHandle(handle) {
    this.currentDirHandle = handle;
  }

  setRootDirHandle(handle) {
    this.rootDirHandle = handle;
  }

  setCurrentPath(path) {
    this.currentPath = path;
  }

  markDirty(dirty = true) {
    this.isDirty = dirty;
  }

  setOriginalContent(content) {
    this.originalContent = content;
  }

  setHistoryIndex(index) {
    this.historyIndex = index;
  }

  setPopStateNavigation(value) {
    this.isPopStateNavigation = value;
  }

  setAutosaveEnabled(enabled) {
    this.autosaveEnabled = enabled;
  }

  setAutosaveInterval(interval) {
    this.autosaveInterval = interval;
  }

  setRestoringSession(value) {
    this.isRestoringSession = value;
  }

  setLastRestorationTime(time) {
    this.lastRestorationTime = time;
  }

  setGitHubMode(value) {
    this.isGitHubMode = value;
  }

  setReadOnly(value) {
    this.isReadOnly = value;
  }

  setGitHubRepo(repoInfo) {
    this.githubRepo = repoInfo;
  }

  setGitHubAdapter(adapter) {
    this.githubAdapter = adapter;
  }

  setRemoteSource(url) {
    this.remoteSource = url;
  }

  // Navigation history methods
  addToNavigationHistory(entry) {
    this.navigationHistory.push(entry);
  }

  clearNavigationHistory() {
    this.navigationHistory = [];
    this.historyIndex = -1;
  }

  // Reset methods
  reset() {
    this.isDirty = false;
    this.currentFileHandle = null;
    this.currentFilename = 'untitled';
    this.originalContent = '';
  }

  resetAll() {
    this.editorView = null;
    this.editorManager = null;
    this.isDirty = false;
    this.originalContent = '';
    this.currentFileHandle = null;
    this.currentFilename = 'untitled';
    this.currentDirHandle = null;
    this.rootDirHandle = null;
    this.currentPath = [];
    this.previousFileHandle = null;
    this.previousFilename = '';
    this.previousPath = null;
    this.isNavigatingBreadcrumbs = false;
    this.navigationHistory = [];
    this.historyIndex = -1;
    this.isPopStateNavigation = false;
    this.autosaveInterval = null;
    this.isRestoringSession = false;
    this.lastRestorationTime = 0;
    this.isGitHubMode = false;
    this.isReadOnly = false;
    this.githubRepo = null;
    this.githubAdapter = null;
    this.remoteSource = null;
  }

  resetGitHubMode() {
    this.isGitHubMode = false;
    this.isReadOnly = false;
    this.githubRepo = null;
    this.githubAdapter = null;
    this.remoteSource = null;
  }
}

// Export singleton instance
export const appState = new AppState();
