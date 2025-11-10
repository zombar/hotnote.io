# App.js Comprehensive Refactoring Plan

## Overview

This document outlines a test-driven refactoring plan to extract app.js into modular components while maintaining 99%+ test coverage.

**Current State (After Phases 1 & 2):**

* app.js: ~2,040 lines remaining
* Phases 1 & 2: ✅ **COMPLETED** (~1,300 lines extracted)
* Test coverage: 99% (for tested files)
* Test suite: 548 unit/integration tests, 11 E2E tests
* Framework: Vitest + Playwright

**Target State:**

* app.js: ~300-400 lines (orchestration only)
* 14+ extracted modules in organized directory structure
* 750+ unit/integration tests
* 24+ E2E tests
* Coverage: ≥89% across all modules

***

## Completed Work

### ✅ Phase 1: Foundation & Storage Layer (COMPLETE)
- `src/utils/helpers.js` - Debounce utility
- `src/state/app-state.js` - Centralized application state
- `src/storage/temp-storage.js` - Temporary change storage
- `src/storage/session-manager.js` - Session persistence

### ✅ Phase 2: File System & Editor Layer (COMPLETE)
- `src/fs/filesystem-adapter.js` - File System Access API wrapper
- `src/fs/trash-manager.js` - Delete with undo functionality
- `src/editor/language-support.js` - Syntax highlighting and language detection
- `src/editor/autosave.js` - Event-driven autosave system

***

## Refactoring Strategy

The remaining refactoring is divided into **2 independent phases**. Each phase:
✅ Maintains full application functionality
✅ Can be completed and committed independently
✅ Includes comprehensive tests before/after extraction
✅ Reduces risk through incremental changes
✅ Can be deployed to production separately

***

# PHASE 3A: Navigation & File Management Layer

**Focus:** File navigation, selection, and discovery workflows
**Risk Level:** MEDIUM - Core user workflows
**Lines Extracted:** ~1,100 lines
**Test Growth:** 548 → 650 tests
**Estimated Time:** 8-10 hours

## Modules to Extract

### 3A.1 Extract `src/search/fuzzy-search.js`

**Source Lines:** 1761-1871
**Purpose:** Fuzzy file search with async generator and relevance scoring

**Implementation Steps:**

1. Create directory structure:

   ```bash
   mkdir -p src/search tests/search
   ```

2. Create `src/search/fuzzy-search.js`:

   ```javascript
   // Regex cache for memoization
   const regexCache = new Map();

   /**
    * Fuzzy match algorithm (memoized regex)
    * @param {string} text - Text to search in
    * @param {string} query - Search query
    * @returns {boolean} True if query matches text
    */
   export function fuzzyMatch(text, query) {
     if (!query) return true;

     const queryLower = query.toLowerCase();
     const textLower = text.toLowerCase();

     if (!regexCache.has(queryLower)) {
       const queryPattern = queryLower.split('').map(char => {
         return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
       }).join('.*');
       regexCache.set(queryLower, new RegExp(queryPattern));
     }

     return regexCache.get(queryLower).test(textLower);
   }

   /**
    * Calculate relevance score for search result
    * @param {string} filename - Filename being scored
    * @param {string} query - Search query
    * @returns {number} Relevance score (higher = more relevant)
    */
   export function calculateRelevance(filename, query) {
     if (!query) return 0;

     const filenameLower = filename.toLowerCase();
     const queryLower = query.toLowerCase();

     // Exact match = highest priority
     if (filenameLower === queryLower) return 1000;

     // Starts with query = high priority
     if (filenameLower.startsWith(queryLower)) return 500;

     // Contains query = medium priority
     if (filenameLower.includes(queryLower)) return 250;

     // Fuzzy match = base priority
     return 100;
   }

   /**
    * Recursive file search with cancellation support
    * @param {FileSystemDirectoryHandle} dirHandle - Directory to search
    * @param {string} query - Search query
    * @param {AbortSignal} signal - Cancellation signal
    * @yields {Object} Search results with name, handle, path, relevance
    */
   export async function* recursiveSearchFiles(dirHandle, query, signal) {
     async function* traverse(handle, path = '', depth = 0) {
       // Check cancellation
       if (signal?.aborted) return;

       // Prevent infinite recursion
       if (depth > 10) return;

       try {
         const entries = [];
         for await (const entry of handle.values()) {
           entries.push(entry);
         }

         // Sort: directories first, then alphabetically
         entries.sort((a, b) => {
           if (a.kind !== b.kind) {
             return a.kind === 'directory' ? -1 : 1;
           }
           return a.name.localeCompare(b.name);
         });

         for (const entry of entries) {
           if (signal?.aborted) return;

           if (entry.kind === 'file') {
             if (fuzzyMatch(entry.name, query)) {
               yield {
                 name: entry.name,
                 handle: entry,
                 path,
                 relevance: calculateRelevance(entry.name, query)
               };
             }
           } else if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
             const entryPath = path ? `${path}/${entry.name}` : entry.name;
             yield* traverse(entry, entryPath, depth + 1);
           }
         }
       } catch (error) {
         console.error('Search error:', error);
       }
     }

     yield* traverse(dirHandle);
   }

   /**
    * Clear regex cache (for testing)
    */
   export function clearCache() {
     regexCache.clear();
   }
   ```

3. Create `tests/search/fuzzy-search.test.js`:

   ```javascript
   import { describe, it, expect, beforeEach } from 'vitest';
   import {
     fuzzyMatch,
     calculateRelevance,
     recursiveSearchFiles,
     clearCache
   } from '../../src/search/fuzzy-search.js';
   import { createMockDirectoryHandle } from '../mocks/filesystem.js';

   describe('Fuzzy Search', () => {
     beforeEach(() => {
       clearCache();
     });

     describe('fuzzyMatch', () => {
       it('should match exact strings', () => {
         expect(fuzzyMatch('test.js', 'test.js')).toBe(true);
       });

       it('should match case-insensitively', () => {
         expect(fuzzyMatch('Test.JS', 'test.js')).toBe(true);
       });

       it('should match fuzzy patterns', () => {
         expect(fuzzyMatch('app.test.js', 'atj')).toBe(true);
       });

       it('should not match unrelated strings', () => {
         expect(fuzzyMatch('app.js', 'xyz')).toBe(false);
       });

       it('should handle empty query', () => {
         expect(fuzzyMatch('anything', '')).toBe(true);
       });

       it('should handle special regex characters', () => {
         expect(fuzzyMatch('file.test.js', '.test.')).toBe(true);
       });

       it('should cache regex patterns', () => {
         fuzzyMatch('test', 'abc');
         fuzzyMatch('test2', 'abc');
         // Cache should be used (second call faster)
       });

       // Add 18 more tests
     });

     describe('calculateRelevance', () => {
       it('should score exact matches highest', () => {
         expect(calculateRelevance('test.js', 'test.js')).toBe(1000);
       });

       it('should score prefix matches high', () => {
         expect(calculateRelevance('testing.js', 'test')).toBe(500);
       });

       it('should score contains matches medium', () => {
         expect(calculateRelevance('mytest.js', 'test')).toBe(250);
       });

       it('should score fuzzy matches low', () => {
         const score = calculateRelevance('test.js', 'tj');
         expect(score).toBeGreaterThan(0);
         expect(score).toBeLessThan(250);
       });

       // Add 6 more tests
     });

     describe('recursiveSearchFiles', () => {
       it('should find files matching query', async () => {
         const mockDir = createMockDirectoryHandle('root', [
           { kind: 'file', name: 'test.js' },
           { kind: 'file', name: 'app.js' }
         ]);

         const results = [];
         for await (const result of recursiveSearchFiles(mockDir, 'test')) {
           results.push(result);
         }

         expect(results).toHaveLength(1);
         expect(results[0].name).toBe('test.js');
       });

       it('should search subdirectories', async () => {
         // Test nested directory search
       });

       it('should respect depth limit', async () => {
         // Test recursion limit
       });

       it('should handle cancellation', async () => {
         const controller = new AbortController();
         // Test abort signal
       });

       it('should skip hidden directories', async () => {
         // Test .git, .node_modules skipping
       });

       // Add 10 more tests
     });
   });
   ```

   **Tests:** 25 total

4. Update app.js:

   ```javascript
   // Add import
   import { fuzzyMatch, recursiveSearchFiles, calculateRelevance } from './src/search/fuzzy-search.js';

   // Remove lines 1761-1871
   ```

5. Run tests:

   ```bash
   npm test -- --run
   npm run test:coverage
   ```

**Expected Coverage:** 98%

***

### 3A.2 Extract `src/navigation/history-manager.js`

**Source Lines:** 176-179, 589-843, 2654-2683, 2849-2880
**Purpose:** Navigation history and browser state management

