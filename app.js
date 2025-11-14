import { EditorManager } from './src/editors/editor-manager.js';
import { FileSystemAdapter, openFileByPath } from './src/fs/filesystem-adapter.js';
import { createTrashManager } from './src/fs/trash-manager.js';
import { GitHubAdapter } from './src/fs/github-adapter.js';
import {
  brandHighlightStyle,
  brandHighlightStyleDark,
  getLanguageExtension,
  isMarkdownFile,
} from './src/editor/language-support.js';
import { createAutosaveManager, animateAutosaveLabel } from './src/editor/autosave.js';
import { createFileSyncManager } from './src/storage/file-sync.js';
import { appState } from './src/state/app-state.js';
import { debounce } from './src/utils/helpers.js';
import { updateBreadcrumb as updateBreadcrumbCore } from './src/ui/breadcrumb.js';
import {
  addToHistory,
  goBack,
  goForward,
  goFolderUp,
  updateNavigationButtons,
} from './src/navigation/history-manager.js';
import { URLParamManager } from './src/navigation/url-param-manager.js';
import {
  showFilePicker,
  hideFilePicker,
  initFilePickerResize,
  openFileFromPicker,
  newFile,
  setupFilePickerClickAway,
  quickFileCreate,
} from './src/ui/file-picker.js';
import { initKeyboardManager, updateEditorBlurState } from './src/ui/keyboard-manager.js';
import { initThemeManager, toggleTheme } from './src/ui/theme-manager.js';
import { initVersionManager, performVersionCheck } from './src/ui/version-manager.js';
import { showWelcomePrompt, showResumePrompt, showWorkdirPrompt } from './src/ui/prompt-manager.js';
import {
  getFilePathKey as getFilePathKeyCore,
  saveTempChanges as saveTempChangesCore,
  loadTempChanges as loadTempChangesCore,
  clearTempChanges as clearTempChangesCore,
  hasTempChanges as hasTempChangesCore,
} from './core.js';
import {
  loadSessionFile,
  saveSessionFile,
  createEmptySession,
  createDebouncedSaveEditorState,
  initSessionManager,
  addCommentToSession,
  updateCommentInSession,
  deleteCommentFromSession,
} from './src/storage/session-manager.js';
import { getUserId, getUserDisplayName } from './src/storage/user-manager.js';
import { createAnchor, findAnchorPosition } from './src/utils/text-anchor.js';
import { validateAllComments } from './src/utils/comment-validator.js';
import { CommentToolbar } from './src/ui/comment-toolbar.js';
import { CommentPanel } from './src/ui/comment-panel.js';
import {
  EditorView,
  keymap,
  lineNumbers,
  placeholder,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { syntaxHighlighting, bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';
import {
  defaultKeymap,
  history as codeMirrorHistory,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';

// Expose appState to window for testing purposes
window.appState = appState;

// Initialize session manager with FileSystemAdapter
initSessionManager(FileSystemAdapter);

// Temp storage wrappers using core.js functions
const getFilePathKey = () => {
  if (!appState.currentFileHandle) return null;
  return getFilePathKeyCore(appState.currentPath, appState.currentFilename);
};

// Get relative file path (excluding root folder name) for session storage
const getRelativeFilePath = () => {
  if (!appState.currentFileHandle) return null;
  // Skip the first element (root folder) since we're already inside it when loading
  const pathParts = appState.currentPath.slice(1).map((p) => p.name);
  pathParts.push(appState.currentFilename);
  return pathParts.join('/');
};

// Save temp changes wrapper
const saveTempChanges = () => {
  const key = getFilePathKey();
  if (!key || !appState.isDirty) return;

  const content = getEditorContent();
  saveTempChangesCore(key, content);
};

// Wrapper functions for core temp storage (used by modules)
const _loadTempChanges = (key) => {
  return loadTempChangesCore(key);
};

const loadTempChanges = (key) => {
  return loadTempChangesCore(key);
};

const clearTempChanges = (key) => {
  clearTempChangesCore(key);
};

const _hasTempChanges = (key) => {
  return hasTempChangesCore(key);
};

// Helper: Get current editor content
const getEditorContent = () => {
  if (appState.editorManager) {
    return appState.editorManager.getContent();
  } else if (appState.editorView) {
    return appState.editorView.state.doc.toString();
  }
  return '';
};

// Wrapper for updateBreadcrumb with required callbacks
const updateBreadcrumb = () => {
  updateBreadcrumbCore({
    openFolder,
    showFilePicker,
    saveFocusState: () => appState.focusManager.saveFocusState(),
    saveTempChanges,
  });
};
// Expose for file-picker module
window.updateBreadcrumb = updateBreadcrumb;

// Initialize editor (EditorManager for markdown, CodeMirror for other files)
const initEditor = async (initialContent = '', filename = 'untitled') => {
  // Store original content for undo detection
  appState.originalContent = initialContent;

  // Clear old editors
  if (appState.editorManager) {
    appState.editorManager.destroy();
    appState.editorManager = null;
  }
  if (appState.editorView) {
    appState.editorView.destroy();
    appState.editorView = null;
  }

  const editorContainer = document.getElementById('editor');
  editorContainer.innerHTML = ''; // Clear container

  // onChange callback for content changes
  const handleContentChange = (content) => {
    // Track user activity for file polling
    fileSyncManager.updateUserActivity();
    fileSyncManager.updateLastModifiedLocal(Date.now());

    if (content === appState.originalContent) {
      if (appState.isDirty) {
        appState.isDirty = false;
        const key = getFilePathKey();
        if (key) {
          clearTempChanges(key);
        }
        updateBreadcrumb();
      }
    } else {
      if (!appState.isDirty) {
        appState.isDirty = true;
        updateBreadcrumb();
      }
    }
    // Save session state on content change
    debouncedSaveEditorState();

    // Update TOC if in WYSIWYG mode for markdown files
    if (
      isMarkdownFile(appState.currentFilename) &&
      appState.editorManager?.getMode() === 'wysiwyg'
    ) {
      debouncedUpdateTOC();
    }

    // Validate comment positions after content changes
    debouncedValidateComments();
  };

  if (isMarkdownFile(filename)) {
    // Use EditorManager for markdown files
    // Mode will be determined by session restore or default to 'wysiwyg'
    const initialMode = appState.isRestoringSession
      ? localStorage.getItem(`mode_${filename}`) || 'wysiwyg'
      : 'wysiwyg';

    appState.editorManager = new EditorManager(
      editorContainer,
      initialMode,
      initialContent,
      handleContentChange,
      appState.isReadOnly
    );
    await appState.editorManager.ready();

    // Initialize TOC and suggested links for markdown files
    updateTOC();
    await updateSuggestedLinks();
  } else {
    // Use CodeMirror directly for non-markdown files
    await initCodeMirrorEditor(initialContent, filename, handleContentChange);
    updateTOC(); // Hide TOC for non-markdown files
  }

  appState.isDirty = false;
  updateRichToggleButton();

  // Register editors with focus manager
  appState.focusManager.setEditors(appState.editorManager, appState.editorView);

  // Restore cursor position and scroll if pending (from theme toggle)
  if (appState.pendingCursorRestore) {
    const { cursorPosition, scrollTop, scrollLeft } = appState.pendingCursorRestore;
    appState.pendingCursorRestore = null;

    // Use requestAnimationFrame + delay to ensure editor is fully rendered
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (appState.editorView) {
          // Restore scroll for CodeMirror
          if (appState.editorView.scrollDOM) {
            appState.editorView.scrollDOM.scrollTop = scrollTop;
            appState.editorView.scrollDOM.scrollLeft = scrollLeft;
          }

          // Restore cursor position for CodeMirror
          if (cursorPosition && appState.editorView.state) {
            try {
              const doc = appState.editorView.state.doc;
              const line = doc.line(cursorPosition.line + 1); // Convert back to 1-based
              const pos = line.from + Math.min(cursorPosition.column, line.length);
              appState.editorView.dispatch({
                selection: { anchor: pos, head: pos },
              });
              if (appState.editorView.focus) {
                appState.editorView.focus();
              }
            } catch (error) {
              console.warn('[initEditor] Failed to restore cursor position:', error);
            }
          }
        } else if (appState.editorManager) {
          // Restore scroll for EditorManager
          if (appState.editorManager.setScrollPosition) {
            appState.editorManager.setScrollPosition(scrollTop);
          }

          // Restore cursor position for EditorManager (needs extra delay)
          if (cursorPosition) {
            setTimeout(() => {
              try {
                if (appState.editorManager.setCursor) {
                  appState.editorManager.setCursor(cursorPosition.line, cursorPosition.column);
                }
                if (appState.editorManager.focus) {
                  appState.editorManager.focus();
                }
              } catch (error) {
                console.warn('[initEditor] Failed to restore cursor position:', error);
              }
            }, 100);
          }
        }
      }, 50);
    });
  }

  // Refresh comment decorations after editor is ready
  setTimeout(() => {
    refreshCommentDecorations();
  }, 150);
};

