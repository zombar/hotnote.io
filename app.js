import { EditorManager } from './src/editors/editor-manager.js';
import { FileSystemAdapter, openFileByPath } from './src/fs/filesystem-adapter.js';
import { createTrashManager } from './src/fs/trash-manager.js';
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
import { updateBreadcrumb } from './src/ui/breadcrumb.js';
import {
  addToHistory,
  goBack,
  goForward,
  goFolderUp,
  updateNavigationButtons,
} from './src/navigation/history-manager.js';
import {
  showFilePicker,
  hideFilePicker,
  initFilePickerResize,
  quickFileCreate,
  openFileFromPicker,
  newFile,
  setupFilePickerClickAway,
} from './src/ui/file-picker.js';
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
} from './src/storage/session-manager.js';
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
  };

  if (isMarkdownFile(filename)) {
    // Use EditorManager for markdown files
    // Mode will be determined by session restore or default to 'wysiwyg'
    const initialMode = appState.isRestoringSession
      ? localStorage.getItem(`mode_${filename}`) || 'wysiwyg'
      : 'wysiwyg';
    console.log('[Editor] Initializing EditorManager for markdown. Initial mode:', initialMode);

    appState.editorManager = new EditorManager(
      editorContainer,
      initialMode,
      initialContent,
      handleContentChange
    );
    await appState.editorManager.ready();
    console.log('[Editor] EditorManager initialized');

    // Initialize TOC and suggested links for markdown files
    updateTOC();
    await updateSuggestedLinks();
  } else {
    // Use CodeMirror directly for non-markdown files
    console.log('[Editor] Initializing CodeMirror for non-markdown file');
    await initCodeMirrorEditor(initialContent, filename, handleContentChange);
    updateTOC(); // Hide TOC for non-markdown files
  }

  appState.isDirty = false;
  updateRichToggleButton();

  // Register editors with focus manager
  appState.focusManager.setEditors(appState.editorManager, appState.editorView);
};

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
      placeholder(
        'Open a file or create a new one to start editing (Cmd/Ctrl+Shift+O or Cmd/Ctrl+N)'
      )
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

  // Add scroll listener to save editor state
  if (appState.editorView && appState.editorView.scrollDOM) {
    appState.editorView.scrollDOM.addEventListener('scroll', debouncedSaveEditorState);
  }
};

// Timer for auto-collapsing logo after expansion
let logoCollapseTimer = null;
let initialCollapseScheduled = false;

// Update logo state based on whether a folder or file is open
const updateLogoState = () => {
  const logo = document.querySelector('.app-logo');
  if (logo && (appState.currentFileHandle || appState.currentDirHandle)) {
    // Check if this is the first time (initial load)
    const isFirstLoad = !logo.dataset.hoverSetup;

    if (isFirstLoad && !initialCollapseScheduled) {
      // Mark that we've scheduled the initial collapse to prevent duplicates
      initialCollapseScheduled = true;

      // Set initial expanded state immediately (without animation)
      logo.classList.add('expanded');

      // Wait 2.5 seconds before starting the initial collapse animation
      // This avoids synchronous loading spike issues and gives smoother animation
      setTimeout(() => {
        // Only animate if still in expanded state (user hasn't interacted)
        if (logo.classList.contains('expanded')) {
          // Switch from expanded to compact with animation
          logo.classList.remove('expanded');
          logo.classList.add('compact', 'animating');

          // Remove animating class after animation completes (1.2s total animation time)
          setTimeout(() => {
            logo.classList.remove('animating');
          }, 1200);
        }
      }, 2500);
    } else if (!isFirstLoad) {
      // Already initialized, just ensure compact state without animation
      if (!logo.classList.contains('expanded')) {
        logo.classList.add('compact');
        logo.classList.remove('animating');
      }
    }

    // Setup hover interaction if not already done
    if (!logo.dataset.hoverSetup) {
      setupLogoHoverInteraction(logo);
      logo.dataset.hoverSetup = 'true';
    }
  }
};