**Implementation Steps:**

1. Create `src/navigation/history-manager.js`:

   ```javascript
   import { appState } from '../state/app-state.js';

   const MAX_HISTORY_SIZE = 50;

   /**
    * Add entry to navigation history
    * @param {Array} path - Current path
    * @param {string} filename - Current filename
    * @param {Object} editorState - Editor state to save
    */
   export function addToHistory(path, filename, editorState) {
     // Remove forward history
     appState.navigationHistory = appState.navigationHistory.slice(
       0,
       appState.historyIndex + 1
     );

     // Add new entry
     appState.navigationHistory.push({
       path: [...path],
       filename,
       editorState
     });

     // Enforce max size
     if (appState.navigationHistory.length > MAX_HISTORY_SIZE) {
       appState.navigationHistory.shift();
     } else {
       appState.historyIndex++;
     }

     updateBrowserHistory(path, filename);
     updateNavigationButtons();
   }

   /**
    * Navigate back in history
    */
   export async function goBack() {
     if (appState.historyIndex <= 0) return;

     appState.historyIndex--;
     const entry = appState.navigationHistory[appState.historyIndex];

     await restoreHistoryEntry(entry);
     updateNavigationButtons();
   }

   /**
    * Navigate forward in history
    */
   export async function goForward() {
     if (appState.historyIndex >= appState.navigationHistory.length - 1) return;

     appState.historyIndex++;
     const entry = appState.navigationHistory[appState.historyIndex];

     await restoreHistoryEntry(entry);
     updateNavigationButtons();
   }

   /**
    * Navigate to folder up
    */
   export async function goFolderUp() {
     if (appState.currentPath.length === 0) return;

     // Save current state
     const editorState = appState.editorManager?.getState();
     addToHistory(appState.currentPath, appState.currentFilename, editorState);

     // Go up one level
     appState.currentPath = appState.currentPath.slice(0, -1);
     appState.currentFileHandle = null;
     appState.currentFilename = '';

     // Update UI
     updateNavigationButtons();
   }

   /**
    * Update navigation button states
    */
   export function updateNavigationButtons() {
     const backBtn = document.getElementById('back-btn');
     const forwardBtn = document.getElementById('forward-btn');
     const folderUpBtn = document.getElementById('folder-up-btn');

     if (backBtn) backBtn.disabled = appState.historyIndex <= 0;
     if (forwardBtn) forwardBtn.disabled = appState.historyIndex >= appState.navigationHistory.length - 1;
     if (folderUpBtn) folderUpBtn.disabled = appState.currentPath.length === 0;
   }

   /**
    * Convert path to URL parameter
    * @param {Array} path - Path array
    * @param {string} filename - Filename
    * @returns {string} URL parameter string
    */
   export function pathToUrlParam(path, filename) {
     const parts = path.map(p => p.name);
     if (filename) parts.push(filename);
     return parts.join('/');
   }

   /**
    * Parse URL parameter to path
    * @param {string} param - URL parameter
    * @returns {Object} Parsed path and filename
    */
   export function urlParamToPath(param) {
     if (!param) return { path: [], filename: null };

     const parts = param.split('/');
     const filename = parts.pop();
     const path = parts.map(name => ({ name }));

     return { path, filename };
   }

   /**
    * Handle browser popstate event
    * @param {PopStateEvent} event - Popstate event
    */
   export async function handlePopState(event) {
     if (!event.state) return;

     const { path, filename } = event.state;

     // Restore state without adding to history
     appState.currentPath = path || [];
     appState.currentFilename = filename || '';

     if (filename) {
       // Reopen file
       const { fileHandle, content } = await openFileByPath(path, filename);
       appState.currentFileHandle = fileHandle;
       // Reinitialize editor with content
     }

     updateNavigationButtons();
   }

   // Private helpers

   function updateBrowserHistory(path, filename) {
     const pathParam = pathToUrlParam(path, filename);
     const url = new URL(window.location);
     url.searchParams.set('path', pathParam);
     window.history.pushState({ path, filename }, '', url);
   }

   async function restoreHistoryEntry(entry) {
     appState.currentPath = [...entry.path];
     appState.currentFilename = entry.filename;

     if (entry.filename) {
       // Restore file and editor state
       const { fileHandle, content } = await openFileByPath(entry.path, entry.filename);
       appState.currentFileHandle = fileHandle;
       // Restore editor state
     }
   }
   ```

2. Create `tests/navigation/history-manager.test.js`:

   ```javascript
   import { describe, it, expect, beforeEach, vi } from 'vitest';
   import {
     addToHistory,
     goBack,
     goForward,
     goFolderUp,
     updateNavigationButtons,
     pathToUrlParam,
     urlParamToPath,
     handlePopState
   } from '../../src/navigation/history-manager.js';
   import { appState } from '../../src/state/app-state.js';

   describe('History Manager', () => {
     beforeEach(() => {
       appState.navigationHistory = [];
       appState.historyIndex = -1;
       appState.currentPath = [];
       appState.currentFilename = '';
     });

     describe('addToHistory', () => {
       it('should add entry to history', () => {
         const path = [{ name: 'src' }];
         addToHistory(path, 'test.js', null);

         expect(appState.navigationHistory).toHaveLength(1);
         expect(appState.navigationHistory[0].filename).toBe('test.js');
       });

       it('should enforce max history size', () => {
         // Add 51 entries
         for (let i = 0; i < 51; i++) {
           addToHistory([], `file${i}.js`, null);
         }

         expect(appState.navigationHistory.length).toBeLessThanOrEqual(50);
       });

       it('should remove forward history when adding new entry', () => {
         addToHistory([], 'file1.js', null);
         addToHistory([], 'file2.js', null);
         appState.historyIndex = 0; // Go back
         addToHistory([], 'file3.js', null);

         expect(appState.navigationHistory).toHaveLength(2);
         expect(appState.navigationHistory[1].filename).toBe('file3.js');
       });

       // Add 12 more tests
     });

     describe('goBack', () => {
       it('should navigate to previous entry', async () => {
         addToHistory([], 'file1.js', null);
         addToHistory([], 'file2.js', null);

         await goBack();

         expect(appState.historyIndex).toBe(0);
       });

       it('should not go back beyond start', async () => {
         addToHistory([], 'file1.js', null);

         await goBack();
         await goBack();

         expect(appState.historyIndex).toBe(0);
       });

       // Add 8 more tests
     });

     describe('goForward', () => {
       it('should navigate to next entry', async () => {
         addToHistory([], 'file1.js', null);
         addToHistory([], 'file2.js', null);
         await goBack();

         await goForward();

         expect(appState.historyIndex).toBe(1);
       });

       // Add 8 more tests
     });

     describe('pathToUrlParam', () => {
       it('should convert path to URL parameter', () => {
         const path = [{ name: 'src' }, { name: 'components' }];
         const result = pathToUrlParam(path, 'App.js');

         expect(result).toBe('src/components/App.js');
       });

       it('should handle empty path', () => {
         const result = pathToUrlParam([], 'test.js');
         expect(result).toBe('test.js');
       });

       // Add 6 more tests
     });

     describe('urlParamToPath', () => {
       it('should parse URL parameter to path', () => {
         const result = urlParamToPath('src/components/App.js');

         expect(result.path).toEqual([{ name: 'src' }, { name: 'components' }]);
         expect(result.filename).toBe('App.js');
       });

       it('should handle empty parameter', () => {
         const result = urlParamToPath('');
         expect(result.path).toEqual([]);
         expect(result.filename).toBeNull();
       });

       // Add 6 more tests
     });

     describe('updateNavigationButtons', () => {
       it('should disable back button when at start', () => {
         // Test button state updates
       });

       // Add 9 more tests
     });

     describe('handlePopState', () => {
       it('should restore state from browser history', async () => {
         // Test popstate handling
       });

       // Add 9 more tests
     });
   });
   ```

   **Tests:** 60 total (50 unit + 10 integration)

3. Create integration test `tests/navigation/history-integration.test.js`:

   ```javascript
   describe('History Integration', () => {
     it('should maintain history across file navigation', async () => {
       // Test complete navigation workflow
     });

     // Add 9 more tests
   });
   ```

   **Tests:** 10 integration tests

4. Update app.js:

   ```javascript
   import {
     addToHistory,
     goBack,
     goForward,
     goFolderUp,
     updateNavigationButtons,
     handlePopState
   } from './src/navigation/history-manager.js';

   // Remove lines 176-179, 589-843, 2654-2683, 2849-2880
   ```

5. Run tests

**Expected Coverage:** 98%

***

### 3A.3 Extract `src/ui/breadcrumb.js`

**Source Lines:** 409-531, 565-588
**Purpose:** Breadcrumb rendering with DOM diffing and path navigation