// Expose initEditor for file-picker module
window.initEditor = initEditor;
// Expose getEditorContent for theme-manager module
window.getEditorContent = getEditorContent;
// Expose file-picker functions for keyboard-manager and prompt-manager modules
window.showFilePicker = showFilePicker;
window.hideFilePicker = hideFilePicker;
window.quickFileCreate = quickFileCreate;

// Initialize CodeMirror editor
const initCodeMirrorEditor = async (
  initialContent = '',
  filename = 'untitled',
  onChange = null
) => {
  // Use appropriate highlight style based on current theme
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const highlightStyle = isDark ? brandHighlightStyleDark : brandHighlightStyle;

  // Check if we have a file open
  const hasFileOpen = appState.currentFileHandle !== null;

  const extensions = [
    lineNumbers(),
    EditorView.lineWrapping,
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    codeMirrorHistory(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    syntaxHighlighting(highlightStyle),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab,
      {
        key: 'Mod-s',
        run: () => {
          saveFile();
          return true;
        },
      },
      {
        key: 'Mod-Shift-o',
        run: () => {
          openFolder();
          return true;
        },
      },
      {
        key: 'Mod-n',
        run: () => {
          // Only allow new file if workspace is open
          if (appState.currentDirHandle) {
            newFile();
          }
          return true;
        },
      },
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const currentContent = update.state.doc.toString();

        // Call onChange callback if provided
        if (onChange) {
          onChange(currentContent);
        }
      }

      // Save editor state on selection change or scroll
      if (update.selectionSet || update.geometryChanged) {
        fileSyncManager.updateUserActivity(); // Track cursor/scroll activity
        debouncedSaveEditorState();
      }
    }),
  ];

  // If no file is open, make editor read-only and show placeholder
  if (!hasFileOpen) {
    extensions.push(EditorState.readOnly.of(true));
    extensions.push(
      placeholder('Open a workspace to browse, edit, and create files (Cmd/Ctrl+Shift+O)')
    );
    extensions.push(EditorView.editable.of(false));
  }

  const languageExtension = getLanguageExtension(filename);
  if (languageExtension) {
    extensions.push(languageExtension);
  }

  const startState = EditorState.create({
    doc: initialContent,
    extensions,
  });

  appState.editorView = new EditorView({
    state: startState,
    parent: document.getElementById('editor'),
  });

  // Add getSelection method to CodeMirror editor for comment system compatibility
  appState.editorView.getSelection = function () {
    if (!this.state) {
      return null;
    }

    const selection = this.state.selection.main;

    // If there's no selection (from === to), return null
    if (selection.from === selection.to) {
      return null;
    }

    const text = this.state.doc.sliceString(selection.from, selection.to);

    return {
      from: selection.from,
      to: selection.to,
      text: text,
    };
  };

  // Add getDocumentText method for comment system compatibility
  appState.editorView.getDocumentText = function () {
    if (!this.state) {
      return '';
    }
    return this.state.doc.toString();
  };

  // Add applyCommentDecorations method for comment system compatibility
  appState.editorView.applyCommentDecorations = function (
    comments,
    _activeCommentId,
    _onCommentClick
  ) {
    // This will be handled by the source-view decoration system
    // For now, we'll import and use the decoration effects from source-view
    // Note: This is a simplified version - for full functionality,
    // we might need to refactor the decoration system
    console.log('[CodeMirror] Apply comment decorations:', comments.length);
  };

  // Add scroll listener to save editor state
  if (appState.editorView && appState.editorView.scrollDOM) {
    appState.editorView.scrollDOM.addEventListener('scroll', debouncedSaveEditorState);
  }
};

// Track if initial collapse has been scheduled
let initialCollapseScheduled = false;

// Update logo state based on whether a folder or file is open
const updateLogoState = (immediate = false) => {
  const logo = document.querySelector('.app-logo');
  const hasWorkspace = appState.currentFileHandle || appState.currentDirHandle;

  // Update footer visibility based on workspace state or GitReader mode
  if (hasWorkspace || appState.isGitHubMode) {
    document.body.setAttribute('data-has-workspace', 'true');
  } else {
    document.body.removeAttribute('data-has-workspace');
  }

  if (logo && hasWorkspace) {
    // Check if this is the first time (initial load)
    const isFirstLoad = !logo.dataset.initialized;

    if (isFirstLoad && !initialCollapseScheduled) {
      // Mark that we've scheduled the initial collapse to prevent duplicates
      initialCollapseScheduled = true;
      logo.dataset.initialized = 'true';

      // Set initial expanded state immediately (without animation)
      logo.classList.add('expanded');

      // Delay before collapse animation (immediate = 0ms, normal = 2500ms)
      const delay = immediate ? 0 : 2500;
      setTimeout(() => {
        // Only animate if still in expanded state
        if (logo.classList.contains('expanded')) {
          // Switch from expanded to compact with animation
          logo.classList.remove('expanded');
          logo.classList.add('compact', 'animating');

          // Remove animating class after animation completes (1.2s total animation time)
          setTimeout(() => {
            logo.classList.remove('animating');
          }, 1200);
        }
      }, delay);
    } else if (!isFirstLoad) {
      // Already initialized, just ensure compact state without animation
      if (!logo.classList.contains('expanded')) {
        logo.classList.add('compact');
        logo.classList.remove('animating');
      }
    }
  }
};

// Expose updateLogoState for file-picker module
window.updateLogoState = updateLogoState;

// Update breadcrumb display
// Update rich toggle button visibility and state
const updateRichToggleButton = () => {
  const richToggleBtn = document.getElementById('rich-toggle-btn');

  if (isMarkdownFile(appState.currentFilename) && appState.editorManager) {
    richToggleBtn.classList.remove('hidden');
    const currentMode = appState.editorManager.getMode();
    const icon = richToggleBtn.querySelector('.material-symbols-outlined');
    icon.textContent = currentMode === 'wysiwyg' ? 'code' : 'wysiwyg';
    richToggleBtn.title =
      currentMode === 'wysiwyg' ? 'Switch to source mode' : 'Switch to rich mode';
  } else {
    richToggleBtn.classList.add('hidden');
  }
};

// Toggle between rich and source mode for markdown files
const toggleRichMode = async () => {
  if (!isMarkdownFile(appState.currentFilename) || !appState.editorManager) {
    return;
  }

  await appState.editorManager.toggleMode();

  // Save mode preference to localStorage
  const newMode = appState.editorManager.getMode();
  localStorage.setItem(`mode_${appState.currentFilename}`, newMode);

  updateRichToggleButton();
  updateTOC(); // Update TOC after mode change
  await updateSuggestedLinks(); // Update suggested links after mode change

  // Refresh comment decorations after mode change
  setTimeout(() => {
    refreshCommentDecorations();
  }, 100);
};

// Build hierarchical structure from flat headings array
const buildHeadingTree = (headings) => {
  const root = { children: [], level: 0 };
  const stack = [root];

  headings.forEach((heading) => {
    // Pop from stack until we find the parent level
    while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    const node = { ...heading, children: [], collapsed: false };

    if (!parent.children) {
      parent.children = [];
    }
    parent.children.push(node);
    stack.push(node);
  });

  return root.children;
};

// Render TOC tree with collapsible sections
const renderTOCTree = (nodes, depth = 0) => {
  if (!nodes || nodes.length === 0) return '';

  const items = nodes
    .map((node) => {
      const hasChildren = node.children && node.children.length > 0;
      const indent = depth * 16; // 16px per level (Material UI 8px grid)
      const chevronIcon = node.collapsed ? 'add_box' : 'indeterminate_check_box';
      const chevron = hasChildren
        ? `<span class="toc-chevron material-symbols-outlined ${node.collapsed ? 'collapsed' : ''}" data-heading-id="${node.id}">${chevronIcon}</span>`
        : '<span class="toc-chevron-spacer"></span>';

      const childrenHtml =
        hasChildren && !node.collapsed ? renderTOCTree(node.children, depth + 1) : '';

      return `
        <div class="toc-item-container" tabindex="-1">
          <div class="toc-item" style="padding-left: ${indent}px" data-pos="${node.pos}" data-heading-id="${node.id}" data-level="${node.level}" tabindex="-1">
            ${chevron}
            <span class="toc-text" title="${node.text}" tabindex="-1">${node.text}</span>
          </div>
          ${childrenHtml}
        </div>
      `;
    })
    .join('');

  return items;
};