// Setup hover interaction for logo expansion/collapse
const setupLogoHoverInteraction = (logo) => {
  const navbar = document.querySelector('header[data-testid="navbar"]');

  if (!navbar) return;

  // Expand when hovering over logo
  logo.addEventListener('mouseenter', () => {
    // Only expand if currently in compact state (not expanded or animating)
    if (!logo.classList.contains('compact')) {
      return;
    }

    // Clear any pending collapse timer
    if (logoCollapseTimer) {
      clearTimeout(logoCollapseTimer);
      logoCollapseTimer = null;
    }

    // Switch from compact to expanded with animation
    logo.classList.remove('compact');
    logo.classList.add('expanded', 'animating');

    // Remove animating class after expand animation completes (0.6s total)
    setTimeout(() => {
      logo.classList.remove('animating');
    }, 600);
  });

  // Start collapse timer when leaving navbar
  navbar.addEventListener('mouseleave', () => {
    // Only start timer if logo is expanded
    if (logo.classList.contains('expanded')) {
      // Clear any existing timer
      if (logoCollapseTimer) {
        clearTimeout(logoCollapseTimer);
        logoCollapseTimer = null;
      }

      // Set timer to collapse after 5 seconds
      logoCollapseTimer = setTimeout(() => {
        // Switch from expanded to compact with animation
        logo.classList.remove('expanded');
        logo.classList.add('compact', 'animating');

        // Remove animating class after collapse animation completes (1.2s total)
        setTimeout(() => {
          logo.classList.remove('animating');
        }, 1200);

        logoCollapseTimer = null;
      }, 5000);
    }
  });

  // Clear collapse timer when entering navbar
  navbar.addEventListener('mouseenter', () => {
    if (logoCollapseTimer) {
      clearTimeout(logoCollapseTimer);
      logoCollapseTimer = null;
    }
  });
};

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
    console.log('[RichMode] Not a markdown file or no editor manager, skipping toggle');
    return;
  }

  console.log('[RichMode] Toggling mode via EditorManager');
  await appState.editorManager.toggleMode();

  // Save mode preference to localStorage
  const newMode = appState.editorManager.getMode();
  localStorage.setItem(`mode_${appState.currentFilename}`, newMode);

  updateRichToggleButton();
  updateTOC(); // Update TOC after mode change
  await updateSuggestedLinks(); // Update suggested links after mode change
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

  console.log('[TOC] Attaching event listeners to', tocItems.length, 'items');

  // Click on heading text to scroll
  tocItems.forEach((item) => {
    const textSpan = item.querySelector('.toc-text');
    if (textSpan) {
      // Prevent mousedown from stealing focus from the editor
      textSpan.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Critical: prevents focus from leaving the editor
        console.log('[TOC] Mousedown prevented - maintaining editor focus');
      });

      textSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const pos = parseInt(item.dataset.pos, 10);
        console.log('[TOC] Clicked heading at position:', pos);

        const editor = appState.editorManager?.getActiveEditor();
        console.log('[TOC] Editor manager:', appState.editorManager);
        console.log('[TOC] Active editor:', editor);

        if (editor && editor.scrollToPosition) {
          // Block session saves during TOC navigation to prevent scroll reset
          if (window.blockSessionSave) {
            clearTimeout(window.blockSessionSave);
          }
          window.blockSessionSave = true;
          console.log('[TOC] Session saves blocked during navigation');

          // Scroll to the position (focus should be maintained by mousedown prevention)
          console.log('[TOC] Calling scrollToPosition with:', pos);
          editor.scrollToPosition(pos);

          // Re-enable session saves after scroll completes (200ms should be enough)
          setTimeout(() => {
            window.blockSessionSave = false;
            console.log('[TOC] Session saves re-enabled');
          }, 200);

          console.log('[TOC] Scroll completed, focus maintained by mousedown handler');
        } else {
          console.error('[TOC] Editor or scrollToPosition not available');
        }
      });
    }
  });

  // Click on chevron to toggle collapse
  chevrons.forEach((chevron) => {
    // Prevent mousedown from stealing focus from the editor
    chevron.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Critical: prevents focus from leaving the editor
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

  console.log('[TOC] Setting up focus prevention on sidebar:', markdownSidebar);

  // Apply to all TOC-related elements to be thorough
  [markdownSidebar, tocContainer, tocContent].forEach((element) => {
    if (element) {
      // Remove any existing listener first to avoid duplicates
      element.removeEventListener('mousedown', preventTOCMousedown, true);
      // Add capture-phase listener
      element.addEventListener('mousedown', preventTOCMousedown, true);
      console.log('[TOC] Added mousedown prevention to:', element.id);
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
        console.log(
          '[Focus] Document-level mousedown in',
          inTOC ? 'TOC' : 'Editor',
          'area, target:',
          e.target
        );

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
          console.log('[Focus] Prevented background click from stealing focus');
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
              console.log('[Focus] Editor re-focused from document-level handler');
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
  e.preventDefault();
  e.stopPropagation();
  console.log(
    '[TOC] Mousedown prevented on:',
    e.target,
    'target ID:',
    e.target.id,
    'target class:',
    e.target.className,
    'maintaining editor focus'
  );

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

  newBtn.disabled = !hasWorkspace;

  // Update tooltip to provide helpful feedback
  if (hasWorkspace) {
    newBtn.title = 'New file (Ctrl/Cmd+N)';
  } else {
    newBtn.title = 'Open a folder first to create new files';
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

// Open folder
const openFolder = async () => {
  if (!isFileSystemAccessSupported()) {
    alert(
      'File System Access API is not supported in this browser. Please use Chrome, Edge, or a recent version of Safari.'
    );
    return;
  }

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

    // Track if file was successfully restored
    let fileRestored = false;

    // Try to restore last open file
    if (sessionData.session && sessionData.session.lastOpenFile) {
      const lastFile = sessionData.session.lastOpenFile;
      console.log('[Session] Attempting to restore last file:', lastFile.path);
      console.log('[Session] Session data for file:', JSON.stringify(lastFile, null, 2));

      // Set flag to indicate we're restoring from session
      appState.isRestoringSession = true;

      // Save editor mode preference to localStorage so initEditor can use it
      if (lastFile.editorMode !== undefined) {
        const filename = lastFile.path.split('/').pop();
        localStorage.setItem(`mode_${filename}`, lastFile.editorMode);
        console.log('[Session] Saved mode preference for restoration:', lastFile.editorMode);
      }

      const opened = await openFileByPath(appState.rootDirHandle, lastFile.path);
      console.log('File opened successfully:', opened);

      // Clear the flag
      appState.isRestoringSession = false;

      if (opened) {
        fileRestored = true;

        // Wait for editor to be ready, then restore cursor and scroll
        setTimeout(async () => {
          if (appState.editorManager) {
            // Markdown file - using EditorManager
            console.log('[Session] Restoring EditorManager state');
            await appState.editorManager.ready();

            // Restore cursor and scroll position
            if (lastFile.cursorLine !== undefined && lastFile.cursorColumn !== undefined) {
              appState.editorManager.setCursor(lastFile.cursorLine, lastFile.cursorColumn);
            }
            if (lastFile.scrollTop !== undefined) {
              appState.editorManager.setScrollPosition(lastFile.scrollTop);
            }
            appState.editorManager.focus();

            console.log('[Session] EditorManager state restored:', {
              line: lastFile.cursorLine,
              column: lastFile.cursorColumn,
              scroll: lastFile.scrollTop,
            });
          } else if (appState.editorView) {
            // Non-markdown file - using CodeMirror
            console.log('[Session] Restoring CodeMirror state');

            // Restore cursor position
            if (lastFile.cursorLine !== undefined && lastFile.cursorColumn !== undefined) {
              const doc = appState.editorView.state.doc;
              const line = doc.line(lastFile.cursorLine + 1); // Convert to 1-based
              const pos = line.from + Math.min(lastFile.cursorColumn, line.length);
              appState.editorView.dispatch({
                selection: { anchor: pos, head: pos },
              });
            }

            // Restore scroll position
            if (lastFile.scrollTop !== undefined) {
              appState.editorView.scrollDOM.scrollTop = lastFile.scrollTop;
            }
            if (lastFile.scrollLeft !== undefined) {
              appState.editorView.scrollDOM.scrollLeft = lastFile.scrollLeft;
            }
            appState.editorView.focus();

            console.log('[Session] CodeMirror state restored');
          }

          // Update UI
          updateRichToggleButton();

          // Mark restoration time to prevent premature saves
          appState.lastRestorationTime = Date.now();
          console.log('[Session] Restoration complete, blocking saves for 1 second');
        }, 100);
      }
    }

    addToHistory();

    // Only show file picker if file was not restored
    if (!fileRestored) {
      await showFilePicker(dirHandle);
    }

    updateBreadcrumb();
    updateLogoState();
    updateNewButtonState();
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Error opening folder:', err);
      alert('Error opening folder: ' + err.message);
    }
  }
};

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

const showFileReloadNotification = () => {
  // Create toast notification
  const toast = document.createElement('div');
  toast.className = 'file-reload-toast';
  toast.textContent = 'Reloaded from disk';
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

// Debounced version (save every 2 seconds)
const debouncedSaveEditorState = createDebouncedSaveEditorState(getRelativeFilePath);

// Debounced TOC update (update every 500ms after typing stops)
const debouncedUpdateTOC = debounce(updateTOC, 500);

// Fuzzy match helper - handles case-insensitive, substring, and space-as-wildcard matching

// Helper function to get Material Symbol icon name based on file type

// Dark mode toggle
const toggleDarkMode = async () => {
  const html = document.documentElement;
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  const icon = darkModeToggle.querySelector('.material-symbols-outlined');
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  const isDark = html.getAttribute('data-theme') === 'dark';

  if (isDark) {
    html.removeAttribute('data-theme');
    icon.textContent = 'dark_mode';
    darkModeToggle.title = 'Switch to dark mode';
    themeColorMeta.setAttribute('content', '#e91e8c');
    localStorage.setItem('theme', 'light');
  } else {
    html.setAttribute('data-theme', 'dark');
    icon.textContent = 'light_mode';
    darkModeToggle.title = 'Switch to light mode';
    themeColorMeta.setAttribute('content', '#ff2d96');
    localStorage.setItem('theme', 'dark');
  }

  // Reinitialize editor with new theme colors
  if (appState.editorView || appState.editorManager) {
    const currentContent = getEditorContent();

    // Save editor state before destroying
    let scrollTop = 0;
    let scrollLeft = 0;
    let currentMode = null;

    if (appState.editorView) {
      const scroller = appState.editorView.scrollDOM;
      scrollTop = scroller.scrollTop;
      scrollLeft = scroller.scrollLeft;
    } else if (appState.editorManager) {
      scrollTop = appState.editorManager.getScrollPosition();
      currentMode = appState.editorManager.getMode(); // Preserve current mode for markdown
    }

    // Temporarily set appState.isRestoringSession to preserve the mode
    const wasRestoringSession = appState.isRestoringSession;
    if (currentMode) {
      appState.isRestoringSession = true;
      localStorage.setItem(`mode_${appState.currentFilename}`, currentMode);
    }

    await initEditor(currentContent, appState.currentFilename);

    // Restore previous session state
    appState.isRestoringSession = wasRestoringSession;

    // Restore scroll position
    setTimeout(() => {
      if (appState.editorView) {
        appState.editorView.scrollDOM.scrollTop = scrollTop;
        appState.editorView.scrollDOM.scrollLeft = scrollLeft;
      } else if (appState.editorManager) {
        appState.editorManager.setScrollPosition(scrollTop);
      }
      // Restore focus after editor reinit
      appState.focusManager.focusEditor({ reason: 'theme-toggle' });
    }, 0);
  }
};

// Initialize dark mode from localStorage or system preferences
const initDarkMode = () => {
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldUseDark = savedTheme === 'dark' || (savedTheme === null && prefersDark);
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  const icon = darkModeToggle.querySelector('.material-symbols-outlined');
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');

  if (shouldUseDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    icon.textContent = 'light_mode';
    darkModeToggle.title = 'Switch to light mode';
    themeColorMeta.setAttribute('content', '#ff2d96');
  }

  // Remove preload class to enable transitions after initial theme is set
  setTimeout(() => {
    document.body.classList.remove('preload');
  }, 100);
};

// Listen for system theme changes and apply them if user hasn't set a preference
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async (e) => {
  const savedTheme = localStorage.getItem('theme');
  // Only apply system theme change if user hasn't explicitly set a preference
  if (savedTheme === null) {
    const isDark = e.matches;
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const icon = darkModeToggle.querySelector('.material-symbols-outlined');
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');

    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      icon.textContent = 'light_mode';
      darkModeToggle.title = 'Switch to light mode';
      themeColorMeta.setAttribute('content', '#ff2d96');
    } else {
      document.documentElement.removeAttribute('data-theme');
      icon.textContent = 'dark_mode';
      darkModeToggle.title = 'Switch to dark mode';
      themeColorMeta.setAttribute('content', '#e91e8c');
    }

    // Re-initialize editor with new theme colors
    if (appState.editorView || appState.editorManager) {
      const currentContent = getEditorContent();

      // Save editor state before destroying
      let scrollTop = 0;
      let scrollLeft = 0;
      let currentMode = null;

      if (appState.editorView) {
        const scroller = appState.editorView.scrollDOM;
        scrollTop = scroller.scrollTop;
        scrollLeft = scroller.scrollLeft;
      } else if (appState.editorManager) {
        scrollTop = appState.editorManager.getScrollPosition();
        currentMode = appState.editorManager.getMode();
      }

      // Temporarily set appState.isRestoringSession to preserve the mode
      const wasRestoringSession = appState.isRestoringSession;
      if (currentMode) {
        appState.isRestoringSession = true;
        localStorage.setItem(`mode_${appState.currentFilename}`, currentMode);
      }

      await initEditor(currentContent, appState.currentFilename);

      // Restore previous session state
      appState.isRestoringSession = wasRestoringSession;

      // Restore scroll position
      setTimeout(() => {
        if (appState.editorView) {
          appState.editorView.scrollDOM.scrollTop = scrollTop;
          appState.editorView.scrollDOM.scrollLeft = scrollLeft;
        } else if (appState.editorManager) {
          appState.editorManager.setScrollPosition(scrollTop);
        }
      }, 0);
    }
  }
});

// Event listeners
document.getElementById('new-btn').addEventListener('click', () => {
  appState.focusManager.saveFocusState();
  newFile();
});
document.getElementById('back-btn').addEventListener('click', () => {
  // Save current editor state to history before navigating
  if (appState.currentFileHandle && appState.navigationHistory[appState.historyIndex]) {
    const editorState = appState.focusManager._captureEditorState();
    if (editorState) {
      appState.navigationHistory[appState.historyIndex].editorState = editorState;
    }
  }
  goBack();
});
document.getElementById('forward-btn').addEventListener('click', () => {
  // Save current editor state to history before navigating
  if (appState.currentFileHandle && appState.navigationHistory[appState.historyIndex]) {
    const editorState = appState.focusManager._captureEditorState();
    if (editorState) {
      appState.navigationHistory[appState.historyIndex].editorState = editorState;
    }
  }
  goForward();
});
document.getElementById('folder-up-btn').addEventListener('click', () => {
  appState.focusManager.saveFocusState();
  goFolderUp();
});
document.getElementById('autosave-checkbox').addEventListener('change', (e) => {
  autosaveManager.toggle(e.target.checked);
  animateAutosaveLabel(e.target.checked);
});
document.getElementById('rich-toggle-btn').addEventListener('click', () => {
  console.log('[RichMode] Rich toggle button clicked');
  appState.focusManager.saveFocusState();
  toggleRichMode();
});
document.getElementById('dark-mode-toggle').addEventListener('click', () => {
  appState.focusManager.saveFocusState();
  toggleDarkMode();
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

  const targetIndex = event.state.appState.historyIndex;

  // Set flag to prevent addToHistory from creating duplicate entries
  appState.isPopStateNavigation = true;

  try {
    // Navigate to the target index
    if (targetIndex < appState.historyIndex) {
      // Going back
      while (appState.historyIndex > targetIndex && appState.historyIndex > 0) {
        await goBack();
      }
    } else if (targetIndex > appState.historyIndex) {
      // Going forward
      while (
        appState.historyIndex < targetIndex &&
        appState.historyIndex < appState.navigationHistory.length - 1
      ) {
        await goForward();
      }
    }
  } finally {
    // Always reset the flag
    appState.isPopStateNavigation = false;
  }
});

// Global keyboard listener for quick file creation/search
document.addEventListener('keydown', async (e) => {
  // Trigger on alphanumeric keys, forward slash, or period
  if (!/^[a-zA-Z0-9\/\.]$/.test(e.key)) {
    return;
  }

  // Don't trigger if user is typing in an input field or the editor
  const activeElement = document.activeElement;
  if (
    activeElement &&
    (activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.classList.contains('cm-content') ||
      activeElement.classList.contains('ProseMirror'))
  ) {
    return;
  }

  // Don't trigger if there's no directory context
  if (!appState.currentDirHandle) {
    return;
  }

  // Don't trigger if autocomplete is already showing
  if (document.querySelector('.breadcrumb-input')) {
    return;
  }

  // Trigger quick file creation/search with the typed character
  e.preventDefault();
  await quickFileCreate(e.key);
});

// Global Enter key listener to focus editor
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') {
    return;
  }

  // Don't trigger if navbar input is showing
  if (document.querySelector('.breadcrumb-input')) {
    return;
  }

  // Don't trigger if user is typing in an input field or textarea
  const activeElement = document.activeElement;
  if (
    activeElement &&
    (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')
  ) {
    return;
  }

  // Check if editor already has focus
  if (appState.focusManager.hasEditorFocus()) {
    return;
  }

  // Focus the appropriate editor
  e.preventDefault();
  appState.focusManager.focusEditor({ reason: 'enter-key' });
});

// Global Escape key listener to blur editor and show search
document.addEventListener('keydown', async (e) => {
  if (e.key !== 'Escape') {
    return;
  }

  // Don't trigger if navbar input is showing
  if (document.querySelector('.breadcrumb-input')) {
    return;
  }

  // Check if editor has focus
  if (appState.focusManager.hasEditorFocus()) {
    // Blur the active element (editor) and show search box
    e.preventDefault();
    document.activeElement.blur();

    // Show search box if we have a directory context
    if (appState.currentDirHandle) {
      await quickFileCreate('');
      // Select all text in the input
      const input = document.querySelector('.breadcrumb-input');
      if (input) {
        input.select();
      }
    }
  }
});

// Visual blur effect management - toggle blur class on editor based on focus
function updateEditorBlurState() {
  const editorElement = document.getElementById('editor');
  if (!editorElement) return;

  const hasEditorFocus = appState.focusManager.hasEditorFocus();
  console.log(
    '[Focus] updateEditorBlurState - hasEditorFocus:',
    hasEditorFocus,
    'activeElement:',
    document.activeElement
  );

  if (hasEditorFocus) {
    editorElement.classList.remove('blurred');
  } else {
    // Only add blur if focus went to something meaningful (not null/body)
    const activeElement = document.activeElement;
    const isFocusOnNothing =
      !activeElement || activeElement === document.body || activeElement.tagName === 'BODY';

    if (isFocusOnNothing) {
      // Focus went nowhere - don't blur, but also DON'T restore focus
      // Restoring focus can trigger scroll resets during TOC navigation
      console.log('[Focus] Focus went nowhere, maintaining current state without blur');
      // Note: NOT calling editor.focus() here to avoid scroll interference
    } else {
      // Focus went to a real element (like search box, button, etc) - blur is OK
      editorElement.classList.add('blurred');
    }
  }
}

// Monitor focus changes to update blur state
document.addEventListener('focusin', (e) => {
  console.log('[Focus] focusin event, target:', e.target);
  updateEditorBlurState();
});

document.addEventListener('focusout', (e) => {
  console.log('[Focus] focusout event, target:', e.target, 'relatedTarget:', e.relatedTarget);
  // Use setTimeout to allow focus to shift to new element
  setTimeout(() => {
    updateEditorBlurState();
  }, 10);
});

// Initialize dark mode on load
initDarkMode();

// Initialize blur state
updateEditorBlurState();

// Register service worker for PWA (disabled in development)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.log('Service worker registration failed:', err);
  });
}