**Implementation Steps:**

1. Create `src/ui/breadcrumb.js`:

   ```javascript
   import { appState } from '../state/app-state.js';
   import { addToHistory } from '../navigation/history-manager.js';

   let lastRenderedPath = null;
   let lastRenderedFilename = null;

   /**
    * Update breadcrumb with DOM diffing
    */
   export function updateBreadcrumb() {
     const breadcrumb = document.getElementById('breadcrumb');
     if (!breadcrumb) return;

     // Check if update needed
     const pathChanged = !pathsEqual(lastRenderedPath, appState.currentPath);
     const filenameChanged = lastRenderedFilename !== appState.currentFilename;

     if (!pathChanged && !filenameChanged) return;

     // Clear and rebuild (optimized with diffing)
     const items = breadcrumb.children;
     const targetLength = appState.currentPath.length + (appState.currentFilename ? 1 : 0);

     // Remove excess items
     while (items.length > targetLength) {
       breadcrumb.removeChild(breadcrumb.lastChild);
     }

     // Update/create path segments
     appState.currentPath.forEach((segment, index) => {
       if (items[index]) {
         updateBreadcrumbItem(items[index], segment.name, index, false);
       } else {
         breadcrumb.appendChild(createBreadcrumbItem(segment.name, index, false));
       }
     });

     // Update/create filename
     if (appState.currentFilename) {
       const fileIndex = appState.currentPath.length;
       if (items[fileIndex]) {
         updateBreadcrumbItem(items[fileIndex], appState.currentFilename, null, true);
       } else {
         breadcrumb.appendChild(createBreadcrumbItem(appState.currentFilename, null, true));
       }
     }

     lastRenderedPath = [...appState.currentPath];
     lastRenderedFilename = appState.currentFilename;
   }

   /**
    * Create breadcrumb item element
    */
   function createBreadcrumbItem(name, pathIndex, isFile) {
     const item = document.createElement('span');
     item.className = isFile ? 'breadcrumb-file' : 'breadcrumb-folder';
     item.textContent = name;

     if (!isFile) {
       item.style.cursor = 'pointer';
       item.addEventListener('click', () => navigateToPathIndex(pathIndex));
     }

     return item;
   }

   /**
    * Update existing breadcrumb item
    */
   function updateBreadcrumbItem(element, name, pathIndex, isFile) {
     if (element.textContent !== name) {
       element.textContent = name;
     }
   }

   /**
    * Navigate to path at index
    * @param {number} index - Path index to navigate to
    */
   export async function navigateToPathIndex(index) {
     if (index < 0 || index >= appState.currentPath.length) return;

     // Save current state to history
     const editorState = appState.editorManager?.getState();
     addToHistory(appState.currentPath, appState.currentFilename, editorState);

     // Navigate to path
     appState.currentPath = appState.currentPath.slice(0, index + 1);
     appState.currentFileHandle = null;
     appState.currentFilename = '';

     // Update UI
     updateBreadcrumb();
   }

   /**
    * Check if two paths are equal
    */
   function pathsEqual(path1, path2) {
     if (!path1 || !path2) return false;
     if (path1.length !== path2.length) return false;
     return path1.every((seg, i) => seg.name === path2[i].name);
   }

   /**
    * Clear breadcrumb cache (for testing)
    */
   export function clearBreadcrumbCache() {
     lastRenderedPath = null;
     lastRenderedFilename = null;
   }
   ```

2. Create `tests/ui/breadcrumb.test.js`:

   ```javascript
   import { describe, it, expect, beforeEach, vi } from 'vitest';
   import {
     updateBreadcrumb,
     navigateToPathIndex,
     clearBreadcrumbCache
   } from '../../src/ui/breadcrumb.js';
   import { appState } from '../../src/state/app-state.js';

   describe('Breadcrumb', () => {
     let breadcrumbElement;

     beforeEach(() => {
       // Setup DOM
       breadcrumbElement = document.createElement('div');
       breadcrumbElement.id = 'breadcrumb';
       document.body.appendChild(breadcrumbElement);

       // Reset state
       appState.currentPath = [];
       appState.currentFilename = '';
       clearBreadcrumbCache();
     });

     afterEach(() => {
       document.body.removeChild(breadcrumbElement);
     });

     describe('updateBreadcrumb', () => {
       it('should render empty breadcrumb for root', () => {
         updateBreadcrumb();

         expect(breadcrumbElement.children.length).toBe(0);
       });

       it('should render path segments', () => {
         appState.currentPath = [{ name: 'src' }, { name: 'components' }];

         updateBreadcrumb();

         expect(breadcrumbElement.children.length).toBe(2);
         expect(breadcrumbElement.children[0].textContent).toBe('src');
         expect(breadcrumbElement.children[1].textContent).toBe('components');
       });

       it('should render filename', () => {
         appState.currentPath = [{ name: 'src' }];
         appState.currentFilename = 'App.js';

         updateBreadcrumb();

         expect(breadcrumbElement.children.length).toBe(2);
         expect(breadcrumbElement.children[1].textContent).toBe('App.js');
       });

       it('should use DOM diffing to avoid re-rendering unchanged items', () => {
         appState.currentPath = [{ name: 'src' }];
         updateBreadcrumb();

         const firstItem = breadcrumbElement.children[0];

         appState.currentFilename = 'test.js';
         updateBreadcrumb();

         // First item should be the same element
         expect(breadcrumbElement.children[0]).toBe(firstItem);
       });

       it('should remove excess items when path shortens', () => {
         appState.currentPath = [{ name: 'src' }, { name: 'components' }];
         updateBreadcrumb();

         appState.currentPath = [{ name: 'src' }];
         updateBreadcrumb();

         expect(breadcrumbElement.children.length).toBe(1);
       });

       it('should not update if path and filename unchanged', () => {
         appState.currentPath = [{ name: 'src' }];
         updateBreadcrumb();

         const spy = vi.spyOn(breadcrumbElement, 'removeChild');
         updateBreadcrumb();

         expect(spy).not.toHaveBeenCalled();
       });

       // Add 14 more tests
     });

     describe('navigateToPathIndex', () => {
       it('should navigate to clicked path segment', async () => {
         appState.currentPath = [{ name: 'src' }, { name: 'components' }];

         await navigateToPathIndex(0);

         expect(appState.currentPath).toEqual([{ name: 'src' }]);
       });

       it('should clear current file when navigating', async () => {
         appState.currentPath = [{ name: 'src' }];
         appState.currentFilename = 'test.js';

         await navigateToPathIndex(0);

         expect(appState.currentFilename).toBe('');
       });

       // Add 8 more tests
     });
   });
   ```

   **Tests:** 20 total

3. Update app.js:

   ```javascript
   import { updateBreadcrumb, navigateToPathIndex } from './src/ui/breadcrumb.js';

   // Remove lines 409-531, 565-588
   ```

4. Run tests

**Expected Coverage:** 98%

***

### 3A.4 Extract `src/ui/file-picker.js` (COMBINED MODULE)

**Source Lines:** 1025-1251, 1991-2007, 2008-2630
**Purpose:** Directory browser, file picker sidebar, autocomplete search, and file creation

**NOTE:** This is a large combined module that includes:
- Directory file listing (`showFilePicker`)
- Drag-to-resize sidebar
- Autocomplete/quick-create search (`showFilenameInput`)
- Dropdown search results with keyboard navigation
- File creation with subdirectory support

**Implementation Steps:**