// Update the TOC based on current editor state
const updateTOC = () => {
  const tocContent = document.getElementById('toc-content');
  const markdownSidebar = document.getElementById('markdown-sidebar');

  // Only show TOC in WYSIWYG mode for markdown files
  const isWysiwygMode = appState.editorManager && appState.editorManager.getMode() === 'wysiwyg';
  const isMarkdown = isMarkdownFile(appState.currentFilename);

  if (!isWysiwygMode || !isMarkdown || !appState.editorManager) {
    markdownSidebar.classList.add('hidden');
    return;
  }

  // Show sidebar
  markdownSidebar.classList.remove('hidden');

  // Extract headings from WYSIWYG editor
  const editor = appState.editorManager.getActiveEditor();
  if (!editor || !editor.getHeadings) {
    tocContent.innerHTML = '<p class="toc-empty">No headings found</p>';
    return;
  }

  const headings = editor.getHeadings();
  if (headings.length === 0) {
    tocContent.innerHTML = '<p class="toc-empty">No headings found</p>';
    return;
  }

  // Build and render tree
  const tree = buildHeadingTree(headings);
  tocContent.innerHTML = renderTOCTree(tree);

  // Add event listeners for TOC items
  attachTOCEventListeners();
};

// Attach click handlers to TOC items
const attachTOCEventListeners = () => {
  const tocItems = document.querySelectorAll('.toc-item');
  const chevrons = document.querySelectorAll('.toc-chevron');

  // Click on heading text to scroll
  tocItems.forEach((item) => {
    const textSpan = item.querySelector('.toc-text');
    if (textSpan) {
      console.log('[TOC] Attaching listeners to:', textSpan.textContent);

      // Use mouseup instead of click - preventDefault on mousedown blocks click in some browsers
      textSpan.addEventListener('mousedown', (e) => {
        console.log('[TOC] mousedown on:', textSpan.textContent);
        e.preventDefault(); // Prevents focus from leaving the editor
        e.stopPropagation(); // Prevents parent handlers from interfering
      });

      textSpan.addEventListener('mouseup', (e) => {
        console.log('[TOC] mouseup on:', textSpan.textContent);
        e.stopPropagation();
        e.preventDefault();
        const pos = parseInt(item.dataset.pos, 10);

        console.log('[TOC] Scrolling to heading at position:', pos);

        const editor = appState.editorManager?.getActiveEditor();

        if (editor && editor.scrollToPosition) {
          // Block session saves during TOC navigation to prevent scroll reset
          if (window.blockSessionSave) {
            clearTimeout(window.blockSessionSave);
          }
          window.blockSessionSave = true;

          // Scroll to the position (focus should be maintained by mousedown prevention)
          editor.scrollToPosition(pos);

          // Re-enable session saves after scroll completes (200ms should be enough)
          setTimeout(() => {
            window.blockSessionSave = false;
          }, 200);
        } else {
          console.error('[TOC] Editor or scrollToPosition not available');
        }
      });
    }
  });

  // Click on chevron to toggle collapse
  chevrons.forEach((chevron) => {
    // CRITICAL: We need preventDefault on mousedown AT THE ELEMENT LEVEL
    // to prevent focus change, but this still allows click events to fire
    chevron.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevents focus from leaving the editor
      e.stopPropagation(); // Prevents parent handlers from interfering
    });

    chevron.addEventListener('click', (e) => {
      e.stopPropagation();
      chevron.classList.toggle('collapsed');

      // Toggle icon between add_box (collapsed) and indeterminate_check_box (expanded)
      const isCollapsed = chevron.classList.contains('collapsed');
      chevron.textContent = isCollapsed ? 'add_box' : 'indeterminate_check_box';

      // Find and toggle the children container
      const container = chevron.closest('.toc-item-container');
      const nestedContainers = Array.from(
        container.querySelectorAll(':scope > .toc-item-container')
      );
      nestedContainers.forEach((nested) => {
        nested.classList.toggle('hidden');
      });
    });
  });

  // Prevent ALL mousedown events in the entire TOC area from stealing focus
  // This must be done at the top level to catch all clicks including background
  const markdownSidebar = document.getElementById('markdown-sidebar');
  const tocContainer = document.getElementById('markdown-toc');
  const tocContent = document.getElementById('toc-content');

  // Apply to all TOC-related elements to be thorough
  [markdownSidebar, tocContainer, tocContent].forEach((element) => {
    if (element) {
      // Remove any existing listener first to avoid duplicates
      element.removeEventListener('mousedown', preventTOCMousedown, true);
      // Add capture-phase listener
      element.addEventListener('mousedown', preventTOCMousedown, true);
    }
  });

  // Also add a document-level catch-all handler to prevent ANY clicks in TOC/editor areas from losing focus
  // This catches clicks on scrollbars, padding, margins, or any other missed elements
  document.addEventListener(
    'mousedown',
    (e) => {
      const sidebar = document.getElementById('markdown-sidebar');
      const editorWrapper = document.getElementById('editor');

      // Check if the click is within the TOC sidebar or editor area
      const inTOC = sidebar && sidebar.contains(e.target);
      const inEditor = editorWrapper && editorWrapper.contains(e.target);

      if (inTOC || inEditor) {
        // Only prevent default if clicking on non-interactive background elements
        const isBackgroundElement =
          e.target.id === 'markdown-sidebar' ||
          e.target.id === 'markdown-toc' ||
          e.target.id === 'toc-content' ||
          e.target.id === 'editor' ||
          e.target.classList.contains('markdown-sidebar') ||
          e.target.classList.contains('toc-content') ||
          e.target.classList.contains('toc-title');

        if (isBackgroundElement) {
          e.preventDefault();
        }

        // Ensure editor maintains focus when clicking in these areas
        // But don't call focus if we're clicking a TOC item (to avoid scroll interference)
        const isTOCItem = e.target.closest('.toc-item') || e.target.classList.contains('toc-text');

        if (!isTOCItem) {
          const editor = appState.editorManager?.getActiveEditor();
          if (editor && editor.focus) {
            // Use a very short delay to let other handlers complete first
            setTimeout(() => {
              editor.focus();
            }, 10);
          }
        }
      }
    },
    true
  ); // Capture phase
};

// Separate function to prevent mousedown from stealing focus
function preventTOCMousedown(e) {
  // Interactive elements (.toc-text, .toc-chevron) handle preventDefault themselves
  // and call stopPropagation, so this handler only catches background elements
  e.preventDefault();

  // NOTE: Do NOT call editor.focus() here!
  // Calling focus scrolls to current cursor position, interfering with TOC navigation
  // The e.preventDefault() is sufficient to maintain focus
}

// Update suggested links (other markdown files in the same folder)
const updateSuggestedLinks = async () => {
  const suggestedLinksContent = document.getElementById('suggested-links-content');
  const suggestedLinksMobileContent = document.getElementById('suggested-links-mobile-content');
  const suggestedLinksMobile = document.getElementById('suggested-links-mobile');

  // Only show suggested links in WYSIWYG mode for markdown files
  const isWysiwygMode = appState.editorManager && appState.editorManager.getMode() === 'wysiwyg';
  const isMarkdown = isMarkdownFile(appState.currentFilename);

  if (!isWysiwygMode || !isMarkdown || !appState.currentDirHandle) {
    suggestedLinksMobile.classList.add('hidden');
    return;
  }

  try {
    const files = [];
    for await (const entry of appState.currentDirHandle.values()) {
      if (
        entry.kind === 'file' &&
        isMarkdownFile(entry.name) &&
        entry.name !== appState.currentFilename
      ) {
        files.push(entry);
      }
    }

    // Sort alphabetically
    files.sort((a, b) => a.name.localeCompare(b.name));

    if (files.length === 0) {
      suggestedLinksContent.innerHTML =
        '<p class="suggested-links-empty">No other markdown files</p>';
      suggestedLinksMobileContent.innerHTML =
        '<p class="suggested-links-empty">No other markdown files</p>';
      suggestedLinksMobile.classList.add('hidden');
      return;
    }

    // Show mobile container
    suggestedLinksMobile.classList.remove('hidden');

    // Render links
    const linksHtml = files
      .map((file) => {
        return `<div class="suggested-link" data-filename="${file.name}" title="${file.name}">
          <span class="material-symbols-outlined">description</span>
          <span class="suggested-link-text">${file.name}</span>
        </div>`;
      })
      .join('');

    suggestedLinksContent.innerHTML = linksHtml;
    suggestedLinksMobileContent.innerHTML = linksHtml;

    // Attach click handlers
    attachSuggestedLinksEventListeners();
  } catch (error) {
    console.error('[SuggestedLinks] Error reading directory:', error);
    suggestedLinksContent.innerHTML = '<p class="suggested-links-empty">Error loading files</p>';
    suggestedLinksMobileContent.innerHTML =
      '<p class="suggested-links-empty">Error loading files</p>';
  }
};

// Attach click handlers to suggested links
const attachSuggestedLinksEventListeners = () => {
  const links = document.querySelectorAll('.suggested-link');

  links.forEach((link) => {
    link.addEventListener('click', async (e) => {
      e.stopPropagation();
      const filename = link.dataset.filename;
      if (filename && appState.currentDirHandle) {
        try {
          const fileHandle = await appState.currentDirHandle.getFileHandle(filename);
          await openFileFromPicker(fileHandle);
        } catch (error) {
          console.error('[SuggestedLinks] Error opening file:', error);
        }
      }
    });
  });
};