// Show welcome prompt on first load
// Show resume prompt with last folder name
const showResumePrompt = (folderName) => {
  const picker = document.getElementById('file-picker');
  picker.classList.remove('hidden');

  picker.innerHTML = `
        <div class="welcome-content">
            <p class="welcome-text">Continue where you left off?</p>
            <div class="welcome-actions">
                <button id="resume-folder-btn" class="welcome-btn">
                    <span class="material-symbols-outlined">folder_open</span>
                    Resume editing ${folderName}
                </button>
                <button id="new-folder-btn" class="welcome-btn">
                    <span class="material-symbols-outlined">folder</span>
                    Open Different Folder
                </button>
            </div>
        </div>
    `;

  document.getElementById('resume-folder-btn').addEventListener('click', () => {
    appState.focusManager.saveFocusState();
    hideFilePicker();
    openFolder();
  });

  document.getElementById('new-folder-btn').addEventListener('click', () => {
    // Clear saved folder name and show welcome prompt
    appState.focusManager.saveFocusState();
    localStorage.removeItem('lastFolderName');
    hideFilePicker();
    openFolder();
  });
};

const showWelcomePrompt = () => {
  const picker = document.getElementById('file-picker');
  picker.classList.remove('hidden');

  picker.innerHTML = `
        <div class="welcome-content">
            <p class="welcome-text">Welcome to hotnote</p>
            <p class="welcome-text">Open a folder to start browsing and editing files.</p>
            <div class="welcome-actions">
                <button id="welcome-folder-btn" class="welcome-btn">
                    <span class="material-symbols-outlined">folder_open</span>
                    Open Folder
                </button>
            </div>
        </div>
    `;

  document.getElementById('welcome-folder-btn').addEventListener('click', () => {
    appState.focusManager.saveFocusState();
    hideFilePicker();
    openFolder();
  });
};