1. Create `src/ui/file-picker.js`:

   ```javascript
   import { appState } from '../state/app-state.js';
   import { FileSystemAdapter, openFileByPath } from '../fs/filesystem-adapter.js';
   import { fuzzyMatch, recursiveSearchFiles, calculateRelevance } from '../search/fuzzy-search.js';
   import { addToHistory, updateNavigationButtons } from '../navigation/history-manager.js';
   import { updateBreadcrumb } from './breadcrumb.js';

   let isFilePickerOpen = false;
   let currentSearchController = null;

   /**
    * Show file picker with current directory contents
    */
   export async function showFilePicker() {
     const filePicker = document.getElementById('file-picker');
     if (!filePicker) return;

     filePicker.classList.add('active');
     isFilePickerOpen = true;

     const fileList = document.getElementById('file-list');
     fileList.innerHTML = '<div class="loading">Loading files...</div>';

     try {
       const entries = [];
       for await (const entry of appState.currentDirHandle.values()) {
         entries.push(entry);
       }

       // Sort: directories first, then alphabetically
       entries.sort((a, b) => {
         if (a.kind !== b.kind) {
           return a.kind === 'directory' ? -1 : 1;
         }
         return a.name.localeCompare(b.name);
       });

       fileList.innerHTML = '';

       for (const entry of entries) {
         if (entry.name.startsWith('.')) continue;

         const item = createFileListItem(entry);
         fileList.appendChild(item);
       }
     } catch (error) {
       console.error('Error loading files:', error);
       fileList.innerHTML = '<div class="error">Error loading files</div>';
     }
   }

   /**
    * Hide file picker
    */
   export function hideFilePicker() {
     const filePicker = document.getElementById('file-picker');
     if (!filePicker) return;

     filePicker.classList.remove('active');
     isFilePickerOpen = false;
   }

   /**
    * Initialize drag-to-resize functionality
    */
   export function initFilePickerResize() {
     const filePicker = document.getElementById('file-picker');
     const resizer = document.getElementById('file-picker-resizer');

     if (!filePicker || !resizer) return;

     let isResizing = false;
     let startX = 0;
     let startWidth = 0;

     resizer.addEventListener('mousedown', (e) => {
       isResizing = true;
       startX = e.clientX;
       startWidth = filePicker.offsetWidth;
       document.body.style.cursor = 'ew-resize';
       e.preventDefault();
     });

     document.addEventListener('mousemove', (e) => {
       if (!isResizing) return;

       const width = startWidth + (e.clientX - startX);
       const minWidth = 200;
       const maxWidth = window.innerWidth * 0.5;

       if (width >= minWidth && width <= maxWidth) {
         filePicker.style.width = `${width}px`;
       }
     });

     document.addEventListener('mouseup', () => {
       if (isResizing) {
         isResizing = false;
         document.body.style.cursor = '';
       }
     });
   }

   /**
    * Show filename input with autocomplete
    * @param {string} initialValue - Initial input value
    */
   export async function showFilenameInput(initialValue = '') {
     const container = document.createElement('div');
     container.id = 'filename-input-container';
     container.className = 'modal-overlay';

     const input = document.createElement('input');
     input.type = 'text';
     input.id = 'filename-input';
     input.placeholder = 'Enter filename or search...';
     input.value = initialValue;

     const dropdown = document.createElement('div');
     dropdown.id = 'filename-dropdown';
     dropdown.className = 'autocomplete-dropdown';

     container.appendChild(input);
     container.appendChild(dropdown);
     document.body.appendChild(container);

     input.focus();

     let selectedIndex = -1;
     let searchResults = [];

     // Search and populate dropdown
     async function updateDropdown() {
       const query = input.value.trim();

       if (!query) {
         dropdown.innerHTML = '';
         dropdown.classList.remove('active');
         return;
       }

       // Cancel previous search
       if (currentSearchController) {
         currentSearchController.abort();
       }

       currentSearchController = new AbortController();

       // Collect search results
       searchResults = [];
       for await (const result of recursiveSearchFiles(
         appState.currentDirHandle,
         query,
         currentSearchController.signal
       )) {
         searchResults.push(result);
       }

       // Sort by relevance
       searchResults.sort((a, b) => b.relevance - a.relevance);

       // Limit to top 50
       searchResults = searchResults.slice(0, 50);

       // Render dropdown
       dropdown.innerHTML = '';
       selectedIndex = -1;

       if (searchResults.length === 0) {
         const emptyItem = document.createElement('div');
         emptyItem.className = 'dropdown-item empty';
         emptyItem.textContent = `Create new file: ${query}`;
         dropdown.appendChild(emptyItem);
       } else {
         searchResults.forEach((result, index) => {
           const item = createDropdownItem(result, index);
           dropdown.appendChild(item);
         });
       }

       dropdown.classList.add('active');
     }

     // Event listeners
     input.addEventListener('input', updateDropdown);

     input.addEventListener('keydown', async (e) => {
       if (e.key === 'ArrowDown') {
         e.preventDefault();
         selectedIndex = Math.min(selectedIndex + 1, searchResults.length - 1);
         updateSelectedItem();
       } else if (e.key === 'ArrowUp') {
         e.preventDefault();
         selectedIndex = Math.max(selectedIndex - 1, -1);
         updateSelectedItem();
       } else if (e.key === 'Enter') {
         e.preventDefault();
         if (selectedIndex >= 0 && searchResults[selectedIndex]) {
           await openSearchResult(searchResults[selectedIndex]);
         } else {
           await createOrOpenFile(input.value.trim());
         }
         closeFilenameInput();
       } else if (e.key === 'Escape') {
         e.preventDefault();
         closeFilenameInput();
       }
     });

     input.addEventListener('blur', () => {
       setTimeout(() => closeFilenameInput(), 200);
     });

     function updateSelectedItem() {
       const items = dropdown.querySelectorAll('.dropdown-item');
       items.forEach((item, index) => {
         item.classList.toggle('selected', index === selectedIndex);
       });
     }

     // Initial update
     if (initialValue) {
       updateDropdown();
     }
   }

   /**
    * Create dropdown item for search result
    */
   function createDropdownItem(result, index) {
     const item = document.createElement('div');
     item.className = 'dropdown-item';
     item.dataset.index = index;

     const icon = document.createElement('span');
     icon.className = 'material-symbols-outlined';
     icon.textContent = getFileIcon(result.name);

     const name = document.createElement('span');
     name.className = 'file-name';
     name.textContent = result.name;

     const path = document.createElement('span');
     path.className = 'file-path';
     path.textContent = result.path || '(root)';

     item.appendChild(icon);
     item.appendChild(name);
     item.appendChild(path);

     item.addEventListener('click', async () => {
       await openSearchResult(result);
       closeFilenameInput();
     });

     return item;
   }

   /**
    * Open file from search result
    */
   async function openSearchResult(result) {
     try {
       const pathParts = result.path ? result.path.split('/') : [];
       const path = pathParts.map(name => ({ name }));

       const { fileHandle, content } = await openFileByPath(path, result.name);

       appState.currentPath = path;
       appState.currentFilename = result.name;
       appState.currentFileHandle = fileHandle;

       // Reinitialize editor with content
       await initEditor(content);

       updateBreadcrumb();
       updateNavigationButtons();
       addToHistory(path, result.name, null);
     } catch (error) {
       console.error('Error opening file:', error);
     }
   }

   /**
    * Create or open file by path
    * @param {string} filepath - File path (can include subdirectories)
    */
   export async function createOrOpenFile(filepath) {
     if (!filepath) return;

     try {
       const parts = filepath.split('/').filter(p => p.trim());
       const filename = parts.pop();
       const subdirs = parts;

       // Navigate through/create subdirectories
       let currentHandle = appState.currentDirHandle;
       const pathArray = [];

       for (const dir of subdirs) {
         currentHandle = await currentHandle.getDirectoryHandle(dir, { create: true });
         pathArray.push({ name: dir });
       }

       // Create or open file
       const fileHandle = await currentHandle.getFileHandle(filename, { create: true });

       // Check if new file (empty)
       const file = await fileHandle.getFile();
       const content = await file.text();

       appState.currentPath = pathArray;
       appState.currentFilename = filename;
       appState.currentFileHandle = fileHandle;

       // Initialize editor
       await initEditor(content || '');

       updateBreadcrumb();
       updateNavigationButtons();
       addToHistory(pathArray, filename, null);
     } catch (error) {
       console.error('Error creating/opening file:', error);
     }
   }

   /**
    * Close filename input
    */
   function closeFilenameInput() {
     const container = document.getElementById('filename-input-container');
     if (container) {
       container.remove();
     }

     if (currentSearchController) {
       currentSearchController.abort();
       currentSearchController = null;
     }
   }

   /**
    * Quick file create - shows filename input
    * @param {string} initialChar - Initial character typed
    */
   export function quickFileCreate(initialChar = '') {
     showFilenameInput(initialChar);
   }

   /**
    * New file button handler
    */
   export function newFile() {
     showFilenameInput();
   }

   /**
    * Create file list item
    */
   function createFileListItem(entry) {
     const item = document.createElement('div');
     item.className = 'file-list-item';

     const icon = document.createElement('span');
     icon.className = 'material-symbols-outlined';
     icon.textContent = entry.kind === 'directory' ? 'folder' : getFileIcon(entry.name);

     const name = document.createElement('span');
     name.textContent = entry.name;

     item.appendChild(icon);
     item.appendChild(name);

     item.addEventListener('click', async () => {
       if (entry.kind === 'directory') {
         // Navigate to directory
         appState.currentPath.push({ name: entry.name });
         updateBreadcrumb();
         await showFilePicker();
       } else {
         // Open file
         await openFileFromPicker(entry);
       }
     });

     return item;
   }

   /**
    * Get file icon based on extension
    */
   function getFileIcon(filename) {
     const ext = filename.split('.').pop().toLowerCase();

     const iconMap = {
       js: 'javascript',
       jsx: 'javascript',
       ts: 'code',
       tsx: 'code',
       py: 'code',
       java: 'code',
       cpp: 'code',
       c: 'code',
       go: 'code',
       rs: 'code',
       php: 'code',
       rb: 'code',
       html: 'html',
       css: 'css',
       json: 'data_object',
       md: 'description',
       txt: 'description',
       pdf: 'picture_as_pdf',
       png: 'image',
       jpg: 'image',
       jpeg: 'image',
       gif: 'image',
       svg: 'image',
       mp4: 'movie',
       mp3: 'music_note',
       zip: 'folder_zip',
       default: 'draft'
     };

     return iconMap[ext] || iconMap.default;
   }

   /**
    * Open file from picker
    */
   async function openFileFromPicker(fileHandle) {
     try {
       const file = await fileHandle.getFile();
       const content = await file.text();

       appState.currentFileHandle = fileHandle;
       appState.currentFilename = fileHandle.name;

       await initEditor(content);

       updateBreadcrumb();
       updateNavigationButtons();
       addToHistory(appState.currentPath, fileHandle.name, null);

       hideFilePicker();
     } catch (error) {
       console.error('Error opening file:', error);
     }
   }

   /**
    * Check if file picker is open
    */
   export function isPickerOpen() {
     return isFilePickerOpen;
   }
   ```