// Update new file button state based on workspace
const updateNewButtonState = () => {
  const newBtn = document.getElementById('new-btn');
  const hasWorkspace = appState.currentDirHandle !== null;
  const inGitHubMode = appState.isGitHubMode;

  // In GitHub mode, disable the button
  if (inGitHubMode) {
    newBtn.disabled = true;
    newBtn.title = 'Not available in read-only mode';
  } else {
    newBtn.disabled = !hasWorkspace;

    // Update tooltip to provide helpful feedback
    if (hasWorkspace) {
      newBtn.title = 'New file (Ctrl/Cmd+N)';
    } else {
      newBtn.title = 'Open a folder first to create new files';
    }
  }
};

// Convert current path and filename to URL parameter (used by history)
const _pathToUrlParam = () => {
  if (appState.currentPath.length === 0) {
    return '';
  }

  // Build path from appState.currentPath array
  const pathParts = appState.currentPath.map((p) => encodeURIComponent(p.name));
  let fullPath = './' + pathParts.join('/');

  // Add filename if we have one
  if (appState.currentFilename) {
    fullPath += '/' + encodeURIComponent(appState.currentFilename);
  }

  return fullPath;
};

// Parse URL parameter back to path segments
// eslint-disable-next-line no-unused-vars
const urlParamToPath = (param) => {
  if (!param || param === '/' || param === './') {
    return [];
  }

  // Remove leading ./ or / and split
  let cleaned = param;
  if (cleaned.startsWith('./')) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('/')) {
    cleaned = cleaned.slice(1);
  }
  return cleaned.split('/').filter((p) => p.length > 0);
};

// Check if File System Access API is supported
const isFileSystemAccessSupported = () => {
  return FileSystemAdapter.isSupported();
};

// Expose isFileSystemAccessSupported for file-picker module
window.isFileSystemAccessSupported = isFileSystemAccessSupported;

// Open folder
const openFolder = async () => {
  if (!isFileSystemAccessSupported()) {
    alert(
      'File System Access API is not supported in this browser. Please use Chrome, Edge, or a recent version of Safari.'
    );
    return;
  }

  // Exit GitHub reader mode if active
  exitGitHubReader();

  // Close file picker when showing the open dialog
  hideFilePicker();

  try {
    // Cleanup trash from previous folder before opening new one
    if (appState.currentDirHandle) {
      await trashManager.cleanup(appState.currentDirHandle);
    }

    // Save temp changes if file is dirty
    if (appState.isDirty && appState.currentFileHandle) {
      saveTempChanges();
    }

    const dirHandle = await FileSystemAdapter.openDirectory();
    if (!dirHandle) return; // User cancelled

    appState.currentDirHandle = dirHandle;
    appState.rootDirHandle = dirHandle; // Set root directory for session file
    appState.currentPath = [{ name: dirHandle.name, handle: dirHandle }];
    appState.currentFileHandle = null;
    appState.currentFilename = '';
    await initEditor('', 'untitled');

    // Save folder name to localStorage for auto-resume
    localStorage.setItem('lastFolderName', dirHandle.name);

    // Load session file and restore last open file
    let sessionData = await loadSessionFile(appState.rootDirHandle);
    if (!sessionData) {
      // Create empty session file
      console.log('No session file found, creating new one');
      sessionData = createEmptySession(dirHandle.name);
      await saveSessionFile(appState.rootDirHandle, sessionData);
    } else {
      console.log('Session file loaded:', sessionData);
    }

    // Load comments from session
    await loadCommentsFromSession();

    // Track if file was successfully restored
    let fileRestored = false;

    // Check URL params first - they take precedence over session data
    const urlParams = URLParamManager.validate();
    const urlFile = urlParams.file;

    // Try to restore file from URL param or session
    const fileToRestore = urlFile || sessionData.session?.lastOpenFile?.path;

    if (fileToRestore) {
      const lastFile = urlFile
        ? { path: urlFile } // Don't set editorMode - let it default to 'wysiwyg' for markdown
        : sessionData.session.lastOpenFile;

      // Set flag to indicate we're restoring from session
      // Only set this flag when restoring from session data, not URL params
      // This ensures URL-opened files always default to wysiwyg mode (showing TOC)
      appState.isRestoringSession = !urlFile;

      // Save editor mode preference to localStorage so initEditor can use it
      // Only save if we have an explicit editorMode (from session data, not URL params)
      if (lastFile.editorMode !== undefined && lastFile.editorMode !== null) {
        const filename = lastFile.path.split('/').pop();
        localStorage.setItem(`mode_${filename}`, lastFile.editorMode);
      }

      const result = await openFileByPath(appState.rootDirHandle, lastFile.path);

      if (result) {
        // Rebuild currentPath from the session path
        const pathParts = lastFile.path.split('/').filter((p) => p);
        pathParts.pop(); // Remove filename

        // Build path array with handles
        const newPath = [{ name: appState.rootDirHandle.name, handle: appState.rootDirHandle }];

        // Navigate and build path for subdirectories (if any)
        let currentHandle = appState.rootDirHandle;
        for (const dirName of pathParts) {
          try {
            currentHandle = await currentHandle.getDirectoryHandle(dirName);
            newPath.push({ name: dirName, handle: currentHandle });
          } catch (err) {
            console.error('[Session] Error navigating to directory:', dirName, err);
            break;
          }
        }

        // Update state with correct path
        appState.currentPath = newPath;
        appState.currentDirHandle = result.dirHandle;

        // Actually open the file with the retrieved handle
        await openFileFromPicker(result.fileHandle);
        fileRestored = true;
      } else {
        // File could not be found - show helpful message
        console.warn('[Session] Could not restore file:', lastFile.path);
        console.warn('[Session] File may not exist in this folder or may have been deleted');

        // Show notification to user (if notification system exists)
        if (window.showFileReloadNotification) {
          window.showFileReloadNotification(`Could not find: ${lastFile.path.split('/').pop()}`);
        }
      }

      // Clear the flag
      appState.isRestoringSession = false;

      if (fileRestored) {
        // Wait for editor to be ready, then restore cursor and scroll
        setTimeout(async () => {
          if (appState.editorManager) {
            // Markdown file - using EditorManager
            await appState.editorManager.ready();

            // Restore cursor and scroll position
            if (lastFile.cursorLine !== undefined && lastFile.cursorColumn !== undefined) {
              appState.editorManager.setCursor(lastFile.cursorLine, lastFile.cursorColumn);
            }
            if (lastFile.scrollTop !== undefined) {
              appState.editorManager.setScrollPosition(lastFile.scrollTop);
            }
            appState.editorManager.focus();
          } else if (appState.editorView) {
            // Non-markdown file - using CodeMirror

            // Restore cursor position
            if (lastFile.cursorLine !== undefined && lastFile.cursorColumn !== undefined) {
              const doc = appState.editorView.state.doc;
              const targetLine = lastFile.cursorLine + 1; // Convert to 1-based

              // Validate line number is within document bounds
              if (targetLine >= 1 && targetLine <= doc.lines) {
                const line = doc.line(targetLine);
                const pos = line.from + Math.min(lastFile.cursorColumn, line.length);
                appState.editorView.dispatch({
                  selection: { anchor: pos, head: pos },
                });
              }
            }

            // Restore scroll position
            if (lastFile.scrollTop !== undefined) {
              appState.editorView.scrollDOM.scrollTop = lastFile.scrollTop;
            }
            if (lastFile.scrollLeft !== undefined) {
              appState.editorView.scrollDOM.scrollLeft = lastFile.scrollLeft;
            }
            appState.editorView.focus();
          }

          // Update UI
          updateRichToggleButton();

          // Mark restoration time to prevent premature saves
          appState.lastRestorationTime = Date.now();
        }, 100);
      }
    }

    addToHistory();

    // Update URL params with workdir after folder is opened
    // Preserve file param if it exists in the URL (don't overwrite it yet)
    const workdirPath = dirHandle.name ? `/${dirHandle.name}` : '/workspace';
    const currentUrlParams = URLParamManager.validate();
    URLParamManager.update(workdirPath, currentUrlParams.file);

    // Only show file picker if file was not restored
    if (!fileRestored) {
      await showFilePicker(dirHandle);
    }

    updateBreadcrumb();
    updateLogoState(true); // Animate immediately when folder is chosen
    updateNewButtonState();
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Error opening folder:', err);
      alert('Error opening folder: ' + err.message);
    }
  }
};

// Expose openFolder for file-picker module
window.openFolder = openFolder;

// Show file picker for a directory