// Version checking for update notifications
let versionBannerDismissed = false;
let _versionCheckInterval = null;

const getWelcomeMessage = () => {
  const messages = [
    'Welcome to hotnote! We promise not to auto-save your typos... oh wait, we totally will.',
    'Welcome! Now you can finally edit files without opening a bloated IDE. Your RAM will thank you.',
    "Welcome aboard! We're like Notepad, but with delusions of grandeur.",
    'Welcome! Warning: This editor may cause severe productivity. Side effects include getting things done.',
    'Welcome to hotnote! Where files are edited and your tab hoarding addiction is enabled.',
    "Welcome! Built by developers who couldn't find the perfect editor, so we made another one.",
    "Welcome to the club! You're now part of an elite group of people who know this exists.",
    'Welcome! This editor was coded with coffee, debugged with more coffee, and fueled entirely by caffeine.',
  ];
  return messages[Math.floor(Math.random() * messages.length)];
};

const checkForNewVersion = async () => {
  // Skip if banner is currently dismissed
  if (versionBannerDismissed) return false;

  try {
    const response = await fetch('/version.json?_=' + Date.now(), {
      cache: 'no-cache',
    });
    if (!response.ok) return false;

    const data = await response.json();
    // eslint-disable-next-line no-undef
    const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
    const deployedVersion = data.version;

    // Check if deployed version is different from current
    return currentVersion !== deployedVersion;
  } catch (err) {
    console.log('Version check failed:', err);
    return false;
  }
};