2. Create `tests/ui/file-picker.test.js`:

   ```javascript
   import { describe, it, expect, beforeEach, vi } from 'vitest';
   import {
     showFilePicker,
     hideFilePicker,
     initFilePickerResize,
     showFilenameInput,
     createOrOpenFile,
     quickFileCreate,
     newFile,
     isPickerOpen
   } from '../../src/ui/file-picker.js';
   import { appState } from '../../src/state/app-state.js';
   import { createMockDirectoryHandle } from '../mocks/filesystem.js';

   describe('File Picker', () => {
     beforeEach(() => {
       // Setup DOM
       document.body.innerHTML = `
         <div id="file-picker">
           <div id="file-list"></div>
           <div id="file-picker-resizer"></div>
         </div>
       `;

       appState.currentDirHandle = createMockDirectoryHandle('root', []);
     });

     describe('showFilePicker', () => {
       it('should show file picker', async () => {
         await showFilePicker();

         const picker = document.getElementById('file-picker');
         expect(picker.classList.contains('active')).toBe(true);
       });

       it('should load and display files', async () => {
         appState.currentDirHandle = createMockDirectoryHandle('root', [
           { kind: 'file', name: 'test.js' },
           { kind: 'directory', name: 'src' }
         ]);

         await showFilePicker();

         const fileList = document.getElementById('file-list');
         expect(fileList.children.length).toBe(2);
       });

       it('should sort directories before files', async () => {
         appState.currentDirHandle = createMockDirectoryHandle('root', [
           { kind: 'file', name: 'app.js' },
           { kind: 'directory', name: 'src' },
           { kind: 'file', name: 'index.js' }
         ]);

         await showFilePicker();

         const fileList = document.getElementById('file-list');
         expect(fileList.children[0].textContent).toContain('src');
       });

       it('should skip hidden files', async () => {
         appState.currentDirHandle = createMockDirectoryHandle('root', [
           { kind: 'file', name: '.git' },
           { kind: 'file', name: 'app.js' }
         ]);

         await showFilePicker();

         const fileList = document.getElementById('file-list');
         expect(fileList.children.length).toBe(1);
       });

       // Add 16 more tests
     });

     describe('hideFilePicker', () => {
       it('should hide file picker', () => {
         hideFilePicker();

         const picker = document.getElementById('file-picker');
         expect(picker.classList.contains('active')).toBe(false);
       });

       // Add 4 more tests
     });

     describe('initFilePickerResize', () => {
       it('should enable drag-to-resize', () => {
         initFilePickerResize();

         const resizer = document.getElementById('file-picker-resizer');
         expect(resizer).toBeDefined();
       });

       // Add 9 more tests for resize functionality
     });

     describe('showFilenameInput', () => {
       it('should show input modal', async () => {
         showFilenameInput();

         const container = document.getElementById('filename-input-container');
         expect(container).toBeDefined();
       });

       it('should populate with initial value', async () => {
         showFilenameInput('test');

         const input = document.getElementById('filename-input');
         expect(input.value).toBe('test');
       });

       // Add 13 more tests
     });

     describe('createOrOpenFile', () => {
       it('should create new file', async () => {
         await createOrOpenFile('newfile.js');

         expect(appState.currentFilename).toBe('newfile.js');
       });

       it('should create subdirectories if needed', async () => {
         await createOrOpenFile('src/components/App.js');

         expect(appState.currentPath).toHaveLength(2);
         expect(appState.currentFilename).toBe('App.js');
       });

       // Add 8 more tests
     });
   });
   ```

   **Tests:** 45 total

3. Create `tests/e2e/file-picker-workflow.spec.js`:

   ```javascript
   import { test, expect } from '@playwright/test';

   test.describe('File Picker Workflow', () => {
     test('should open file picker and select file', async ({ page }) => {
       // E2E test for file picker
     });

     test('should search and create new file', async ({ page }) => {
       // E2E test for autocomplete
     });

     test('should resize file picker', async ({ page }) => {
       // E2E test for drag-to-resize
     });

     test('should navigate directories', async ({ page }) => {
       // E2E test for directory navigation
     });

     test('should handle keyboard navigation in dropdown', async ({ page }) => {
       // E2E test for arrow keys
     });

     // Add 3 more E2E tests
   });
   ```

   **Tests:** 8 E2E tests

4. Update app.js:

   ```javascript
   import {
     showFilePicker,
     hideFilePicker,
     initFilePickerResize,
     showFilenameInput,
     createOrOpenFile,
     quickFileCreate,
     newFile
   } from './src/ui/file-picker.js';

   // Remove lines 1025-1251, 1991-2007, 2008-2630
   ```

5. Run tests:

   ```bash
   npm test -- --run
   npm run test:coverage
   npm run test:e2e
   ```

**Expected Coverage:** 95%

***

## Phase 3A Verification Checklist

Before moving to Phase 3B, verify:

* [ ] All 4 modules created with JSDoc comments
* [ ] 150 new tests written (25+60+20+45)
* [ ] 8 new E2E tests
* [ ] Existing 548 tests still pass
* [ ] Total test count: 698 tests
* [ ] Coverage ≥95% for new modules
* [ ] app.js reduced by ~1,100 lines
* [ ] Application runs normally (`npm run dev`)
* [ ] No console errors
* [ ] Manual smoke test:
  * [ ] Open folder
  * [ ] Browse files in picker
  * [ ] Search for files (autocomplete)
  * [ ] Create new file with subdirectories
  * [ ] Navigate with breadcrumbs
  * [ ] Use browser back/forward buttons
  * [ ] Resize file picker sidebar
* [ ] Performance test: Search completes in <500ms for 1000+ files
* [ ] Git commit: "refactor: extract navigation & file management layer (Phase 3A)"

**Estimated Lines Removed from app.js:** ~1,100
**app.js Size After Phase 3A:** ~940 lines

***

# PHASE 3B: UI Systems & Application Shell

**Focus:** Application-wide UI systems, manager coordination, and final orchestration layer
**Risk Level:** MEDIUM - System-wide features
**Lines Extracted:** ~940 lines
**Test Growth:** 650 → 750+ tests
**Estimated Time:** 8-10 hours

## Modules to Extract

### 3B.1 Extract `src/ui/keyboard-manager.js`

**Source Lines:** 2883-2973
**Purpose:** Global keyboard event handlers and shortcut system

**Implementation Steps:**