// Create trash manager with callbacks
const trashManager = createTrashManager({
  onFileDeleted: (filename) => {
    // Handle file deleted - close if currently open
    if (appState.currentFileHandle && appState.currentFileHandle.name === filename) {
      appState.currentFileHandle = null;
      appState.currentFilename = '';
      appState.isDirty = false;
      initEditor('', 'untitled').then(() => updateBreadcrumb());
    }

    // Clear temp changes for deleted file
    const pathParts = appState.currentPath.map((p) => p.name);
    pathParts.push(filename);
    const filePathKey = pathParts.join('/');
    clearTempChanges(filePathKey);
  },
  onFileRestored: () => {
    // File restored - no special action needed, refreshFilePicker handles UI
  },
  refreshFilePicker: async (dirHandle) => {
    await showFilePicker(dirHandle);
  },
});

// Expose trashManager for file-picker module
window.trashManager = trashManager;

// Create autosave manager with callbacks
const autosaveManager = createAutosaveManager({
  interval: 2000,
  enabled: appState.autosaveEnabled,
  onSave: async () => {
    await saveFile();
  },
  shouldSave: () => {
    return appState.isDirty && appState.currentFileHandle;
  },
});

// Create file sync manager with callbacks
const fileSyncManager = createFileSyncManager({
  interval: 2500,
  idleThreshold: 4000,
  getFileHandle: () => appState.currentFileHandle,
  getFileMetadata: async (handle) => await FileSystemAdapter.getFileMetadata(handle),
  readFile: async (handle) => await FileSystemAdapter.readFile(handle),
  getCurrentEditorState: () => {
    let scrollTop = 0;
    let cursorLine = 0;
    let cursorColumn = 0;

    if (appState.editorManager) {
      // Capture from markdown editor
      if (appState.editorManager.currentMode === 'wysiwyg') {
        scrollTop = appState.editorManager.getScrollPosition();
      } else {
        const view = appState.editorManager.currentEditor?.view;
        if (view) {
          scrollTop = view.scrollDOM.scrollTop;
        }
      }
      const cursor = appState.editorManager.getCursor();
      cursorLine = cursor.line;
      cursorColumn = cursor.column;
    } else if (appState.editorView) {
      // Capture from regular CodeMirror
      scrollTop = appState.editorView.scrollDOM.scrollTop;
      const pos = appState.editorView.state.selection.main.head;
      const line = appState.editorView.state.doc.lineAt(pos);
      cursorLine = line.number - 1;
      cursorColumn = pos - line.from;
    }

    return { scrollTop, cursorLine, cursorColumn };
  },
  updateEditorContent: async (freshContent, editorState) => {
    const { scrollTop, cursorLine, cursorColumn } = editorState;

    if (appState.editorManager) {
      const wasWYSIWYG = appState.editorManager.currentMode === 'wysiwyg';

      if (wasWYSIWYG) {
        // For WYSIWYG: destroy and recreate to avoid duplicates
        appState.editorManager.currentEditor.destroy();
        appState.editorManager.container.innerHTML = '';

        await appState.editorManager.init('wysiwyg', freshContent);
        appState.focusManager.setEditors(appState.editorManager, null);

        await appState.editorManager.ready();

        // Restore scroll and cursor after render
        setTimeout(() => {
          if (appState.editorManager.currentEditor) {
            appState.editorManager.currentEditor.setScrollPosition(scrollTop);
            try {
              appState.editorManager.setCursor(cursorLine, cursorColumn);
            } catch (_e) {
              // Line might not exist in new content
            }
          }
        }, 100);
      } else {
        // Source mode: update with scroll preservation
        const view = appState.editorManager.currentEditor?.view;
        if (view) {
          view.dispatch({
            changes: {
              from: 0,
              to: view.state.doc.length,
              insert: freshContent,
            },
          });

          requestAnimationFrame(() => {
            view.scrollDOM.scrollTop = scrollTop;

            try {
              const lineObj = view.state.doc.line(cursorLine + 1);
              const pos = lineObj.from + Math.min(cursorColumn, lineObj.length);
              view.dispatch({
                selection: { anchor: pos, head: pos },
              });
            } catch (_e) {
              // Line might not exist in new content
            }
          });
        }
      }
    } else if (appState.editorView) {
      // For non-markdown files: update with scroll and cursor preservation
      appState.editorView.dispatch({
        changes: {
          from: 0,
          to: appState.editorView.state.doc.length,
          insert: freshContent,
        },
      });

      requestAnimationFrame(() => {
        appState.editorView.scrollDOM.scrollTop = scrollTop;

        try {
          const lineObj = appState.editorView.state.doc.line(cursorLine + 1);
          const pos = lineObj.from + Math.min(cursorColumn, lineObj.length);
          appState.editorView.dispatch({
            selection: { anchor: pos, head: pos },
          });
        } catch (_e) {
          console.log('[File Sync] Could not restore cursor');
        }
      });
    }

    // Update app state
    appState.originalContent = freshContent;
    appState.isDirty = false;

    // Clear temp changes
    const pathKey = getFilePathKey();
    if (pathKey) {
      clearTempChanges(pathKey);
    }

    // Update UI
    updateBreadcrumb();
  },
  onFileReloaded: () => {
    showFileReloadNotification();
  },
  onSyncStart: () => {
    const editorElement = document.getElementById('editor');
    const breadcrumb = document.getElementById('breadcrumb');
    if (editorElement) {
      editorElement.classList.add('syncing');
    }
    if (breadcrumb) {
      breadcrumb.classList.add('syncing');
    }
  },
  onSyncEnd: () => {
    const editorElement = document.getElementById('editor');
    const breadcrumb = document.getElementById('breadcrumb');
    if (editorElement) {
      editorElement.classList.remove('syncing');
      editorElement.classList.remove('blurred');
    }
    if (breadcrumb) {
      breadcrumb.classList.remove('syncing');
    }

    // Restore focus to editor
    appState.focusManager.focusEditor({ delay: 50, reason: 'file-synced' });
  },
  onSyncError: () => {
    // Errors are already logged by FileSyncManager
  },
});

// Comment system variables
let commentToolbar = null;
let commentPanel = null;

// Helper function to close comment UI elements
const closeComments = () => {
  if (commentPanel) {
    commentPanel.hide(false, true); // Force hide
  }
  if (commentToolbar) {
    commentToolbar.hide();
  }
};

// Expose closeComments for theme-manager module
window.closeComments = closeComments;

// Expose comment instances for testing
window.commentToolbar = commentToolbar;
window.commentPanel = commentPanel;

// Initialize comment system
function initCommentSystem() {
  // Skip initialization if in GitHub read-only mode
  if (appState.isGitHubMode || appState.isReadOnly) {
    console.log('[Comments] Skipping initialization in read-only mode');
    return;
  }

  // Get editor container
  const editorContainer = document.getElementById('editor');
  if (!editorContainer) {
    console.warn('[Comments] Editor container not found');
    return;
  }

  // Create toolbar and panel
  commentToolbar = new CommentToolbar(editorContainer, handleAddComment);
  commentPanel = new CommentPanel(document.body, handleReply, handleResolve, handleDelete);

  // Link toolbar and panel so they can coordinate visibility
  commentPanel.setToolbar(commentToolbar);
  commentToolbar.setPanel(commentPanel);

  // Expose instances for testing
  window.commentToolbar = commentToolbar;
  window.commentPanel = commentPanel;

  // Setup selection listener
  setupSelectionListener();

  console.log('[Comments] Comment system initialized');
}

// Setup selection listener for showing comment toolbar
function setupSelectionListener() {
  // Skip if in read-only mode
  if (appState.isGitHubMode || appState.isReadOnly) {
    return;
  }

  let selectionTimeout = null;

  const handleSelectionChange = () => {
    // Debounce selection changes
    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(() => {
      // Runtime check: skip if in read-only mode (GitHub or other remote files)
      if (appState.isGitHubMode || appState.isReadOnly) {
        console.debug('[Comments] Skipping selection handler in read-only mode');
        return;
      }

      const editor = appState.editorManager || appState.editorView;
      if (!editor) {
        console.debug('[Comments] No editor available');
        return;
      }
      if (!commentToolbar) {
        console.warn('[Comments] Comment toolbar not initialized');
        return;
      }

      // Check if editor has getSelection method
      if (!editor.getSelection) {
        console.warn('[Comments] Editor missing getSelection method');
        return;
      }

      const selection = editor.getSelection();
      console.log('[Comments] Selection detected:', selection);

      if (selection && selection.text && selection.text.trim().length > 0) {
        // Show toolbar near selection
        try {
          const windowSelection = window.getSelection();
          if (windowSelection && windowSelection.rangeCount > 0) {
            const rect = windowSelection.getRangeAt(0).getBoundingClientRect();
            console.log('[Comments] Showing toolbar at', rect.left, rect.bottom + 5);
            commentToolbar.show(rect.left, rect.bottom + 5, selection);
          } else {
            console.debug('[Comments] No window selection range');
          }
        } catch (e) {
          // Selection might not be available
          console.error('[Comments] Could not show toolbar:', e);
        }
      } else {
        commentToolbar.hide();
      }
    }, 100);
  };

  document.addEventListener('mouseup', handleSelectionChange);
  document.addEventListener('keyup', handleSelectionChange);
}