const createVersionBanner = (type = 'update', customMessage = null) => {
  try {
    // Check if banner already exists
    if (document.getElementById('version-banner')) return;

    const header = document.querySelector('header');
    if (!header) {
      console.warn('Header element not found, skipping version banner creation');
      return;
    }

    const banner = document.createElement('div');
    banner.id = 'version-banner';
    banner.className = 'version-banner hidden';

    let message, icon, showReloadBtn;
    if (type === 'welcome') {
      message = customMessage || getWelcomeMessage();
      icon = '👋';
      showReloadBtn = false;
    } else {
      message = 'New version available! Refresh to update.';
      icon = 'ℹ';
      showReloadBtn = true;
    }

    banner.innerHTML = `
      <div class="version-banner-content">
        <span class="version-banner-message">
          <span class="version-banner-icon">${icon}</span>
          ${message}
        </span>
        <div class="version-banner-actions">
          ${
            showReloadBtn
              ? `<button id="version-reload-btn" class="version-banner-btn version-banner-btn-primary">
            Reload
          </button>`
              : ''
          }
          <button id="version-dismiss-btn" class="version-banner-btn version-banner-btn-secondary">
            ×
          </button>
        </div>
      </div>
    `;

    header.appendChild(banner);

    // Add event listeners
    if (showReloadBtn) {
      const reloadBtn = document.getElementById('version-reload-btn');
      if (reloadBtn) {
        reloadBtn.addEventListener('click', () => {
          window.location.reload();
        });
      }
    }

    const dismissBtn = document.getElementById('version-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        if (type === 'welcome') {
          localStorage.setItem('hasSeenWelcome', 'true');
        }
        hideVersionBanner();
      });
    }
  } catch (err) {
    console.error('Error creating version banner:', err);
  }
};