1. Create `src/ui/keyboard-manager.js`:

   ```javascript
   import { appState } from '../state/app-state.js';
   import { quickFileCreate } from './file-picker.js';

   const shortcuts = new Map();

   /**
    * Initialize keyboard manager
    */
   export function initKeyboardManager() {
     setupGlobalKeyHandlers();
   }

   /**
    * Register keyboard shortcut
    * @param {string} key - Key combination
    * @param {Function} handler - Handler function
    */
   export function registerShortcut(key, handler) {
     shortcuts.set(key.toLowerCase(), handler);
   }

   /**
    * Unregister keyboard shortcut
    * @param {string} key - Key combination
    */
   export function unregisterShortcut(key) {
     shortcuts.delete(key.toLowerCase());
   }

   /**
    * Setup global keyboard event handlers
    */
   function setupGlobalKeyHandlers() {
     // Quick file creation (alphanumeric keys)
     document.addEventListener('keydown', (e) => {
       // Ignore if typing in input
       if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
         return;
       }

       // Ignore if editor has focus
       if (appState.editorView || appState.editorManager) {
         return;
       }

       // Alphanumeric keys trigger quick file creation
       if (/^[a-z0-9]$/i.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
         e.preventDefault();
         quickFileCreate(e.key);
       }
     });

     // Enter key - focus editor
     document.addEventListener('keydown', (e) => {
       if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey) {
         // Ignore if already in input
         if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
           return;
         }

         e.preventDefault();
         focusEditor();
       }
     });

     // Escape key - blur editor and show search
     document.addEventListener('keydown', (e) => {
       if (e.key === 'Escape') {
         if (appState.editorView || appState.editorManager) {
           e.preventDefault();
           blurEditor();
           quickFileCreate();
         }
       }
     });
   }

   /**
    * Focus the editor
    */
   function focusEditor() {
     if (appState.editorView) {
       appState.editorView.focus();
     } else if (appState.editorManager) {
       appState.editorManager.focus();
     }
   }

   /**
    * Blur the editor
    */
   function blurEditor() {
     if (appState.editorView) {
       appState.editorView.contentDOM.blur();
     } else if (appState.editorManager) {
       appState.editorManager.blur();
     }
   }

   /**
    * Handle custom shortcut
    * @param {KeyboardEvent} event - Keyboard event
    */
   export function handleShortcut(event) {
     const key = [
       event.ctrlKey && 'Ctrl',
       event.metaKey && 'Meta',
       event.altKey && 'Alt',
       event.shiftKey && 'Shift',
       event.key
     ].filter(Boolean).join('+').toLowerCase();

     const handler = shortcuts.get(key);
     if (handler) {
       event.preventDefault();
       handler(event);
       return true;
     }

     return false;
   }
   ```

2. Create `tests/ui/keyboard-manager.test.js`:

   ```javascript
   import { describe, it, expect, beforeEach, vi } from 'vitest';
   import {
     initKeyboardManager,
     registerShortcut,
     unregisterShortcut,
     handleShortcut
   } from '../../src/ui/keyboard-manager.js';

   describe('Keyboard Manager', () => {
     beforeEach(() => {
       // Clear shortcuts
       document.body.innerHTML = '';
     });

     describe('registerShortcut', () => {
       it('should register keyboard shortcut', () => {
         const handler = vi.fn();
         registerShortcut('Ctrl+S', handler);

         const event = new KeyboardEvent('keydown', {
           key: 's',
           ctrlKey: true
         });

         handleShortcut(event);
         expect(handler).toHaveBeenCalled();
       });

       // Add 9 more tests
     });

     describe('initKeyboardManager', () => {
       it('should setup global keyboard handlers', () => {
         initKeyboardManager();

         // Test that handlers are registered
       });

       // Add 4 more tests
     });
   });
   ```

   **Tests:** 15 total

3. Update app.js:

   ```javascript
   import { initKeyboardManager } from './src/ui/keyboard-manager.js';

   // Remove lines 2883-2973
   ```

4. Run tests

**Expected Coverage:** 95%

***

### 3B.2 Extract `src/ui/modal-manager.js`

**Source Lines:** 1449-1503, 3014-3073
**Purpose:** Generic modal utilities and dialog management

**Implementation Steps:**

1. Create `src/ui/modal-manager.js`:

   ```javascript
   import { FileSystemAdapter } from '../fs/filesystem-adapter.js';
   import { appState } from '../state/app-state.js';

   /**
    * Show generic modal
    * @param {Object} options - Modal options
    */
   export function showModal(options) {
     const overlay = document.createElement('div');
     overlay.className = 'modal-overlay';
     overlay.id = options.id || 'generic-modal';

     const modal = document.createElement('div');
     modal.className = 'modal';

     const title = document.createElement('h2');
     title.textContent = options.title;

     const content = document.createElement('div');
     content.className = 'modal-content';
     content.innerHTML = options.content || '';

     const buttons = document.createElement('div');
     buttons.className = 'modal-buttons';

     options.buttons?.forEach(btn => {
       const button = document.createElement('button');
       button.textContent = btn.text;
       button.className = btn.primary ? 'primary' : '';
       button.addEventListener('click', () => {
         btn.onClick?.();
         hideModal(options.id);
       });
       buttons.appendChild(button);
     });

     modal.appendChild(title);
     modal.appendChild(content);
     modal.appendChild(buttons);
     overlay.appendChild(modal);
     document.body.appendChild(overlay);

     return overlay;
   }

   /**
    * Hide modal
    * @param {string} id - Modal ID
    */
   export function hideModal(id) {
     const modal = document.getElementById(id);
     if (modal) {
       modal.remove();
     }
   }

   /**
    * Show delete confirmation modal
    * @param {string} name - File/folder name
    * @param {Function} onConfirm - Confirmation callback
    */
   export function showDeleteConfirmation(name, onConfirm) {
     showModal({
       id: 'delete-confirmation',
       title: 'Confirm Delete',
       content: `Are you sure you want to delete "${name}"?`,
       buttons: [
         {
           text: 'Cancel',
           onClick: () => {}
         },
         {
           text: 'Delete',
           primary: true,
           onClick: onConfirm
         }
       ]
     });
   }

   /**
    * Show resume folder prompt
    */
   export function showResumePrompt() {
     showModal({
       id: 'resume-prompt',
       title: 'Resume Previous Folder?',
       content: 'Would you like to reopen your last folder?',
       buttons: [
         {
           text: 'Open New Folder',
           onClick: async () => {
             await FileSystemAdapter.pickDirectory();
           }
         },
         {
           text: 'Resume',
           primary: true,
           onClick: async () => {
             // Resume last folder
           }
         }
       ]
     });
   }

   /**
    * Show welcome prompt
    */
   export function showWelcomePrompt() {
     showModal({
       id: 'welcome-prompt',
       title: 'Welcome to HotNote',
       content: 'Get started by opening a folder.',
       buttons: [
         {
           text: 'Open Folder',
           primary: true,
           onClick: async () => {
             await FileSystemAdapter.pickDirectory();
           }
         }
       ]
     });
   }

   /**
    * Show error modal
    * @param {string} message - Error message
    */
   export function showError(message) {
     showModal({
       id: 'error-modal',
       title: 'Error',
       content: message,
       buttons: [
         {
           text: 'OK',
           primary: true,
           onClick: () => {}
         }
       ]
     });
   }
   ```

2. Create `tests/ui/modal-manager.test.js`:

   ```javascript
   import { describe, it, expect, beforeEach, vi } from 'vitest';
   import {
     showModal,
     hideModal,
     showDeleteConfirmation,
     showResumePrompt,
     showWelcomePrompt,
     showError
   } from '../../src/ui/modal-manager.js';

   describe('Modal Manager', () => {
     beforeEach(() => {
       document.body.innerHTML = '';
     });

     describe('showModal', () => {
       it('should show modal with title and content', () => {
         showModal({
           id: 'test-modal',
           title: 'Test',
           content: 'Test content',
           buttons: []
         });

         const modal = document.getElementById('test-modal');
         expect(modal).toBeDefined();
       });

       it('should render buttons', () => {
         const onClick = vi.fn();
         showModal({
           id: 'test-modal',
           title: 'Test',
           buttons: [
             { text: 'Button', onClick }
           ]
         });

         const button = document.querySelector('button');
         button.click();

         expect(onClick).toHaveBeenCalled();
       });

       // Add 13 more tests
     });

     describe('hideModal', () => {
       it('should hide modal', () => {
         showModal({ id: 'test-modal', title: 'Test', buttons: [] });
         hideModal('test-modal');

         const modal = document.getElementById('test-modal');
         expect(modal).toBeNull();
       });

       // Add 4 more tests
     });

     describe('showDeleteConfirmation', () => {
       it('should show delete confirmation', () => {
         showDeleteConfirmation('test.js', vi.fn());

         const modal = document.getElementById('delete-confirmation');
         expect(modal).toBeDefined();
       });

       // Add 4 more tests
     });
   });
   ```

   **Tests:** 25 total

3. Create `tests/e2e/modals.spec.js`:

   ```javascript
   import { test, expect } from '@playwright/test';

   test.describe('Modal Workflows', () => {
     test('should show and dismiss delete confirmation', async ({ page }) => {
       // E2E test
     });

     test('should show welcome prompt on first visit', async ({ page }) => {
       // E2E test
     });

     // Add 3 more tests
   });
   ```

   **Tests:** 5 E2E tests

4. Update app.js

5. Run tests

**Expected Coverage:** 98%

***

### 3B.3 Extract `src/ui/theme-manager.js`

**Source Lines:** 2631-2748, 2719-2730
**Purpose:** Dark/light mode toggle and system preference detection

**Implementation Steps:**