// Load comments from session file
async function loadCommentsFromSession() {
  if (!appState.rootDirHandle) return;

  try {
    const sessionData = await loadSessionFile(appState.rootDirHandle);
    if (sessionData && sessionData.comments) {
      appState.setComments(sessionData.comments);
      console.log(`[Comments] Loaded ${sessionData.comments.length} comments from session`);
      refreshCommentDecorations();
    }
  } catch (err) {
    console.error('[Comments] Error loading comments:', err);
  }
}

// Refresh comment decorations in editor
function refreshCommentDecorations() {
  const editor = appState.editorManager?.currentEditor || appState.editorView;
  if (!editor) return;

  const currentFile = getRelativeFilePath();
  const fileComments = appState.getCommentsForFile(currentFile);

  // Convert anchors to positions
  const doc = editor.getDocumentText ? editor.getDocumentText() : editor.state.doc.toString();
  const commentsWithPositions = fileComments
    .map((comment) => {
      const pos = findAnchorPosition(doc, comment.anchor);
      if (pos) {
        return {
          id: comment.id,
          position: pos,
          resolved: comment.resolved,
        };
      }
      return null;
    })
    .filter(Boolean);

  // Apply decorations if editor supports it
  const activeCommentId = appState.getActiveCommentId();
  if (editor.applyCommentDecorations) {
    editor.applyCommentDecorations(commentsWithPositions, activeCommentId, handleCommentClick);
  }

  console.log(`[Comments] Applied ${commentsWithPositions.length} decorations for ${currentFile}`);
}

// Handle adding a new comment
async function handleAddComment(selection) {
  const editor = appState.editorManager || appState.editorView;
  if (!editor) return;

  const doc = editor.getDocumentText ? editor.getDocumentText() : editor.state.doc.toString();
  const anchor = createAnchor(doc, selection.from, selection.to);

  // Create comment with empty thread - user will add first message via panel
  const comment = {
    id: crypto.randomUUID(),
    fileRelativePath: getRelativeFilePath(),
    userId: getUserId(),
    anchor,
    fallbackPosition: {
      from: { line: 0, col: selection.from },
      to: { line: 0, col: selection.to },
    },
    timestamp: Date.now(),
    resolved: false,
    thread: [], // Empty - will be filled via reply form
  };

  // Add to app state (temporarily, will save after first message)
  appState.addComment(comment);
  appState.setActiveCommentId(comment.id);

  // Hide toolbar
  if (commentToolbar) {
    commentToolbar.hide();
  }

  // Show panel to let user add first comment
  try {
    const windowSelection = window.getSelection();
    if (windowSelection && windowSelection.rangeCount > 0) {
      const rect = windowSelection.getRangeAt(0).getBoundingClientRect();
      // Position panel at bottom-right of selection
      commentPanel.show(comment, rect.right, rect.bottom);
    }
  } catch (e) {
    console.error('[Comments] Error showing panel:', e);
  }

  // Refresh decorations to show new comment highlight
  refreshCommentDecorations();

  console.log('[Comments] Created new comment (awaiting first message):', comment.id);
}