const showVersionBanner = () => {
  const banner = document.getElementById('version-banner');
  if (banner) {
    banner.classList.remove('hidden');
    versionBannerDismissed = false;
  }
};

const hideVersionBanner = () => {
  const banner = document.getElementById('version-banner');
  if (banner) {
    banner.classList.add('hidden');
    versionBannerDismissed = true;
  }
};

const updateBannerContent = (type = 'update', customMessage = null) => {
  try {
    const banner = document.getElementById('version-banner');
    if (!banner) return;

    let message, icon, showReloadBtn;
    if (type === 'welcome') {
      message = customMessage || getWelcomeMessage();
      icon = '👋';
      showReloadBtn = false;
    } else {
      message = 'New version available! Refresh to update.';
      icon = 'ℹ';
      showReloadBtn = true;
    }

    const content = banner.querySelector('.version-banner-content');
    if (!content) return;

    content.innerHTML = `
      <span class="version-banner-message">
        <span class="version-banner-icon">${icon}</span>
        ${message}
      </span>
      <div class="version-banner-actions">
        ${
          showReloadBtn
            ? `<button id="version-reload-btn" class="version-banner-btn version-banner-btn-primary">
          Reload
        </button>`
            : ''
        }
        <button id="version-dismiss-btn" class="version-banner-btn version-banner-btn-secondary">
          ×
        </button>
      </div>
    `;

    // Re-attach event listeners
    if (showReloadBtn) {
      const reloadBtn = document.getElementById('version-reload-btn');
      if (reloadBtn) {
        reloadBtn.addEventListener('click', () => {
          window.location.reload();
        });
      }
    }

    const dismissBtn = document.getElementById('version-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        if (type === 'welcome') {
          localStorage.setItem('hasSeenWelcome', 'true');
        }
        hideVersionBanner();
      });
    }
  } catch (err) {
    console.error('Error updating banner content:', err);
  }
};

const _checkAndShowWelcome = () => {
  const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
  if (!hasSeenWelcome) {
    updateBannerContent('welcome');
    showVersionBanner();
    return true;
  }
  return false;
};

const performVersionCheck = async () => {
  try {
    const hasNewVersion = await checkForNewVersion();
    if (hasNewVersion) {
      updateBannerContent('update');
      showVersionBanner();
    }
  } catch (err) {
    console.error('Error performing version check:', err);
  }
};

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

  // Check for saved folder and show appropriate prompt
  setTimeout(() => {
    const lastFolderName = localStorage.getItem('lastFolderName');
    if (lastFolderName) {
      showResumePrompt(lastFolderName);
    } else {
      showWelcomePrompt();
    }
  }, 500);

  // Create version banner (always exists, but hidden by default)
  try {
    createVersionBanner('update'); // Create for version updates only

    // Check for new version on initialization
    performVersionCheck();

    // Set up periodic version checks (every 30 minutes)
    _versionCheckInterval = setInterval(
      () => {
        performVersionCheck();
      },
      30 * 60 * 1000
    );
  } catch (err) {
    console.error('Error setting up version banner:', err);
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