1. Create `src/ui/theme-manager.js`:

   ```javascript
   let isDarkMode = false;

   /**
    * Initialize theme manager
    */
   export function initThemeManager() {
     // Check localStorage
     const savedTheme = localStorage.getItem('theme');

     if (savedTheme) {
       isDarkMode = savedTheme === 'dark';
     } else {
       // Use system preference
       isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
     }

     applyTheme();
     setupSystemPreferenceListener();
   }

   /**
    * Toggle dark mode
    */
   export function toggleDarkMode() {
     isDarkMode = !isDarkMode;
     localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
     applyTheme();
   }

   /**
    * Apply current theme
    */
   function applyTheme() {
     if (isDarkMode) {
       document.documentElement.classList.add('dark');
     } else {
       document.documentElement.classList.remove('dark');
     }

     // Update editor theme if needed
     updateEditorTheme();
   }

   /**
    * Update editor theme (hot-swap)
    */
   function updateEditorTheme() {
     // Hot-swap editor theme without rebuilding
     if (window.appState?.editorView) {
       // CodeMirror theme update
     }
   }

   /**
    * Setup system preference change listener
    */
   function setupSystemPreferenceListener() {
     window.matchMedia('(prefers-color-scheme: dark)')
       .addEventListener('change', (e) => {
         // Only auto-switch if user hasn't manually set preference
         if (!localStorage.getItem('theme')) {
           isDarkMode = e.matches;
           applyTheme();
         }
       });
   }

   /**
    * Check if dark mode is enabled
    */
   export function isDark() {
     return isDarkMode;
   }
   ```

2. Create `tests/ui/theme-manager.test.js`:

   ```javascript
   import { describe, it, expect, beforeEach, vi } from 'vitest';
   import {
     initThemeManager,
     toggleDarkMode,
     isDark
   } from '../../src/ui/theme-manager.js';

   describe('Theme Manager', () => {
     beforeEach(() => {
       localStorage.clear();
       document.documentElement.classList.remove('dark');
     });

     describe('initThemeManager', () => {
       it('should initialize with system preference', () => {
         // Mock system preference
         Object.defineProperty(window, 'matchMedia', {
           value: vi.fn(() => ({
             matches: true,
             addEventListener: vi.fn()
           }))
         });

         initThemeManager();

         expect(isDark()).toBe(true);
       });

       it('should use saved preference over system', () => {
         localStorage.setItem('theme', 'light');

         initThemeManager();

         expect(isDark()).toBe(false);
       });

       // Add 11 more tests
     });

     describe('toggleDarkMode', () => {
       it('should toggle dark mode', () => {
         toggleDarkMode();

         expect(isDark()).toBe(true);
         expect(document.documentElement.classList.contains('dark')).toBe(true);
       });

       // Add 4 more tests
     });
   });
   ```

   **Tests:** 18 total

3. Update app.js

4. Run tests

**Expected Coverage:** 100%

***

### 3B.4 Extract `src/ui/version-manager.js`

**Source Lines:** 3074-3285
**Purpose:** Version checking and update banner management

**Implementation Steps:**

1. Create `src/ui/version-manager.js`:

   ```javascript
   const GITHUB_REPO = 'yourusername/hotnote';
   const CURRENT_VERSION = '1.14.0';

   /**
    * Check for new version
    */
   export async function checkForNewVersion() {
     try {
       const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
       const data = await response.json();

       const latestVersion = data.tag_name.replace('v', '');

       if (isNewerVersion(latestVersion, CURRENT_VERSION)) {
         return {
           hasUpdate: true,
           version: latestVersion,
           url: data.html_url
         };
       }

       return { hasUpdate: false };
     } catch (error) {
       console.error('Error checking version:', error);
       return { hasUpdate: false };
     }
   }

   /**
    * Show version banner
    * @param {Object} versionInfo - Version information
    */
   export function showVersionBanner(versionInfo) {
     const banner = createVersionBanner(versionInfo);
     document.body.appendChild(banner);

     setTimeout(() => {
       banner.classList.add('visible');
     }, 100);
   }

   /**
    * Hide version banner
    */
   export function hideVersionBanner() {
     const banner = document.getElementById('version-banner');
     if (banner) {
       banner.classList.remove('visible');
       setTimeout(() => banner.remove(), 300);
     }

     localStorage.setItem('version-banner-dismissed', CURRENT_VERSION);
   }

   /**
    * Create version banner element
    */
   function createVersionBanner(versionInfo) {
     const banner = document.createElement('div');
     banner.id = 'version-banner';
     banner.className = 'version-banner';

     const message = document.createElement('span');
     message.textContent = versionInfo.hasUpdate
       ? `Update available: v${versionInfo.version}`
       : 'Welcome to HotNote!';

     const reloadBtn = document.createElement('button');
     reloadBtn.textContent = versionInfo.hasUpdate ? 'Reload' : 'OK';
     reloadBtn.addEventListener('click', () => {
       if (versionInfo.hasUpdate) {
         window.location.reload();
       } else {
         hideVersionBanner();
       }
     });

     const dismissBtn = document.createElement('button');
     dismissBtn.textContent = '×';
     dismissBtn.className = 'dismiss-btn';
     dismissBtn.addEventListener('click', hideVersionBanner);

     banner.appendChild(message);
     banner.appendChild(reloadBtn);
     banner.appendChild(dismissBtn);

     return banner;
   }

   /**
    * Compare version strings
    */
   function isNewerVersion(latest, current) {
     const latestParts = latest.split('.').map(Number);
     const currentParts = current.split('.').map(Number);

     for (let i = 0; i < 3; i++) {
       if (latestParts[i] > currentParts[i]) return true;
       if (latestParts[i] < currentParts[i]) return false;
     }

     return false;
   }

   /**
    * Check if banner should be shown
    */
   export function shouldShowBanner() {
     const dismissed = localStorage.getItem('version-banner-dismissed');
     return dismissed !== CURRENT_VERSION;
   }

   /**
    * Show welcome banner for first-time users
    */
   export function showWelcomeBanner() {
     const isFirstVisit = !localStorage.getItem('has-visited');

     if (isFirstVisit) {
       localStorage.setItem('has-visited', 'true');
       showVersionBanner({ hasUpdate: false });
     }
   }

   /**
    * Perform version check and show banner if needed
    */
   export async function performVersionCheck() {
     if (!shouldShowBanner()) return;

     const versionInfo = await checkForNewVersion();

     if (versionInfo.hasUpdate) {
       showVersionBanner(versionInfo);
     }
   }
   ```

2. Create `tests/ui/version-manager.test.js`:

   ```javascript
   import { describe, it, expect, beforeEach, vi } from 'vitest';
   import {
     checkForNewVersion,
     showVersionBanner,
     hideVersionBanner,
     shouldShowBanner,
     showWelcomeBanner,
     performVersionCheck
   } from '../../src/ui/version-manager.js';

   describe('Version Manager', () => {
     beforeEach(() => {
       localStorage.clear();
       document.body.innerHTML = '';
       global.fetch = vi.fn();
     });

     describe('checkForNewVersion', () => {
       it('should detect new version available', async () => {
         global.fetch.mockResolvedValue({
           json: async () => ({
             tag_name: 'v1.15.0',
             html_url: 'https://github.com/user/repo/releases/latest'
           })
         });

         const result = await checkForNewVersion();

         expect(result.hasUpdate).toBe(true);
         expect(result.version).toBe('1.15.0');
       });

       it('should detect no update needed', async () => {
         global.fetch.mockResolvedValue({
           json: async () => ({
             tag_name: 'v1.14.0'
           })
         });

         const result = await checkForNewVersion();

         expect(result.hasUpdate).toBe(false);
       });

       // Add 13 more tests
     });

     describe('showVersionBanner', () => {
       it('should show version banner', () => {
         showVersionBanner({ hasUpdate: true, version: '1.15.0' });

         const banner = document.getElementById('version-banner');
         expect(banner).toBeDefined();
       });

       // Add 6 more tests
     });
   });
   ```

   **Tests:** 22 total

3. Update app.js

4. Run tests

**Expected Coverage:** 98%

***

### 3B.5 Extract `src/managers/manager-factory.js`

**Source Lines:** 1252-1448
**Purpose:** Manager instantiation and lifecycle coordination

**Implementation Steps:**