// Handle comment click
function handleCommentClick(commentId) {
  const comment = appState.getComments().find((c) => c.id === commentId);
  if (!comment) return;

  // Set as active
  appState.setActiveCommentId(commentId);

  // Show panel near comment
  try {
    const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`);
    if (commentElement) {
      const rect = commentElement.getBoundingClientRect();
      // Position panel at bottom-right of comment highlight
      commentPanel.show(comment, rect.right, rect.bottom);
    }
  } catch (e) {
    console.error('[Comments] Error showing panel:', e);
  }

  // Refresh decorations to highlight active comment
  refreshCommentDecorations();

  console.log('[Comments] Clicked comment:', commentId);
}

// Handle reply to comment
async function handleReply(commentId, text) {
  const comment = appState.getComments().find((c) => c.id === commentId);
  if (!comment) return;

  const reply = {
    userId: getUserId(),
    userName: getUserDisplayName(),
    text: text.trim(),
    timestamp: Date.now(),
  };

  comment.thread.push(reply);

  const isFirstMessage = comment.thread.length === 1;

  // Save to session
  try {
    const sessionData = await loadSessionFile(appState.rootDirHandle);
    if (sessionData) {
      if (isFirstMessage) {
        // This is the first message - add the whole comment to session
        addCommentToSession(sessionData, comment);
      } else {
        // This is a reply - update existing comment
        updateCommentInSession(sessionData, commentId, { thread: comment.thread });
      }
      await saveSessionFile(appState.rootDirHandle, sessionData);
    }
  } catch (err) {
    console.error('[Comments] Error saving reply:', err);
  }

  // Update panel
  if (commentPanel) {
    commentPanel.update(comment);
  }

  // Refresh decorations (in case this was the first message)
  if (isFirstMessage) {
    refreshCommentDecorations();
  }

  console.log(`[Comments] Added ${isFirstMessage ? 'first message' : 'reply'} to:`, commentId);
}

// Handle resolve comment
async function handleResolve(commentId) {
  const comment = appState.getComments().find((c) => c.id === commentId);
  if (!comment) return;

  comment.resolved = true;

  // Save to session
  try {
    const sessionData = await loadSessionFile(appState.rootDirHandle);
    if (sessionData) {
      updateCommentInSession(sessionData, commentId, { resolved: true });
      await saveSessionFile(appState.rootDirHandle, sessionData);
    }
  } catch (err) {
    console.error('[Comments] Error resolving comment:', err);
  }

  // Update panel and decorations
  if (commentPanel) {
    commentPanel.update(comment);
  }
  refreshCommentDecorations();

  console.log('[Comments] Resolved comment:', commentId);
}

// Handle delete comment
async function handleDelete(commentId) {
  appState.deleteComment(commentId);

  // Save to session
  try {
    const sessionData = await loadSessionFile(appState.rootDirHandle);
    if (sessionData) {
      deleteCommentFromSession(sessionData, commentId);
      await saveSessionFile(appState.rootDirHandle, sessionData);
    }
  } catch (err) {
    console.error('[Comments] Error deleting comment:', err);
  }

  // Refresh decorations
  refreshCommentDecorations();

  console.log('[Comments] Deleted comment:', commentId);
}

// Show delete confirmation inline

// Save file
const saveFile = async () => {
  if (!isFileSystemAccessSupported()) {
    alert(
      'File System Access API is not supported in this browser. Please use Chrome, Edge, or a recent version of Safari.'
    );
    return;
  }

  if (!appState.isDirty && appState.currentFileHandle) {
    // No changes to save
    return;
  }

  try {
    const content = getEditorContent();

    // If no file handle exists, prompt for save location
    if (!appState.currentFileHandle) {
      appState.currentFileHandle = await FileSystemAdapter.saveFilePicker(
        appState.currentFilename || 'untitled.txt'
      );

      if (!appState.currentFileHandle) return; // User cancelled

      appState.currentFilename = appState.currentFileHandle.name;
      updateBreadcrumb();
    }

    // Write to file
    await FileSystemAdapter.writeFile(appState.currentFileHandle, content);

    appState.isDirty = false;

    // Update original content to the saved content
    appState.originalContent = content;

    // Update file modification tracking
    const metadata = await FileSystemAdapter.getFileMetadata(appState.currentFileHandle);
    fileSyncManager.updateLastKnownModified(metadata.lastModified);
    fileSyncManager.updateLastModifiedLocal(null); // Clear since we just saved

    // Clear temp changes after successful save
    const pathKey = getFilePathKey();
    if (pathKey) {
      clearTempChanges(pathKey);
    }

    updateBreadcrumb();
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Error saving file:', err);
      alert('Error saving file: ' + err.message);
    }
  }
};

const showFileReloadNotification = (message = 'Reloaded from disk') => {
  // Create toast notification
  const toast = document.createElement('div');
  toast.className = 'file-reload-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // Show and auto-dismiss
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 2500);
};

// Expose showFileReloadNotification for file-picker module
window.showFileReloadNotification = showFileReloadNotification;

// Debounced version (save every 2 seconds)
const debouncedSaveEditorState = createDebouncedSaveEditorState(getRelativeFilePath);

// Debounced TOC update (update every 500ms after typing stops)
const debouncedUpdateTOC = debounce(updateTOC, 500);

// Debounced comment validation (validate every 500ms after typing stops)
const debouncedValidateComments = debounce(async () => {
  try {
    console.log('[Comments] Validation triggered');

    // Skip if in read-only mode or no comments
    if (appState.isReadOnly) {
      console.log('[Comments] Skipping validation - read-only mode');
      return;
    }

    if (appState.comments.length === 0) {
      console.log('[Comments] Skipping validation - no comments');
      return;
    }

    // Get current document content
    let content = '';
    if (appState.editorManager) {
      content = appState.editorManager.getContent();
    } else if (appState.editorView) {
      content = appState.editorView.state.doc.toString();
    }

    if (!content) {
      console.log('[Comments] Skipping validation - no content');
      return;
    }

    // Get comments for current file
    const currentFilePath = getRelativeFilePath();
    const fileComments = appState.getCommentsForFile(currentFilePath);

    console.log(
      '[Comments] Validating',
      fileComments.length,
      'comments for file:',
      currentFilePath
    );

    if (fileComments.length === 0) {
      return;
    }

    // Validate all comments
    const validationResults = validateAllComments(content, fileComments);
    console.log('[Comments] Validation results:', JSON.stringify(validationResults, null, 2));
    console.log(
      '[Comments] Document content length:',
      content.length,
      'content:',
      JSON.stringify(content.substring(0, 100))
    );

    // Log each comment being validated
    fileComments.forEach((comment, i) => {
      console.log(`[Comments] Comment ${i}:`, {
        id: comment.id,
        anchor: comment.anchor,
        fallbackPosition: comment.fallbackPosition,
      });
    });

    let needsSessionSave = false;

    for (const result of validationResults) {
      if (result.action === 'delete') {
        // Delete the comment
        console.log('[Comments] Deleting comment with no nearby words:', result.commentId);
        await handleDelete(result.commentId);
        needsSessionSave = true;
      } else if (result.action === 'snap' && result.position) {
        // Update comment position to snap to nearest word
        console.log(
          '[Comments] Snapping comment to nearest word:',
          result.commentId,
          'from',
          result.position.from,
          'to',
          result.position.to
        );
        const comment = appState.comments.find((c) => c.id === result.commentId);
        if (comment) {
          // Update the anchor with new position
          const newAnchor = createAnchor(content, result.position.from, result.position.to);
          comment.anchor = newAnchor;
          comment.fallbackPosition = {
            from: { line: 0, col: result.position.from },
            to: { line: 0, col: result.position.to },
          };
          appState.updateComment(result.commentId, comment);
          needsSessionSave = true;
        }
      }
      // 'keep' action - no changes needed
    }

    // Refresh comment decorations if any changes were made
    if (needsSessionSave) {
      refreshCommentDecorations();
    }

    // Save session if any changes were made
    if (needsSessionSave) {
      try {
        const sessionData = await loadSessionFile(appState.rootDirHandle);
        if (sessionData) {
          await saveSessionFile(appState.rootDirHandle, sessionData);
        }
      } catch (err) {
        console.error('[Comments] Error saving comment updates:', err);
      }

      // Refresh comment panel if visible
      if (appState.commentPanelVisible && window.commentPanel) {
        window.commentPanel.refresh();
      }
    }
  } catch (error) {
    console.error('[Comments] Error during validation:', error);
  }
}, 500);

// Fuzzy match helper - handles case-insensitive, substring, and space-as-wildcard matching

// Helper function to get Material Symbol icon name based on file type

// Theme management is now handled by theme-manager module

// Event listeners
document.getElementById('new-btn').addEventListener('click', () => {
  appState.focusManager.saveFocusState();

  // Exit GitHub reader mode if active
  exitGitHubReader();

  newFile();
});
document.getElementById('back-btn').addEventListener('click', async () => {
  // Save current editor state to history before navigating
  if (appState.currentFileHandle && appState.navigationHistory[appState.historyIndex]) {
    const editorState = appState.focusManager._captureEditorState();
    if (editorState) {
      appState.navigationHistory[appState.historyIndex].editorState = editorState;
    }
  }

  // Use browser's native back - this will trigger popstate event
  // which handles all the navigation logic consistently
  window.history.back();
});
document.getElementById('forward-btn').addEventListener('click', async () => {
  // Save current editor state to history before navigating
  if (appState.currentFileHandle && appState.navigationHistory[appState.historyIndex]) {
    const editorState = appState.focusManager._captureEditorState();
    if (editorState) {
      appState.navigationHistory[appState.historyIndex].editorState = editorState;
    }
  }

  // Use browser's native forward - this will trigger popstate event
  // which handles all the navigation logic consistently
  window.history.forward();
});
document.getElementById('folder-up-btn').addEventListener('click', async () => {
  appState.focusManager.saveFocusState();
  await goFolderUp({
    saveTempChanges,
    initEditor,
    updateBreadcrumb,
    updateLogoState,
    showFilePicker,
  });
});
document.getElementById('autosave-checkbox').addEventListener('change', (e) => {
  appState.focusManager?.saveFocusState();
  autosaveManager.toggle(e.target.checked);
  animateAutosaveLabel(e.target.checked);
  // Restore focus after checkbox interaction
  setTimeout(() => {
    appState.focusManager?.focusEditor({ reason: 'autosave-toggle' });
  }, 0);
});
document.getElementById('rich-toggle-btn').addEventListener('click', async () => {
  appState.focusManager.saveFocusState();
  await toggleRichMode();
  // Restore focus after mode toggle
  setTimeout(() => {
    appState.focusManager?.focusEditor({ reason: 'rich-mode-toggle' });
  }, 0);
});
// Theme toggle button - prevent it from stealing focus
const darkModeToggle = document.getElementById('dark-mode-toggle');
darkModeToggle.addEventListener('mousedown', (e) => {
  // Prevent the button from taking focus when clicked
  e.preventDefault();
});
darkModeToggle.addEventListener('click', () => {
  appState.focusManager.saveFocusState();

  // Close comment panel and toolbar when switching theme
  closeComments();

  toggleTheme();
});

// Header click to show file picker
document.querySelector('header').addEventListener('click', (e) => {
  // Only handle if a folder is currently open
  if (!appState.currentDirHandle) return;

  // Don't trigger if clicking on interactive elements or breadcrumb items
  if (
    e.target.closest('button') ||
    e.target.closest('input') ||
    e.target.closest('label') ||
    e.target.classList.contains('breadcrumb-item') ||
    e.target.classList.contains('breadcrumb-input') ||
    e.target.closest('.autocomplete-container')
  ) {
    return;
  }

  // Show the file picker (same behavior as clicking filename)
  appState.focusManager.saveFocusState();
  showFilePicker(appState.currentDirHandle);
});

// Browser back/forward button listener
window.addEventListener('popstate', async (event) => {
  // If there's no state or it's not from our app, let the browser handle it
  if (!event.state || !event.state.appHistory) {
    return;
  }

  const targetIndex = event.state.historyIndex;

  // Set flag to prevent addToHistory from creating duplicate entries
  appState.isPopStateNavigation = true;

  // Create navigation callbacks
  const navCallbacks = {
    saveTempChanges,
    loadTempChanges,
    initEditor,
    updateBreadcrumb,
    updateLogoState,
    hideFilePicker,
    showFilePicker,
    getFilePathKey,
    restoreEditorState: (state) => appState.focusManager._restoreEditorState(state),
    isMarkdownFile,
  };

  try {
    // Navigate to the target index
    if (targetIndex < appState.historyIndex) {
      // Going back
      while (appState.historyIndex > targetIndex && appState.historyIndex > 0) {
        await goBack(navCallbacks);
      }
    } else if (targetIndex > appState.historyIndex) {
      // Going forward
      while (
        appState.historyIndex < targetIndex &&
        appState.historyIndex < appState.navigationHistory.length - 1
      ) {
        await goForward(navCallbacks);
      }
    }
  } finally {
    // Always reset the flag
    appState.isPopStateNavigation = false;

    // Restore focus to editor after navigation
    if (appState.currentFileHandle) {
      requestAnimationFrame(() => {
        appState.focusManager.restoreFocus();
      });
    }
  }
});

// Initialize keyboard manager (handles quick file creation, Enter/Escape keys, and blur state)
initKeyboardManager();

// Initialize theme manager (handles dark/light mode toggle and system preferences)
initThemeManager();

// Initialize blur state
updateEditorBlurState();

// Initialize footer visibility based on workspace state
updateLogoState();

// Register service worker for PWA (disabled in development)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.log('Service worker registration failed:', err);
  });
}

// Prompt management (welcome/resume/workdir) is now handled by prompt-manager module

// Version management is now handled by version-manager module

// Exit GitHub Reader Mode - restore normal UI state
function exitGitHubReader() {
  if (!appState.isGitHubMode) {
    return; // Not in GitHub mode, nothing to do
  }

  // Reset GitHub mode state
  appState.resetGitHubMode();

  // Restore UI elements
  const richToggleBtn = document.getElementById('rich-toggle-btn');
  if (richToggleBtn) {
    richToggleBtn.style.display = '';
  }

  const filePickerBtn = document.getElementById('file-picker-btn');
  if (filePickerBtn) {
    filePickerBtn.style.display = '';
  }

  // Show Related Files section again
  const suggestedLinks = document.getElementById('suggested-links');
  if (suggestedLinks) {
    suggestedLinks.style.display = '';
  }
  const suggestedLinksMobile = document.getElementById('suggested-links-mobile');
  if (suggestedLinksMobile) {
    suggestedLinksMobile.style.display = '';
  }

  // Re-enable autosave
  appState.setAutosaveEnabled(true);

  // Re-enable autosave checkbox
  const autosaveCheckbox = document.getElementById('autosave-checkbox');
  if (autosaveCheckbox) {
    autosaveCheckbox.disabled = false;
    autosaveCheckbox.checked = true; // Set to checked since autosave is enabled
  }

  // Clear gitreader URL parameter
  URLParamManager.clearGitReader();

  // Update new button state to restore normal behavior
  updateNewButtonState();

  // Update logo state to restore footer visibility
  updateLogoState();

  console.log('Exited GitHub reader mode');
}

// GitHub Reader Mode - Load file from GitHub URL
async function initGitHubReader(githubUrl) {
  // Blur editor while loading
  const editorContainer = document.getElementById('editor');
  if (editorContainer) {
    editorContainer.style.filter = 'blur(4px)';
    editorContainer.style.pointerEvents = 'none';
  }

  try {
    // Parse GitHub URL
    const repoInfo = GitHubAdapter.parseURL(githubUrl);
    const adapter = new GitHubAdapter(repoInfo.owner, repoInfo.repo, repoInfo.branch);

    // Set GitHub mode in app state
    appState.setGitHubMode(true);
    appState.setReadOnly(true);
    appState.setGitHubRepo(repoInfo);
    appState.setGitHubAdapter(adapter);
    appState.setRemoteSource(githubUrl);

    // Fetch file content
    const content = await adapter.readFile(repoInfo.path);

    // Extract filename from path
    const filename = repoInfo.path.split('/').pop();
    appState.setCurrentFilename(filename);

    // Update document title to show the filename
    document.title = filename;

    // Initialize editor with content in readonly mode
    if (isMarkdownFile(filename)) {
      // Clear the editor container first
      const editorContainer = document.getElementById('editor');
      editorContainer.innerHTML = '';

      // Destroy existing editors
      if (appState.editorManager) {
        appState.editorManager.destroy();
        appState.editorManager = null;
      }
      if (appState.editorView) {
        appState.editorView.destroy();
        appState.editorView = null;
      }

      // Create new editor manager in readonly mode
      appState.editorManager = new EditorManager(editorContainer, 'wysiwyg', content, null, true);
      await appState.editorManager.ready();

      // Show TOC sidebar for markdown
      const markdownSidebar = document.getElementById('markdown-sidebar');
      if (markdownSidebar) {
        markdownSidebar.classList.remove('hidden');
      }

      // Hide Related Files section in GitHub mode
      const suggestedLinks = document.getElementById('suggested-links');
      if (suggestedLinks) {
        suggestedLinks.style.display = 'none';
      }
      const suggestedLinksMobile = document.getElementById('suggested-links-mobile');
      if (suggestedLinksMobile) {
        suggestedLinksMobile.style.display = 'none';
      }

      // Generate TOC for the markdown content
      setTimeout(() => {
        updateTOC();
      }, 500);
    } else {
      if (!appState.editorView) {
        await initEditor();
      }
      const transaction = appState.editorView.state.update({
        changes: {
          from: 0,
          to: appState.editorView.state.doc.length,
          insert: content,
        },
      });
      appState.editorView.dispatch(transaction);
    }

    // Mark as clean (not dirty)
    appState.markDirty(false);
    appState.setOriginalContent(content);

    // Disable autosave in read-only mode
    appState.setAutosaveEnabled(false);
    if (autosaveManager) {
      autosaveManager.stop();
    }

    // Disable autosave checkbox and keep label visible
    const autosaveCheckbox = document.getElementById('autosave-checkbox');
    const autosaveLabel = document.getElementById('autosave-label');
    if (autosaveCheckbox) {
      autosaveCheckbox.disabled = true;
      autosaveCheckbox.checked = false;
    }
    if (autosaveLabel) {
      // Keep label visible and remove any animation classes
      autosaveLabel.classList.remove('hidden', 'fade-out');
    }

    // Update breadcrumb to show filename
    updateBreadcrumb();

    // Hide UI elements that don't make sense in GitHub reader mode
    const richToggleBtn = document.getElementById('rich-toggle-btn');
    if (richToggleBtn) {
      richToggleBtn.style.display = 'none';
    }

    // Hide file picker button in GitHub mode (no workspace to browse)
    const filePickerBtn = document.getElementById('file-picker-btn');
    if (filePickerBtn) {
      filePickerBtn.style.display = 'none';
    }

    console.log(`Loaded GitHub file: ${repoInfo.owner}/${repoInfo.repo}/${repoInfo.path}`);

    // Update new button state to keep it enabled in GitHub mode
    updateNewButtonState();

    // Update logo state to hide footer in GitHub mode
    updateLogoState();

    // Remove blur from editor
    if (editorContainer) {
      editorContainer.style.filter = '';
      editorContainer.style.pointerEvents = '';
    }

    // Show toast notification
    showFileReloadNotification('Viewing in read-only mode');

    return true;
  } catch (error) {
    console.error('Failed to load GitHub file:', error);
    alert(`Failed to load file from GitHub: ${error.message}`);

    // Remove loading overlay on error
    const overlay = document.getElementById('github-loading-overlay');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }

    return false;
  }
}

// Register service worker for offline support (disabled in development)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      console.log('Service Worker registered with scope:', registration.scope);
    })
    .catch((error) => {
      console.log('Service Worker registration failed:', error);
    });
}

// Initialize app
(async () => {
  // Log version at startup
  // eslint-disable-next-line no-undef
  const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown';
  console.log(`hotnote v${currentVersion}`);

  // Initialize editor on load
  await initEditor();
  updateBreadcrumb();
  updateNavigationButtons();
  updateNewButtonState();

  // Initialize comment system
  initCommentSystem();

  // Initialize file picker resize
  initFilePickerResize();

  // Setup file picker click-away handler
  setupFilePickerClickAway();

  // Start autosave (enabled by default)
  if (appState.autosaveEnabled) {
    autosaveManager.start();
    // Animate the autosave label to hide after initial load
    animateAutosaveLabel(true);
  }

  // Set initial history state
  if (!window.history.state || !window.history.state.appHistory) {
    window.history.replaceState(
      {
        historyIndex: appState.historyIndex,
        appHistory: true,
      },
      'hotnote',
      window.location.href
    );
  }

  // Expose URLParamManager for e2e tests
  window.URLParamManager = URLParamManager;

  // Check URL params first, then fallback to saved folder or welcome prompt
  setTimeout(async () => {
    // Check for GitHub reader mode first
    const gitreaderUrl = URLParamManager.getGitReader();
    if (gitreaderUrl) {
      const success = await initGitHubReader(gitreaderUrl);
      if (success) {
        return; // GitHub file loaded successfully
      }
      // If loading failed, continue with normal flow
      URLParamManager.clearGitReader();
    }

    // Validate URL parameters
    const urlParams = URLParamManager.validate();

    // Check for invalid state (file without workdir)
    if (URLParamManager.isInvalidState()) {
      // Clear invalid params
      URLParamManager.clear();
    }

    // If valid workdir param exists, show workdir prompt
    if (urlParams.workdir) {
      showWorkdirPrompt(urlParams.workdir);
    } else {
      // No URL params - check for saved folder or show welcome
      const lastFolderName = localStorage.getItem('lastFolderName');
      if (lastFolderName) {
        showResumePrompt(lastFolderName);
      } else {
        showWelcomePrompt();
      }
    }
  }, 500);

  // Initialize version manager (handles update checks and banners)
  try {
    initVersionManager();
  } catch (err) {
    console.error('Error setting up version management:', err);
  }

  // Cleanup trash on window close
  window.addEventListener('beforeunload', async () => {
    if (appState.currentDirHandle) {
      await trashManager.cleanup(appState.currentDirHandle);
    }
  });

  // Add window focus listener for multi-instance detection
  window.addEventListener('focus', async () => {
    // Check for version updates when tab regains focus
    performVersionCheck();

    if (!appState.currentDirHandle || !appState.currentFileHandle) return;

    try {
      // Reload session file to check for external changes
      const sessionData = await loadSessionFile(appState.currentDirHandle);
      if (sessionData && sessionData.session && sessionData.session.lastOpenFile) {
        // Check if another instance changed the session file
        // We could add more sophisticated conflict detection here
        // For now, we just silently sync the state
        console.log('Session file checked on window focus');
      }
    } catch (err) {
      console.error('Error checking session on focus:', err);
    }
  });
})();