1. Create `src/managers/manager-factory.js`:

   ```javascript
   import { appState } from '../state/app-state.js';
   import { TrashManager } from '../fs/trash-manager.js';
   import { AutosaveManager } from '../editor/autosave.js';
   import { FileSyncManager } from '../fs/file-sync-manager.js';

   let managers = {
     trash: null,
     autosave: null,
     fileSync: null
   };

   /**
    * Initialize all managers
    */
   export function initManagers() {
     initTrashManager();
     initAutosaveManager();
     initFileSyncManager();
   }

   /**
    * Initialize trash manager
    */
   function initTrashManager() {
     managers.trash = new TrashManager(appState.currentDirHandle);
     appState.trashManager = managers.trash;
   }

   /**
    * Initialize autosave manager
    */
   function initAutosaveManager() {
     const autosaveEnabled = localStorage.getItem('autosave') === 'true';

     managers.autosave = new AutosaveManager({
       enabled: autosaveEnabled,
       interval: 2000,
       onSave: async () => {
         // Save file callback
       }
     });

     appState.autosaveManager = managers.autosave;
   }

   /**
    * Initialize file sync manager
    */
   function initFileSyncManager() {
     managers.fileSync = new FileSyncManager({
       checkInterval: 5000,
       onFileChanged: async () => {
         // File changed callback
       }
     });

     appState.fileSyncManager = managers.fileSync;
   }

   /**
    * Get manager by name
    * @param {string} name - Manager name
    */
   export function getManager(name) {
     return managers[name];
   }

   /**
    * Destroy all managers
    */
   export function destroyManagers() {
     Object.values(managers).forEach(manager => {
       if (manager?.destroy) {
         manager.destroy();
       }
     });

     managers = {
       trash: null,
       autosave: null,
       fileSync: null
     };
   }

   /**
    * Restart manager
    * @param {string} name - Manager name
    */
   export function restartManager(name) {
     const manager = managers[name];
     if (manager?.destroy) {
       manager.destroy();
     }

     switch (name) {
       case 'trash':
         initTrashManager();
         break;
       case 'autosave':
         initAutosaveManager();
         break;
       case 'fileSync':
         initFileSyncManager();
         break;
     }
   }
   ```

2. Create `tests/managers/manager-factory.test.js`:

   ```javascript
   import { describe, it, expect, beforeEach, vi } from 'vitest';
   import {
     initManagers,
     getManager,
     destroyManagers,
     restartManager
   } from '../../src/managers/manager-factory.js';

   describe('Manager Factory', () => {
     beforeEach(() => {
       destroyManagers();
     });

     describe('initManagers', () => {
       it('should initialize all managers', () => {
         initManagers();

         expect(getManager('trash')).toBeDefined();
         expect(getManager('autosave')).toBeDefined();
         expect(getManager('fileSync')).toBeDefined();
       });

       // Add 9 more tests
     });

     describe('getManager', () => {
       it('should return manager by name', () => {
         initManagers();

         const trash = getManager('trash');
         expect(trash).toBeDefined();
       });

       // Add 4 more tests
     });

     describe('destroyManagers', () => {
       it('should destroy all managers', () => {
         initManagers();
         destroyManagers();

         expect(getManager('trash')).toBeNull();
       });

       // Add 4 more tests
     });
   });
   ```

   **Tests:** 20 total

3. Update app.js

4. Run tests

**Expected Coverage:** 95%

***

### 3B.6 Final `app.js` Orchestration Layer

**Remaining Lines:** ~300-400
**Purpose:** Application initialization and event wiring

**Final app.js Structure:**

```javascript
// === IMPORTS ===
import { appState } from './src/state/app-state.js';
import { FileSystemAdapter } from './src/fs/filesystem-adapter.js';
import { updateBreadcrumb } from './src/ui/breadcrumb.js';
import { showFilePicker, initFilePickerResize, newFile } from './src/ui/file-picker.js';
import { goBack, goForward, goFolderUp, updateNavigationButtons } from './src/navigation/history-manager.js';
import { initKeyboardManager } from './src/ui/keyboard-manager.js';
import { initThemeManager, toggleDarkMode } from './src/ui/theme-manager.js';
import { performVersionCheck, showWelcomeBanner } from './src/ui/version-manager.js';
import { initManagers } from './src/managers/manager-factory.js';
import { showResumePrompt, showWelcomePrompt } from './src/ui/modal-manager.js';
import EditorManager from './src/editor/editor-manager.js';

// === SMALL UTILITIES (kept in app.js) ===

// Logo animation (300-408)
function updateLogoState() { /* ... */ }
function setupLogoHoverInteraction() { /* ... */ }

// Focus management (2976-2995)
function updateEditorBlurState() { /* ... */ }

// File icons (1872-1960)
function getFileIcon(filename) { /* ... */ }

// Path utilities (62-74, 651-685)
function getFilePathKey() { /* ... */ }
function getRelativeFilePath() { /* ... */ }

// === EVENT LISTENERS ===

function setupEventListeners() {
  // Navigation buttons
  document.getElementById('new-btn')?.addEventListener('click', newFile);
  document.getElementById('back-btn')?.addEventListener('click', goBack);
  document.getElementById('forward-btn')?.addEventListener('click', goForward);
  document.getElementById('folder-up-btn')?.addEventListener('click', goFolderUp);

  // Theme toggle
  document.getElementById('dark-mode-toggle')?.addEventListener('click', toggleDarkMode);

  // Header click
  document.getElementById('header')?.addEventListener('click', showFilePicker);

  // Focus management
  window.addEventListener('focus', () => updateEditorBlurState());
  window.addEventListener('blur', () => updateEditorBlurState());
}

// === INITIALIZATION ===

async function initApp() {
  // 1. Initialize UI systems
  initThemeManager();
  initKeyboardManager();
  initFilePickerResize();
  setupLogoHoverInteraction();

  // 2. Initialize managers
  initManagers();

  // 3. Setup event listeners
  setupEventListeners();

  // 4. Initialize editor
  await initEditor();

  // 5. Update UI
  updateBreadcrumb();
  updateNavigationButtons();

  // 6. Check for updates
  performVersionCheck();
  showWelcomeBanner();

  // 7. Show welcome/resume prompt if needed
  const hasLastFolder = localStorage.getItem('last-folder');
  if (hasLastFolder) {
    showResumePrompt();
  } else {
    showWelcomePrompt();
  }

  // 8. Setup cleanup
  window.addEventListener('beforeunload', cleanup);
}

function cleanup() {
  // Cleanup on window close
}

// === START APP ===
initApp();
```

**Tests:** Update integration tests

**Expected Coverage:** 90%

***

## Phase 3B Verification Checklist

* [ ] All 5 modules + refactored app.js completed
* [ ] 100 new tests written (15+25+18+22+20)
* [ ] 5 new E2E tests
* [ ] Existing 698 tests still pass
* [ ] Total test count: 798 tests
* [ ] Coverage ≥89% across all modules
* [ ] app.js reduced to ~300-400 lines
* [ ] Application runs normally
* [ ] No console errors
* [ ] Comprehensive manual testing:
  * [ ] Keyboard shortcuts work (quick file, enter, escape)
  * [ ] All modals work (delete, welcome, resume)
  * [ ] Theme toggle is instant
  * [ ] Version check works
  * [ ] All managers initialized correctly
  * [ ] Full workflow: open → edit → save → search → navigate
* [ ] Performance benchmarks:
  * [ ] Theme toggle <16ms
  * [ ] App initialization <1s
  * [ ] No memory leaks in 30-minute session
* [ ] Git commit: "refactor: extract UI systems & application shell (Phase 3B)"

**Final app.js Size:** ~300-400 lines (from 3,389 lines)
**Final Test Count:** 798+ tests (from 548 tests)
**Final Coverage:** ≥89% across 14+ modules

***

## Success Criteria (Both Phases Combined)

### Metrics
* ✅ app.js reduced from 3,389 → ~350 lines (90% reduction)
* ✅ 14+ modules extracted with clear separation of concerns
* ✅ Test coverage maintained at ≥89%
* ✅ Test suite grows from 548 → 798+ tests
* ✅ No breaking changes to user-facing functionality
* ✅ Performance maintained or improved

### Quality Gates
* ✅ All tests pass (`npm test -- --run`)
* ✅ Coverage thresholds met (`npm run test:coverage`)
* ✅ E2E tests pass (`npm run test:e2e`)
* ✅ No console errors in production build
* ✅ Bundle size within acceptable range
* ✅ No memory leaks detected

***

## Rollback Plan

Each phase is independently committable. If issues arise:

1. **Phase 3A issues:** `git revert` Phase 3A commit (Phases 1-2 remain)
2. **Phase 3B issues:** `git revert` Phase 3B commit (Phases 1-2-3A remain)
3. **Both phases:** `git revert` both commits (back to Phase 2)

All tests ensure each phase maintains full app functionality.

***

## Notes

* Each module includes JSDoc comments for documentation
* Tests are written with each extraction
* Existing tests are moved/enhanced, not rewritten
* Coverage thresholds enforced in CI
* Git commits are granular for easy review
* Manual testing checklist for each phase
* Both phases are production-ready and independently deployable
