import { EditorManager } from './src/editors/editor-manager.js';
import { FocusManager } from './src/focus-manager.js';
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
import {
  syntaxHighlighting,
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  foldGutter,
  foldKeymap,
} from '@codemirror/language';
import { tags } from '@lezer/highlight';
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
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { go } from '@codemirror/lang-go';
import { rust } from '@codemirror/lang-rust';
import { php } from '@codemirror/lang-php';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { shell as shellMode } from '@codemirror/legacy-modes/mode/shell';
import { ruby as rubyMode } from '@codemirror/legacy-modes/mode/ruby';
import { groovy as groovyMode } from '@codemirror/legacy-modes/mode/groovy';
import { nginx as nginxMode } from '@codemirror/legacy-modes/mode/nginx';
import { python as pythonMode } from '@codemirror/legacy-modes/mode/python';

// File System Adapter - Browser File System Access API
const FileSystemAdapter = {
  // Check if file system access is supported
  isSupported() {
    return 'showOpenFilePicker' in window && 'showDirectoryPicker' in window;
  },

  // Open directory picker
  async openDirectory() {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    return dirHandle;
  },

  // List directory entries
  async listDirectory(dirHandle) {
    const entries = [];
    for await (const entry of dirHandle.values()) {
      entries.push(entry);
    }
    return entries;
  },

  // Read file content
  async readFile(fileHandle) {
    const file = await fileHandle.getFile();
    return await file.text();
  },

  // Write file content
  async writeFile(fileHandle, content) {
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  },

  // Save file picker (for new files)
  async saveFilePicker(suggestedName) {
    return await window.showSaveFilePicker({
      types: [
        {
          description: 'Text Files',
          accept: { 'text/*': ['.txt', '.md', '.js', '.py', '.html', '.css', '.json'] },
        },
      ],
      suggestedName: suggestedName,
    });
  },

  // Get file metadata (name, etc.)
  async getFileMetadata(fileHandle) {
    const file = await fileHandle.getFile();
    return {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
    };
  },

  // Navigate to subdirectory
  async navigateToSubdirectory(parentHandle, name) {
    return await parentHandle.getDirectoryHandle(name);
  },
};

// Session Management (.HN file persistence)
const createSessionFileName = (_dirHandle) => {
  return '.session_properties.HN';
};

const loadSessionFile = async (dirHandle) => {
  try {
    const sessionFileName = createSessionFileName(dirHandle);
    const sessionFileHandle = await dirHandle.getFileHandle(sessionFileName, { create: false });
    const sessionContent = await FileSystemAdapter.readFile(sessionFileHandle);
    return JSON.parse(sessionContent);
  } catch {
    // File doesn't exist or invalid JSON - return null
    return null;
  }
};

const saveSessionFile = async (dirHandle, sessionData) => {
  try {
    const sessionFileName = createSessionFileName(dirHandle);
    const sessionFileHandle = await dirHandle.getFileHandle(sessionFileName, { create: true });
    sessionData.lastModified = Date.now();
    const content = JSON.stringify(sessionData, null, 2);
    await FileSystemAdapter.writeFile(sessionFileHandle, content);
  } catch (err) {
    console.error('Error saving session file:', err);
  }
};

const createEmptySession = (folderName) => {
  return {
    version: '1.0',
    folderName: folderName,
    lastModified: Date.now(),
    session: {
      lastOpenFile: null,
    },
    comments: [],
  };
};

// App state
let currentFileHandle = null;
let currentFilename = 'untitled';
let currentDirHandle = null;
let rootDirHandle = null; // The initially opened directory (for session file)
let currentPath = []; // Array of {name, handle} objects
let editorManager = null; // For markdown files (handles WYSIWYG/source switching)
let editorView = null; // For non-markdown files (direct CodeMirror)
const focusManager = new FocusManager(); // Centralized focus management
let isRestoringSession = false; // Track if we're currently restoring from session
let lastRestorationTime = 0; // Track when we last restored state to prevent premature saves

// Navigation history
let navigationHistory = [];
let historyIndex = -1;
let isPopStateNavigation = false; // Prevent duplicate history entries during browser back/forward

// Autosave
let autosaveEnabled = true;
let autosaveInterval = null;
let isDirty = false;

// Original file content (for detecting undo to original state)
let originalContent = '';

// File polling and synchronization
let lastKnownModified = null; // Timestamp when file was last loaded/saved
let lastModifiedLocal = null; // Timestamp of last local edit
let lastUserActivityTime = Date.now(); // Timestamp of last user interaction
let filePollingInterval = null; // Interval ID for file polling
let isPollingPaused = false; // Flag to pause polling during file picker operations

// Temp storage for unsaved changes
const TEMP_STORAGE_PREFIX = 'hotnote_temp_';

// Get file path key for storage
const getFilePathKey = () => {
  if (!currentFileHandle) return null;
  const pathParts = currentPath.map((p) => p.name);
  pathParts.push(currentFilename);
  return pathParts.join('/');
};

// Get relative file path (excluding root folder name) for session storage
const getRelativeFilePath = () => {
  if (!currentFileHandle) return null;
  // Skip the first element (root folder) since we're already inside it when loading
  const pathParts = currentPath.slice(1).map((p) => p.name);
  pathParts.push(currentFilename);
  return pathParts.join('/');
};

// Save temp changes
const saveTempChanges = () => {
  const key = getFilePathKey();
  if (!key || !isDirty) return;

  const content = getEditorContent();
  localStorage.setItem(TEMP_STORAGE_PREFIX + key, content);
};

// Load temp changes
const loadTempChanges = (key) => {
  return localStorage.getItem(TEMP_STORAGE_PREFIX + key);
};

// Clear temp changes
const clearTempChanges = (key) => {
  localStorage.removeItem(TEMP_STORAGE_PREFIX + key);
};

// Check if file has temp changes
const hasTempChanges = (key) => {
  return localStorage.getItem(TEMP_STORAGE_PREFIX + key) !== null;
};

// Custom syntax highlighting using brand colors (light mode - darker muted)
const brandHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#a65580', fontWeight: '500' }, // darker muted pink
  { tag: tags.operator, color: '#7a65ad' }, // darker muted purple
  { tag: tags.variableName, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.string, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.number, color: '#7a65ad' }, // darker muted purple
  { tag: tags.bool, color: '#7a65ad' }, // darker muted purple
  { tag: tags.comment, color: '#999999', fontStyle: 'italic' }, // gray
  { tag: tags.tagName, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.attributeName, color: '#a65580' }, // darker muted pink
  { tag: tags.propertyName, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.function(tags.variableName), color: '#5a9cb8', fontWeight: '500' }, // darker muted cyan
  { tag: tags.className, color: '#a65580' }, // darker muted pink
  { tag: tags.typeName, color: '#a65580' }, // darker muted pink
  { tag: tags.regexp, color: '#7a65ad' }, // darker muted purple
  { tag: tags.escape, color: '#a65580' }, // darker muted pink
  { tag: tags.meta, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.constant(tags.variableName), color: '#7a65ad' }, // darker muted purple
]);

// Custom syntax highlighting using brand colors (dark mode - lighter muted)
const brandHighlightStyleDark = HighlightStyle.define([
  { tag: tags.keyword, color: '#e8bcd4', fontWeight: '500' }, // lighter muted pink
  { tag: tags.operator, color: '#c8bce8' }, // lighter muted purple
  { tag: tags.variableName, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.string, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.number, color: '#c8bce8' }, // lighter muted purple
  { tag: tags.bool, color: '#c8bce8' }, // lighter muted purple
  { tag: tags.comment, color: '#888888', fontStyle: 'italic' }, // gray
  { tag: tags.tagName, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.attributeName, color: '#e8bcd4' }, // lighter muted pink
  { tag: tags.propertyName, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.function(tags.variableName), color: '#b8e5f2', fontWeight: '500' }, // lighter muted cyan
  { tag: tags.className, color: '#e8bcd4' }, // lighter muted pink
  { tag: tags.typeName, color: '#e8bcd4' }, // lighter muted pink
  { tag: tags.regexp, color: '#c8bce8' }, // lighter muted purple
  { tag: tags.escape, color: '#e8bcd4' }, // lighter muted pink
  { tag: tags.meta, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.constant(tags.variableName), color: '#c8bce8' }, // lighter muted purple
]);

// Language detection based on file extension
const getLanguageExtension = (filename) => {
  // Check for special filenames without extensions
  const basename = filename.split('/').pop().toLowerCase();

  // Bazel files (use Python/Starlark syntax)
  if (
    basename === 'build' ||
    basename === 'build.bazel' ||
    basename === 'workspace' ||
    basename === 'workspace.bazel'
  ) {
    return StreamLanguage.define(pythonMode);
  }

  // Jenkinsfile
  if (basename === 'jenkinsfile') {
    return StreamLanguage.define(groovyMode);
  }

  // Nginx config
  if (basename === 'nginx.conf' || basename.startsWith('nginx.')) {
    return StreamLanguage.define(nginxMode);
  }

  // .gitignore and other ignore files
  if (basename === '.gitignore' || basename.endsWith('ignore')) {
    return StreamLanguage.define(shellMode);
  }

  const ext = filename.split('.').pop().toLowerCase();
  const langMap = {
    js: javascript(),
    jsx: javascript({ jsx: true }),
    ts: javascript({ typescript: true }),
    tsx: javascript({ typescript: true, jsx: true }),
    py: python(),
    go: go(),
    rs: rust(),
    php: php(),
    java: java(),
    groovy: StreamLanguage.define(groovyMode),
    c: cpp(),
    cpp: cpp(),
    cc: cpp(),
    cxx: cpp(),
    h: cpp(),
    hpp: cpp(),
    xml: xml(),
    yaml: yaml(),
    yml: yaml(),
    sh: StreamLanguage.define(shellMode),
    bash: StreamLanguage.define(shellMode),
    rb: StreamLanguage.define(rubyMode),
    html: html(),
    htm: html(),
    css: css(),
    scss: css(),
    json: json(),
    md: markdown(),
    markdown: markdown(),
    bzl: StreamLanguage.define(pythonMode), // Bazel/Starlark files
    conf: StreamLanguage.define(nginxMode), // Nginx config files
    tf: javascript(), // Terraform files (HCL syntax similar to JavaScript)
    tfvars: javascript(), // Terraform variable files
    hcl: javascript(), // HashiCorp Configuration Language
  };
  return langMap[ext] || [];
};

// Helper: Check if file is markdown
const isMarkdownFile = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  return ext === 'md' || ext === 'markdown';
};

// Helper: Get current editor content
const getEditorContent = () => {
  if (editorManager) {
    return editorManager.getContent();
  } else if (editorView) {
    return editorView.state.doc.toString();
  }
  return '';
};

// Initialize editor (EditorManager for markdown, CodeMirror for other files)
const initEditor = async (initialContent = '', filename = 'untitled') => {
  // Store original content for undo detection
  originalContent = initialContent;

  // Clear old editors
  if (editorManager) {
    editorManager.destroy();
    editorManager = null;
  }
  if (editorView) {
    editorView.destroy();
    editorView = null;
  }

  const editorContainer = document.getElementById('editor');
  editorContainer.innerHTML = ''; // Clear container

  // onChange callback for content changes
  const handleContentChange = (content) => {
    // Track user activity for file polling
    updateUserActivity();
    lastModifiedLocal = Date.now();

    if (content === originalContent) {
      if (isDirty) {
        isDirty = false;
        const key = getFilePathKey();
        if (key) {
          clearTempChanges(key);
        }
        updateBreadcrumb();
      }
    } else {
      if (!isDirty) {
        isDirty = true;
        updateBreadcrumb();
      }
    }
    // Save session state on content change
    debouncedSaveEditorState();
  };

  if (isMarkdownFile(filename)) {
    // Use EditorManager for markdown files
    // Mode will be determined by session restore or default to 'wysiwyg'
    const initialMode = isRestoringSession
      ? localStorage.getItem(`mode_${filename}`) || 'wysiwyg'
      : 'wysiwyg';
    console.log('[Editor] Initializing EditorManager for markdown. Initial mode:', initialMode);

    editorManager = new EditorManager(
      editorContainer,
      initialMode,
      initialContent,
      handleContentChange
    );
    await editorManager.ready();
    console.log('[Editor] EditorManager initialized');
  } else {
    // Use CodeMirror directly for non-markdown files
    console.log('[Editor] Initializing CodeMirror for non-markdown file');
    await initCodeMirrorEditor(initialContent, filename, handleContentChange);
  }

  isDirty = false;
  updateRichToggleButton();

  // Register editors with focus manager
  focusManager.setEditors(editorManager, editorView);
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
  const hasFileOpen = currentFileHandle !== null;

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
          if (currentDirHandle) {
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
        updateUserActivity(); // Track cursor/scroll activity
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

  editorView = new EditorView({
    state: startState,
    parent: document.getElementById('editor'),
  });

  // Add scroll listener to save editor state
  if (editorView && editorView.scrollDOM) {
    editorView.scrollDOM.addEventListener('scroll', debouncedSaveEditorState);
  }
};

// Update logo state based on whether a folder or file is open
const updateLogoState = () => {
  const logo = document.querySelector('.app-logo');
  if (logo && (currentFileHandle || currentDirHandle)) {
    logo.classList.add('compact');
  }
};

// Update breadcrumb display
const updateBreadcrumb = () => {
  const breadcrumb = document.getElementById('breadcrumb');
  breadcrumb.innerHTML = '';

  if (currentPath.length === 0) {
    // No folder opened
    const item = document.createElement('span');
    item.className = 'breadcrumb-item';
    item.textContent = currentFilename;
    if (isDirty) {
      item.classList.add('has-changes');
    }
    // Make breadcrumb clickable to open folder
    item.style.cursor = 'pointer';
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      await openFolder();
    });
    breadcrumb.appendChild(item);
  } else {
    // Show path with abbreviation for long paths
    const MAX_VISIBLE_ITEMS = 7; // Maximum items to show before abbreviating
    const ITEMS_TO_SHOW_AT_END = 5; // How many items to show at the end after ellipsis

    if (currentPath.length > MAX_VISIBLE_ITEMS) {
      // Show first item
      const firstItem = document.createElement('span');
      firstItem.className = 'breadcrumb-item';
      firstItem.textContent = currentPath[0].name;
      firstItem.dataset.index = 0;
      firstItem.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateToPathIndex(0);
      });
      breadcrumb.appendChild(firstItem);

      // Show ellipsis
      const ellipsis = document.createElement('span');
      ellipsis.className = 'breadcrumb-item breadcrumb-ellipsis';
      ellipsis.textContent = '...';
      breadcrumb.appendChild(ellipsis);

      // Show last N items
      const startIndex = currentPath.length - ITEMS_TO_SHOW_AT_END;
      for (let i = startIndex; i < currentPath.length; i++) {
        const segment = currentPath[i];
        const item = document.createElement('span');
        item.className = 'breadcrumb-item';
        item.textContent = segment.name;
        item.dataset.index = i;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          navigateToPathIndex(i);
        });
        breadcrumb.appendChild(item);
      }
    } else {
      // Show full path
      currentPath.forEach((segment, index) => {
        const item = document.createElement('span');
        item.className = 'breadcrumb-item';
        item.textContent = segment.name;
        item.dataset.index = index;

        // Make all folder items clickable (even the last one)
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          navigateToPathIndex(index);
        });

        breadcrumb.appendChild(item);
      });
    }

    // Add current file if opened, or placeholder if no file
    if (currentFileHandle) {
      const fileItem = document.createElement('span');
      fileItem.className = 'breadcrumb-item';
      if (isDirty) {
        fileItem.classList.add('has-changes');
      }
      fileItem.textContent = currentFilename;
      fileItem.style.cursor = 'pointer';
      fileItem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentDirHandle) {
          focusManager.saveFocusState();
          showFilePicker(currentDirHandle);
        }
      });
      breadcrumb.appendChild(fileItem);
    } else {
      // Show placeholder when folder is open but no file selected
      const placeholder = document.createElement('span');
      placeholder.className = 'breadcrumb-item breadcrumb-placeholder';
      placeholder.textContent = 'filename (/ for search)';
      placeholder.style.cursor = 'pointer';
      placeholder.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentDirHandle) {
          focusManager.saveFocusState();
          showFilePicker(currentDirHandle);
        }
      });
      breadcrumb.appendChild(placeholder);
    }
  }

  // Set browser tab title: filename (folder/path) • - hotnote
  if (currentFileHandle) {
    const folderPath =
      currentPath.length > 0 ? ` (${currentPath.map((p) => p.name).join('/')})` : '';
    document.title = `${currentFilename}${folderPath}${isDirty ? ' •' : ''} - hotnote`;
  } else if (currentPath.length > 0) {
    document.title = `(${currentPath.map((p) => p.name).join('/')}) - hotnote`;
  } else {
    document.title = 'hotnote';
  }
};

// Update rich toggle button visibility and state
const updateRichToggleButton = () => {
  const richToggleBtn = document.getElementById('rich-toggle-btn');

  if (isMarkdownFile(currentFilename) && editorManager) {
    richToggleBtn.classList.remove('hidden');
    const currentMode = editorManager.getMode();
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
  if (!isMarkdownFile(currentFilename) || !editorManager) {
    console.log('[RichMode] Not a markdown file or no editor manager, skipping toggle');
    return;
  }

  console.log('[RichMode] Toggling mode via EditorManager');
  await editorManager.toggleMode();

  // Save mode preference to localStorage
  const newMode = editorManager.getMode();
  localStorage.setItem(`mode_${currentFilename}`, newMode);

  updateRichToggleButton();
};

// Navigate to a specific path index (breadcrumb click)
const navigateToPathIndex = async (index) => {
  if (index >= currentPath.length) return;

  // Save focus state before navigation
  focusManager.saveFocusState();

  // Save temp changes if file is dirty
  if (isDirty && currentFileHandle) {
    saveTempChanges();
  }

  // Truncate path to the clicked index
  currentPath = currentPath.slice(0, index + 1);
  currentDirHandle = currentPath[currentPath.length - 1].handle;

  // Don't close the current file - keep it open while showing picker
  // Note: Don't add to history - breadcrumb navigation is just for browsing

  // Show file picker for this directory
  await showFilePicker(currentDirHandle);
  updateBreadcrumb();
};

// Add current state to navigation history
const addToHistory = () => {
  // Remove any forward history when navigating to a new location
  navigationHistory = navigationHistory.slice(0, historyIndex + 1);

  // Capture current editor state if we have a file open
  let editorState = null;
  if (currentFileHandle) {
    editorState = focusManager._captureEditorState();
  }

  navigationHistory.push({
    path: [...currentPath],
    dirHandle: currentDirHandle,
    fileHandle: currentFileHandle,
    filename: currentFilename,
    editorState: editorState, // Store cursor and scroll position
  });

  historyIndex = navigationHistory.length - 1;
  updateNavigationButtons();

  // Sync with browser history (unless we're navigating via popstate)
  if (!isPopStateNavigation) {
    const urlPath = pathToUrlParam();
    const url = urlPath ? `?localdir=${urlPath}` : window.location.pathname;
    const title = currentFilename || 'hotnote';

    window.history.pushState(
      {
        historyIndex: historyIndex,
        appHistory: true,
      },
      title,
      url
    );
  }
};

// Update back/forward button states
const updateNavigationButtons = () => {
  document.getElementById('back-btn').disabled = historyIndex <= 0;
  document.getElementById('forward-btn').disabled = historyIndex >= navigationHistory.length - 1;
  document.getElementById('folder-up-btn').disabled = currentPath.length === 0;
};

// Update new file button state based on workspace
const updateNewButtonState = () => {
  const newBtn = document.getElementById('new-btn');
  const hasWorkspace = currentDirHandle !== null;

  newBtn.disabled = !hasWorkspace;

  // Update tooltip to provide helpful feedback
  if (hasWorkspace) {
    newBtn.title = 'New file (Ctrl/Cmd+N)';
  } else {
    newBtn.title = 'Open a folder first to create new files';
  }
};

// Convert current path and filename to URL parameter
const pathToUrlParam = () => {
  if (currentPath.length === 0) {
    return '';
  }

  // Build path from currentPath array
  const pathParts = currentPath.map((p) => encodeURIComponent(p.name));
  let fullPath = '/' + pathParts.join('/');

  // Add filename if we have one
  if (currentFilename) {
    fullPath += '/' + encodeURIComponent(currentFilename);
  }

  return fullPath;
};

// Parse URL parameter back to path segments
// eslint-disable-next-line no-unused-vars
const urlParamToPath = (param) => {
  if (!param || param === '/') {
    return [];
  }

  // Remove leading slash and split
  const cleaned = param.startsWith('/') ? param.slice(1) : param;
  return cleaned.split('/').filter((p) => p.length > 0);
};

// Navigate back
const goBack = async () => {
  if (historyIndex <= 0) return;

  // Save temp changes if file is dirty
  if (isDirty && currentFileHandle) {
    saveTempChanges();
  }

  historyIndex--;
  const state = navigationHistory[historyIndex];

  currentPath = [...state.path];
  currentDirHandle = state.dirHandle;
  currentFileHandle = state.fileHandle;
  currentFilename = state.filename;

  if (currentFileHandle) {
    const file = await currentFileHandle.getFile();
    currentFilename = file.name;

    // Load original file content from disk
    const fileContent = await file.text();

    // Check for temp changes
    const pathKey = getFilePathKey();
    const tempContent = loadTempChanges(pathKey);

    // Initialize with file content (sets originalContent)
    await initEditor(fileContent, currentFilename);

    // If we have temp changes, apply them
    if (tempContent !== null) {
      if (editorView) {
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: tempContent },
        });
      } else if (editorManager && isMarkdownFile(currentFilename)) {
        await initEditor(tempContent, currentFilename);
      }
      isDirty = true;
    }
  } else {
    await initEditor('', 'untitled');
  }

  if (currentFileHandle) {
    hideFilePicker();
  } else if (currentDirHandle) {
    await showFilePicker(currentDirHandle);
  }

  updateBreadcrumb();
  updateLogoState();
  updateNavigationButtons();

  // Restore editor state if available
  if (state.editorState) {
    // Use requestAnimationFrame to ensure editor is fully initialized

    requestAnimationFrame(() => {
      focusManager._restoreEditorState(state.editorState);
    });
  }

  // Update URL to match current state
  const urlPath = pathToUrlParam();
  const url = urlPath ? `?localdir=${urlPath}` : window.location.pathname;
  const title = currentFilename || 'hotnote';
  window.history.replaceState(
    {
      historyIndex: historyIndex,
      appHistory: true,
    },
    title,
    url
  );
};

// Navigate forward
const goForward = async () => {
  if (historyIndex >= navigationHistory.length - 1) return;

  // Save temp changes if file is dirty
  if (isDirty && currentFileHandle) {
    saveTempChanges();
  }

  historyIndex++;
  const state = navigationHistory[historyIndex];

  currentPath = [...state.path];
  currentDirHandle = state.dirHandle;
  currentFileHandle = state.fileHandle;
  currentFilename = state.filename;

  if (currentFileHandle) {
    const file = await currentFileHandle.getFile();
    currentFilename = file.name;

    // Load original file content from disk
    const fileContent = await file.text();

    // Check for temp changes
    const pathKey = getFilePathKey();
    const tempContent = loadTempChanges(pathKey);

    // Initialize with file content (sets originalContent)
    await initEditor(fileContent, currentFilename);

    // If we have temp changes, apply them
    if (tempContent !== null) {
      if (editorView) {
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: tempContent },
        });
      } else if (editorManager && isMarkdownFile(currentFilename)) {
        await initEditor(tempContent, currentFilename);
      }
      isDirty = true;
    }
  } else {
    await initEditor('', 'untitled');
  }

  if (currentFileHandle) {
    hideFilePicker();
  } else if (currentDirHandle) {
    await showFilePicker(currentDirHandle);
  }

  updateBreadcrumb();
  updateLogoState();
  updateNavigationButtons();

  // Restore editor state if available
  if (state.editorState) {
    // Use requestAnimationFrame to ensure editor is fully initialized

    requestAnimationFrame(() => {
      focusManager._restoreEditorState(state.editorState);
    });
  }

  // Update URL to match current state
  const urlPath = pathToUrlParam();
  const url = urlPath ? `?localdir=${urlPath}` : window.location.pathname;
  const title = currentFilename || 'hotnote';
  window.history.replaceState(
    {
      historyIndex: historyIndex,
      appHistory: true,
    },
    title,
    url
  );
};

// Navigate up one folder
const goFolderUp = async () => {
  if (currentPath.length === 0) return;

  // Save temp changes if file is dirty
  if (isDirty && currentFileHandle) {
    saveTempChanges();
  }

  if (currentPath.length === 1) {
    // At root level, prompt to open a new parent folder
    await openFolder();
  } else {
    // Remove the last path segment
    currentPath.pop();
    currentDirHandle = currentPath[currentPath.length - 1].handle;
    currentFileHandle = null;
    currentFilename = '';
    await initEditor('', 'untitled');

    addToHistory();
    await showFilePicker(currentDirHandle);
    updateBreadcrumb();
  }
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
    await cleanupTrash();

    // Save temp changes if file is dirty
    if (isDirty && currentFileHandle) {
      saveTempChanges();
    }

    const dirHandle = await FileSystemAdapter.openDirectory();
    if (!dirHandle) return; // User cancelled

    currentDirHandle = dirHandle;
    rootDirHandle = dirHandle; // Set root directory for session file
    currentPath = [{ name: dirHandle.name, handle: dirHandle }];
    currentFileHandle = null;
    currentFilename = '';
    await initEditor('', 'untitled');

    // Save folder name to localStorage for auto-resume
    localStorage.setItem('lastFolderName', dirHandle.name);

    // Load session file and restore last open file
    let sessionData = await loadSessionFile(rootDirHandle);
    if (!sessionData) {
      // Create empty session file
      console.log('No session file found, creating new one');
      sessionData = createEmptySession(dirHandle.name);
      await saveSessionFile(rootDirHandle, sessionData);
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
      isRestoringSession = true;

      // Save editor mode preference to localStorage so initEditor can use it
      if (lastFile.editorMode !== undefined) {
        const filename = lastFile.path.split('/').pop();
        localStorage.setItem(`mode_${filename}`, lastFile.editorMode);
        console.log('[Session] Saved mode preference for restoration:', lastFile.editorMode);
      }

      const opened = await openFileByPath(lastFile.path);
      console.log('File opened successfully:', opened);

      // Clear the flag
      isRestoringSession = false;

      if (opened) {
        fileRestored = true;

        // Wait for editor to be ready, then restore cursor and scroll
        setTimeout(async () => {
          if (editorManager) {
            // Markdown file - using EditorManager
            console.log('[Session] Restoring EditorManager state');
            await editorManager.ready();

            // Restore cursor and scroll position
            if (lastFile.cursorLine !== undefined && lastFile.cursorColumn !== undefined) {
              editorManager.setCursor(lastFile.cursorLine, lastFile.cursorColumn);
            }
            if (lastFile.scrollTop !== undefined) {
              editorManager.setScrollPosition(lastFile.scrollTop);
            }
            editorManager.focus();

            console.log('[Session] EditorManager state restored:', {
              line: lastFile.cursorLine,
              column: lastFile.cursorColumn,
              scroll: lastFile.scrollTop,
            });
          } else if (editorView) {
            // Non-markdown file - using CodeMirror
            console.log('[Session] Restoring CodeMirror state');

            // Restore cursor position
            if (lastFile.cursorLine !== undefined && lastFile.cursorColumn !== undefined) {
              const doc = editorView.state.doc;
              const line = doc.line(lastFile.cursorLine + 1); // Convert to 1-based
              const pos = line.from + Math.min(lastFile.cursorColumn, line.length);
              editorView.dispatch({
                selection: { anchor: pos, head: pos },
              });
            }

            // Restore scroll position
            if (lastFile.scrollTop !== undefined) {
              editorView.scrollDOM.scrollTop = lastFile.scrollTop;
            }
            if (lastFile.scrollLeft !== undefined) {
              editorView.scrollDOM.scrollLeft = lastFile.scrollLeft;
            }
            editorView.focus();

            console.log('[Session] CodeMirror state restored');
          }

          // Update UI
          updateRichToggleButton();

          // Mark restoration time to prevent premature saves
          lastRestorationTime = Date.now();
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
const showFilePicker = async (dirHandle) => {
  // Pause file polling while picker is open
  pauseFilePolling();

  const picker = document.getElementById('file-picker');
  const resizeHandle = document.getElementById('file-picker-resize-handle');
  picker.classList.remove('hidden');
  resizeHandle.classList.remove('hidden');

  // Create file list
  picker.innerHTML = "<div class='file-list' id='file-list'></div>";

  const fileList = document.getElementById('file-list');

  // Collect all entries using the adapter
  const entries = await FileSystemAdapter.listDirectory(dirHandle);

  // Sort: directories first, then files, alphabetically
  entries.sort((a, b) => {
    if (a.kind === 'directory' && b.kind === 'file') return -1;
    if (a.kind === 'file' && b.kind === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });

  // Create file items
  for (const entry of entries) {
    const item = document.createElement('div');
    item.className = `file-item ${entry.kind === 'directory' ? 'is-directory' : ''}`;

    const icon = document.createElement('span');
    icon.className = 'file-item-icon';
    const iconSymbol = document.createElement('span');
    iconSymbol.className = 'material-symbols-outlined';
    iconSymbol.textContent = getFileIcon(entry.name, entry.kind === 'directory');
    icon.appendChild(iconSymbol);

    const name = document.createElement('span');
    name.className = 'file-item-name';
    name.textContent = entry.name;

    // Check if file has temp changes
    if (entry.kind === 'file') {
      const pathParts = currentPath.map((p) => p.name);
      pathParts.push(entry.name);
      const filePathKey = pathParts.join('/');
      if (hasTempChanges(filePathKey)) {
        item.classList.add('has-unsaved-changes');
      }
    }

    item.appendChild(icon);
    item.appendChild(name);

    // Add metadata and delete button for files only
    if (entry.kind === 'file') {
      // Get file metadata (size, permissions)
      const file = await entry.getFile();
      const sizeKB =
        file.size < 1024
          ? file.size + ' B'
          : file.size < 1024 * 1024
            ? (file.size / 1024).toFixed(1) + ' KB'
            : (file.size / (1024 * 1024)).toFixed(1) + ' MB';

      // Display file size
      const metadata = document.createElement('span');
      metadata.className = 'file-item-metadata';
      metadata.textContent = sizeKB;
      item.appendChild(metadata);

      // Check if file is read-only
      let lockIcon = null;
      try {
        const permission = await entry.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
          lockIcon = document.createElement('span');
          lockIcon.className = 'file-item-lock';
          const lockSymbol = document.createElement('span');
          lockSymbol.className = 'material-symbols-outlined';
          lockSymbol.textContent = 'lock';
          lockIcon.appendChild(lockSymbol);
          lockIcon.title = 'Read-only';
          item.appendChild(lockIcon);
        }
      } catch {
        // Permission check not supported, ignore
      }

      // Add delete button with confirmation
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'file-item-delete';
      const deleteIcon = document.createElement('span');
      deleteIcon.className = 'material-symbols-outlined';
      deleteIcon.textContent = 'close';
      deleteBtn.appendChild(deleteIcon);
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevent opening the file
        showDeleteConfirmation(item, entry, metadata, lockIcon);
      });
      item.appendChild(deleteBtn);
    }

    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      focusManager.saveFocusState();
      if (entry.kind === 'directory') {
        await navigateToDirectory(entry);
      } else {
        await openFileFromPicker(entry);
      }
    });

    fileList.appendChild(item);
  }

  // Show search input with cursor when file picker is displayed
  // Note: Don't await - we want this to run asynchronously
  quickFileCreate('');
};

// Hide file picker
window.hideFilePicker = () => {
  document.getElementById('file-picker').classList.add('hidden');
  document.getElementById('file-picker-resize-handle').classList.add('hidden');

  // Resume file polling when picker is closed
  resumeFilePolling();

  // Restore focus to editor if a file is currently open
  if (currentFileHandle) {
    focusManager.focusEditor({ delay: 50, reason: 'picker-hidden' });
  }
};

// Click away to close file picker
document.addEventListener('click', (e) => {
  const picker = document.getElementById('file-picker');
  if (!picker) return;

  // Check if picker is visible
  if (picker.classList.contains('hidden')) return;

  // Don't close if showing welcome or resume prompt
  if (picker.querySelector('.welcome-content')) return;

  // Don't close if click was inside the picker
  if (picker.contains(e.target)) return;

  // Don't close if click was on the resize handle
  if (e.target.closest('#file-picker-resize-handle')) return;

  // Don't close if click was on breadcrumb (handled by stopPropagation)
  // Don't close if click was on navigation controls or header
  const clickedElement = e.target;
  if (
    clickedElement.closest('.breadcrumb') ||
    clickedElement.closest('.nav-controls') ||
    clickedElement.closest('.autocomplete-dropdown') ||
    clickedElement.closest('header')
  ) {
    return;
  }

  // Close the picker for clicks outside
  hideFilePicker();
});

// Initialize file picker resize functionality
const initFilePickerResize = () => {
  const resizeHandle = document.getElementById('file-picker-resize-handle');
  const filePicker = document.getElementById('file-picker');

  // Load saved height from localStorage
  const savedHeight = localStorage.getItem('filePickerHeight');
  const initialHeight = savedHeight ? parseInt(savedHeight, 10) : 300;
  document.documentElement.style.setProperty('--file-picker-height', `${initialHeight}px`);

  let isDragging = false;
  let startY = 0;
  let startHeight = 0;

  const onMouseDown = (e) => {
    isDragging = true;
    startY = e.clientY;
    startHeight = filePicker.offsetHeight;

    resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    e.preventDefault();
  };

  const onMouseMove = (e) => {
    if (!isDragging) return;

    const deltaY = e.clientY - startY;
    let newHeight = startHeight + deltaY;

    // Apply constraints: min 100px, max 80vh
    const minHeight = 100;
    const maxHeight = window.innerHeight * 0.8;
    newHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));

    // Update CSS custom property
    document.documentElement.style.setProperty('--file-picker-height', `${newHeight}px`);

    // Save to localStorage
    localStorage.setItem('filePickerHeight', newHeight.toString());
  };

  const onMouseUp = () => {
    if (!isDragging) return;

    isDragging = false;
    resizeHandle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  // Attach event listeners
  resizeHandle.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};

// Global variable for trash handle
let trashDirHandle = null;

// Show delete confirmation inline
const showDeleteConfirmation = (item, entry, metadata, lockIcon) => {
  // Hide metadata and lock icon if they exist
  if (metadata) metadata.style.display = 'none';
  if (lockIcon) lockIcon.style.display = 'none';

  // Hide the delete button
  const deleteBtn = item.querySelector('.file-item-delete');
  if (deleteBtn) deleteBtn.style.display = 'none';

  // Create confirmation UI
  const confirmContainer = document.createElement('div');
  confirmContainer.className = 'file-item-delete-confirm';

  const confirmText = document.createElement('span');
  confirmText.className = 'file-item-delete-confirm-text';
  confirmText.textContent = 'Delete?';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'file-item-delete-confirm-btn confirm';
  const confirmIcon = document.createElement('span');
  confirmIcon.className = 'material-symbols-outlined';
  confirmIcon.textContent = 'check';
  confirmBtn.appendChild(confirmIcon);
  confirmBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await moveToTrash(entry);
    showUndoSnackbar(entry.name, entry);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'file-item-delete-confirm-btn cancel';
  const cancelIcon = document.createElement('span');
  cancelIcon.className = 'material-symbols-outlined';
  cancelIcon.textContent = 'close';
  cancelBtn.appendChild(cancelIcon);
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Restore normal view
    if (metadata) metadata.style.display = '';
    if (lockIcon) lockIcon.style.display = '';
    if (deleteBtn) deleteBtn.style.display = '';
    confirmContainer.remove();
  });

  confirmContainer.appendChild(confirmText);
  confirmContainer.appendChild(confirmBtn);
  confirmContainer.appendChild(cancelBtn);
  item.appendChild(confirmContainer);
};

// Move file to trash folder
const moveToTrash = async (fileHandle) => {
  try {
    // Create .trash folder if it doesn't exist
    if (!trashDirHandle) {
      trashDirHandle = await currentDirHandle.getDirectoryHandle('.trash', { create: true });
    }

    // Read file contents
    const file = await fileHandle.getFile();
    const contents = await file.text();

    // Create file in trash with same name
    const trashFileHandle = await trashDirHandle.getFileHandle(fileHandle.name, { create: true });
    const writable = await trashFileHandle.createWritable();
    await writable.write(contents);
    await writable.close();

    // Delete from original location
    await currentDirHandle.removeEntry(fileHandle.name);

    // If the deleted file is currently open, close it
    if (currentFileHandle && currentFileHandle.name === fileHandle.name) {
      currentFileHandle = null;
      currentFilename = '';
      isDirty = false;
      await initEditor('', 'untitled');
      updateBreadcrumb();
    }

    // Clear temp changes for this file
    const pathParts = currentPath.map((p) => p.name);
    pathParts.push(fileHandle.name);
    const filePathKey = pathParts.join('/');
    clearTempChanges(filePathKey);

    // Refresh the file picker
    await showFilePicker(currentDirHandle);
  } catch (err) {
    console.error('Error moving file to trash:', err);
    alert('Error deleting file: ' + err.message);
  }
};

// Restore file from trash
const restoreFromTrash = async (filename) => {
  try {
    if (!trashDirHandle) return;

    // Read file from trash
    const trashFileHandle = await trashDirHandle.getFileHandle(filename);
    const file = await trashFileHandle.getFile();
    const contents = await file.text();

    // Restore to original location
    const restoredFileHandle = await currentDirHandle.getFileHandle(filename, { create: true });
    const writable = await restoredFileHandle.createWritable();
    await writable.write(contents);
    await writable.close();

    // Delete from trash
    await trashDirHandle.removeEntry(filename);

    // Refresh the file picker
    await showFilePicker(currentDirHandle);
  } catch (err) {
    console.error('Error restoring file from trash:', err);
    alert('Error restoring file: ' + err.message);
  }
};

// Show undo snackbar
const showUndoSnackbar = (filename, _fileHandle) => {
  // Remove existing snackbar if any
  const existingSnackbar = document.querySelector('.snackbar');
  if (existingSnackbar) {
    existingSnackbar.remove();
  }

  // Create snackbar
  const snackbar = document.createElement('div');
  snackbar.className = 'snackbar';

  const message = document.createElement('span');
  message.className = 'snackbar-message';
  message.textContent = `Deleted ${filename}`;

  const undoBtn = document.createElement('button');
  undoBtn.className = 'snackbar-action';
  undoBtn.textContent = 'UNDO';
  undoBtn.addEventListener('click', async () => {
    await restoreFromTrash(filename);
    snackbar.remove();
  });

  snackbar.appendChild(message);
  snackbar.appendChild(undoBtn);
  document.body.appendChild(snackbar);

  // Show snackbar with animation
  setTimeout(() => {
    snackbar.classList.add('visible');
  }, 10);

  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    snackbar.classList.remove('visible');
    setTimeout(() => {
      snackbar.remove();
    }, 200);
  }, 10000);
};

// Cleanup trash folder
const cleanupTrash = async () => {
  try {
    if (trashDirHandle && currentDirHandle) {
      await currentDirHandle.removeEntry('.trash', { recursive: true });
      trashDirHandle = null;
    }
  } catch (err) {
    console.error('Error cleaning up trash:', err);
  }
};

// Navigate to a subdirectory
const navigateToDirectory = async (dirHandle) => {
  // Save temp changes if file is dirty
  if (isDirty && currentFileHandle) {
    saveTempChanges();
  }

  currentPath.push({ name: dirHandle.name, handle: dirHandle });
  currentDirHandle = dirHandle;

  // Don't close the current file - keep it open while showing picker
  // Note: Don't add to history - folder navigation is just for browsing

  await showFilePicker(dirHandle);
  updateBreadcrumb();
};

// Open a file by relative path from current directory
const openFileByPath = async (relativePath) => {
  if (!currentDirHandle || !relativePath) return false;

  try {
    const parts = relativePath.split('/');
    const filename = parts.pop();

    let targetDir = currentDirHandle;

    // Navigate through subdirectories
    for (const dirName of parts) {
      if (dirName) {
        // Skip empty parts
        targetDir = await targetDir.getDirectoryHandle(dirName);
      }
    }

    // Get file handle
    const fileHandle = await targetDir.getFileHandle(filename);

    // Update current path if navigated to subdirectory
    if (parts.length > 0 && parts[0]) {
      // Reconstruct path by navigating from root
      currentPath = [currentPath[0]]; // Keep root
      let pathDir = currentDirHandle;
      for (const dirName of parts) {
        if (dirName) {
          pathDir = await pathDir.getDirectoryHandle(dirName);
          currentPath.push({ name: dirName, handle: pathDir });
        }
      }
    }

    // Open the file using existing logic
    await openFileFromPicker(fileHandle);
    return true;
  } catch (err) {
    console.error('Error opening file by path:', relativePath, err);
    return false;
  }
};

// Open a file from the file picker
const openFileFromPicker = async (fileHandle) => {
  try {
    // Save temp changes for currently open file if dirty
    if (isDirty && currentFileHandle) {
      saveTempChanges();
    }

    currentFileHandle = fileHandle;
    currentFilename = fileHandle.name;

    // Always load the original file content from disk
    const fileContent = await FileSystemAdapter.readFile(fileHandle);

    // Initialize file modification tracking
    const metadata = await FileSystemAdapter.getFileMetadata(fileHandle);
    lastKnownModified = metadata.lastModified;
    lastModifiedLocal = null;

    // Check for temp changes
    const pathKey = getFilePathKey();
    const tempContent = loadTempChanges(pathKey);

    if (tempContent !== null) {
      // Restore temp changes but remember the file content as original
      isDirty = true;
    } else {
      // Load from file
      isDirty = false;
    }

    // Initialize editor with the content (temp or file)
    // but originalContent will be set to fileContent in initEditor
    await initEditor(fileContent, fileHandle.name);

    // If we loaded temp content, replace the editor content and mark as dirty
    if (tempContent !== null) {
      if (editorView) {
        // CodeMirror editor
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: tempContent },
        });
      }
      // Note: For markdown with EditorManager, we reinitialize with tempContent
      if (editorManager && isMarkdownFile(fileHandle.name)) {
        await initEditor(tempContent, fileHandle.name);
      }
      isDirty = true;
    }

    updateBreadcrumb();
    updateLogoState();
    hideFilePicker();

    // Start file polling for external changes
    startFilePolling();

    // Restore focus to editor after opening file
    focusManager.focusEditor({ delay: 100, reason: 'file-opened' });

    addToHistory();

    // Save session file with current file info (debounced to avoid excessive writes)
    if (currentDirHandle) {
      setTimeout(async () => {
        try {
          const filePath = getRelativeFilePath();
          if (filePath) {
            let sessionData = await loadSessionFile(currentDirHandle);
            if (!sessionData) {
              sessionData = createEmptySession(currentDirHandle.name);
            }

            // Get cursor and scroll from the appropriate editor
            let cursorLine = 0;
            let cursorColumn = 0;
            let scrollTop = 0;
            let scrollLeft = 0;
            let editorMode = 'source';

            if (editorManager) {
              const cursor = editorManager.getCursor();
              cursorLine = cursor.line;
              cursorColumn = cursor.column;
              scrollTop = editorManager.getScrollPosition();
              editorMode = editorManager.getMode();
            } else if (editorView) {
              const pos = editorView.state.selection.main.head;
              const line = editorView.state.doc.lineAt(pos);
              cursorLine = line.number - 1;
              cursorColumn = pos - line.from;
              scrollTop = editorView.scrollDOM.scrollTop;
              scrollLeft = editorView.scrollDOM.scrollLeft;
            }

            sessionData.session.lastOpenFile = {
              path: filePath,
              cursorLine: cursorLine,
              cursorColumn: cursorColumn,
              scrollTop: scrollTop,
              scrollLeft: scrollLeft,
              editorMode: editorMode,
            };

            await saveSessionFile(rootDirHandle, sessionData);
          }
        } catch (err) {
          console.error('Error saving session file:', err);
        }
      }, 500);
    }
  } catch (err) {
    console.error('Error opening file:', err);
    alert('Error opening file: ' + err.message);
  }
};

// Save file
const saveFile = async () => {
  if (!isFileSystemAccessSupported()) {
    alert(
      'File System Access API is not supported in this browser. Please use Chrome, Edge, or a recent version of Safari.'
    );
    return;
  }

  if (!isDirty && currentFileHandle) {
    // No changes to save
    return;
  }

  try {
    const content = getEditorContent();

    // If no file handle exists, prompt for save location
    if (!currentFileHandle) {
      currentFileHandle = await FileSystemAdapter.saveFilePicker(currentFilename || 'untitled.txt');

      if (!currentFileHandle) return; // User cancelled

      currentFilename = currentFileHandle.name;
      updateBreadcrumb();
    }

    // Write to file
    await FileSystemAdapter.writeFile(currentFileHandle, content);

    isDirty = false;

    // Update original content to the saved content
    originalContent = content;

    // Update file modification tracking
    const metadata = await FileSystemAdapter.getFileMetadata(currentFileHandle);
    lastKnownModified = metadata.lastModified;
    lastModifiedLocal = null; // Clear since we just saved

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

// Autosave functionality
const startAutosave = () => {
  if (autosaveInterval) {
    clearInterval(autosaveInterval);
  }

  autosaveInterval = setInterval(async () => {
    if (isDirty && currentFileHandle) {
      await saveFile();
    }
  }, 2000); // Save every 2 seconds if dirty
};

const stopAutosave = () => {
  if (autosaveInterval) {
    clearInterval(autosaveInterval);
    autosaveInterval = null;
  }
};

const toggleAutosave = (enabled) => {
  autosaveEnabled = enabled;
  if (enabled) {
    startAutosave();
  } else {
    stopAutosave();
  }
};

// Debounce utility
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// User activity tracking
const updateUserActivity = () => {
  lastUserActivityTime = Date.now();
};

const isUserIdle = () => {
  const idleThreshold = 4000; // 4 seconds (between 3-5 as per requirements)
  return Date.now() - lastUserActivityTime > idleThreshold;
};

// File polling utilities
const shouldPollFile = () => {
  return (
    currentFileHandle !== null && // File is open
    !isPollingPaused && // Not paused during file picker
    isUserIdle() // User is idle
  );
};

const checkFileForExternalChanges = async () => {
  if (!shouldPollFile()) {
    return;
  }

  try {
    const metadata = await FileSystemAdapter.getFileMetadata(currentFileHandle);
    const externalModified = metadata.lastModified;

    // Check if file was modified externally
    if (lastKnownModified && externalModified > lastKnownModified) {
      // File changed externally - need to reconcile
      await reconcileFileChanges(externalModified);
    }
  } catch (err) {
    console.error('[File Sync] Error checking file for external changes:', err);
    // File might have been deleted - stop polling
    if (err.name === 'NotFoundError' || err.name === 'NotAllowedError') {
      stopFilePolling();
    }
  }
};

const reconcileFileChanges = async (externalModified) => {
  // Last edit wins: compare timestamps
  if (lastModifiedLocal && lastModifiedLocal > externalModified) {
    // Our local changes are newer - skip reload
    return;
  }

  // External changes are newer or we have no local edits - reload

  try {
    // Add syncing visual feedback
    const editorElement = document.getElementById('editor');
    const breadcrumb = document.getElementById('breadcrumb');
    if (editorElement) {
      editorElement.classList.add('syncing');
    }
    if (breadcrumb) {
      breadcrumb.classList.add('syncing');
    }

    // Capture current state BEFORE any changes
    let capturedScrollTop = 0;
    let capturedCursorLine = 0;
    let capturedCursorColumn = 0;

    if (editorManager) {
      // Capture from markdown editor
      if (editorManager.currentMode === 'wysiwyg') {
        capturedScrollTop = editorManager.getScrollPosition();
      } else {
        const view = editorManager.currentEditor?.view;
        if (view) {
          capturedScrollTop = view.scrollDOM.scrollTop;
        }
      }
      const cursor = editorManager.getCursor();
      capturedCursorLine = cursor.line;
      capturedCursorColumn = cursor.column;
    } else if (editorView) {
      // Capture from regular CodeMirror
      capturedScrollTop = editorView.scrollDOM.scrollTop;
      const pos = editorView.state.selection.main.head;
      const line = editorView.state.doc.lineAt(pos);
      capturedCursorLine = line.number - 1;
      capturedCursorColumn = pos - line.from;
    }

    // Read fresh content from disk
    const freshContent = await FileSystemAdapter.readFile(currentFileHandle);

    // Update editor with fresh content (preserving scroll position)
    if (editorManager) {
      const wasWYSIWYG = editorManager.currentMode === 'wysiwyg';

      if (wasWYSIWYG) {
        // For WYSIWYG: destroy and recreate to avoid duplicates
        // Destroy old editor completely
        editorManager.currentEditor.destroy();
        editorManager.container.innerHTML = '';

        // Create new editor with fresh content
        await editorManager.init('wysiwyg', freshContent);

        // Update focus manager with new editor instance
        focusManager.setEditors(editorManager, null);

        // Restore scroll after editor is ready
        await editorManager.ready();

        // Small delay to let WYSIWYG render, then restore position
        setTimeout(() => {
          if (editorManager.currentEditor) {
            editorManager.currentEditor.setScrollPosition(capturedScrollTop);
            // Restore cursor in WYSIWYG
            try {
              editorManager.setCursor(capturedCursorLine, capturedCursorColumn);
            } catch (_e) {
              // Line might not exist in new content
            }
          }
        }, 100);
      } else {
        // Source mode: update with scroll preservation
        const view = editorManager.currentEditor?.view;
        if (view) {
          view.dispatch({
            changes: {
              from: 0,
              to: view.state.doc.length,
              insert: freshContent,
            },
          });

          // Restore scroll and cursor position immediately
          requestAnimationFrame(() => {
            view.scrollDOM.scrollTop = capturedScrollTop;

            // Restore cursor position
            try {
              const lineObj = view.state.doc.line(capturedCursorLine + 1);
              const pos = lineObj.from + Math.min(capturedCursorColumn, lineObj.length);
              view.dispatch({
                selection: { anchor: pos, head: pos },
              });
            } catch (_e) {
              // Line might not exist in new content
            }
          });
        }
      }
    } else if (editorView) {
      // For non-markdown files: update with scroll and cursor preservation
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: freshContent,
        },
      });

      // Restore scroll and cursor position immediately
      requestAnimationFrame(() => {
        editorView.scrollDOM.scrollTop = capturedScrollTop;

        // Restore cursor position
        try {
          const lineObj = editorView.state.doc.line(capturedCursorLine + 1);
          const pos = lineObj.from + Math.min(capturedCursorColumn, lineObj.length);
          editorView.dispatch({
            selection: { anchor: pos, head: pos },
          });
        } catch (_e) {
          console.log('[File Sync] Could not restore cursor');
        }
      });
    }

    // Update tracking variables
    originalContent = freshContent;
    isDirty = false;
    lastKnownModified = externalModified;
    lastModifiedLocal = null; // Clear local timestamp since we just loaded

    // Clear temp changes
    const pathKey = getFilePathKey();
    if (pathKey) {
      clearTempChanges(pathKey);
    }

    // Update UI
    updateBreadcrumb();

    // Remove syncing and blur states, restore focus
    if (editorElement) {
      editorElement.classList.remove('syncing');
      editorElement.classList.remove('blurred');
    }
    if (breadcrumb) {
      breadcrumb.classList.remove('syncing');
    }

    // Restore focus to editor
    focusManager.focusEditor({ delay: 50, reason: 'file-synced' });

    showFileReloadNotification();
  } catch (err) {
    console.error('[File Sync] Error reloading file:', err);
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

// File polling control
const startFilePolling = () => {
  if (filePollingInterval) {
    clearInterval(filePollingInterval);
  }

  filePollingInterval = setInterval(checkFileForExternalChanges, 2500); // Check every 2.5 seconds
};

const stopFilePolling = () => {
  if (filePollingInterval) {
    clearInterval(filePollingInterval);
    filePollingInterval = null;
  }
};

const pauseFilePolling = () => {
  isPollingPaused = true;
};

const resumeFilePolling = () => {
  isPollingPaused = false;
};

// Save current editor state to session file (debounced)
const saveEditorStateToSession = async () => {
  // Don't save if we just restored state (wait for scroll animation to complete)
  // Block for 1 second (animation is 250ms, plus margin for safety)
  const timeSinceRestoration = Date.now() - lastRestorationTime;
  console.log(
    '[Session] Save check: lastRestorationTime=',
    lastRestorationTime,
    'timeSince=',
    timeSinceRestoration,
    'willBlock=',
    lastRestorationTime > 0 && timeSinceRestoration < 1000
  );
  if (lastRestorationTime > 0 && timeSinceRestoration < 1000) {
    console.log(
      '[Session] Skipping save - scroll animation in progress (',
      timeSinceRestoration,
      'ms since restoration)'
    );
    return;
  }

  if (!currentDirHandle || !currentFileHandle) {
    console.log('[Session] Skipping save - no dir or file handle');
    return;
  }

  try {
    const filePath = getRelativeFilePath();
    if (!filePath) {
      console.log('[Session] Skipping save - no file path');
      return;
    }

    let sessionData = await loadSessionFile(currentDirHandle);
    if (!sessionData) {
      sessionData = createEmptySession(currentDirHandle.name);
    }

    // Get current editor state
    let cursorLine = 0;
    let cursorColumn = 0;
    let scrollTop = 0;
    let scrollLeft = 0;
    let editorMode = 'source'; // Default for non-markdown files

    console.log(
      '[Session] saveEditorStateToSession called. editorManager:',
      !!editorManager,
      'editorView:',
      !!editorView
    );

    if (editorManager) {
      // Markdown file using EditorManager
      const cursor = editorManager.getCursor();
      cursorLine = cursor.line;
      cursorColumn = cursor.column;
      scrollTop = editorManager.getScrollPosition();
      editorMode = editorManager.getMode();
      console.log('[Session] Saving EditorManager state:', {
        cursorLine,
        cursorColumn,
        scrollTop,
        editorMode,
      });
    } else if (editorView) {
      // Non-markdown file using CodeMirror
      const pos = editorView.state.selection.main.head;
      const line = editorView.state.doc.lineAt(pos);
      cursorLine = line.number - 1; // Convert to 0-based
      cursorColumn = pos - line.from;
      scrollTop = editorView.scrollDOM.scrollTop;
      scrollLeft = editorView.scrollDOM.scrollLeft;
      console.log('[Session] Saving CodeMirror state:', {
        cursorLine,
        cursorColumn,
        scrollTop,
        scrollLeft,
      });
    } else {
      console.log('[Session] No editor active, saving defaults');
    }

    sessionData.session.lastOpenFile = {
      path: filePath,
      cursorLine: cursorLine,
      cursorColumn: cursorColumn,
      scrollTop: scrollTop,
      scrollLeft: scrollLeft,
      editorMode: editorMode,
    };

    console.log('[Session] Saving session file with data:', sessionData.session.lastOpenFile);
    await saveSessionFile(rootDirHandle, sessionData);
  } catch (err) {
    console.error('Error saving editor state:', err);
  }
};

// Debounced version (save every 2 seconds)
const debouncedSaveEditorState = debounce(saveEditorStateToSession, 2000);

// Fuzzy match helper - handles case-insensitive, substring, and space-as-wildcard matching
const fuzzyMatch = (text, query) => {
  if (!query) return true;

  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  // Normalize: replace spaces in query with a regex pattern that matches '', '-', or '_'
  const queryPattern = queryLower
    .split(' ')
    .map((part) =>
      part
        .split('')
        .map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('')
    )
    .join('[\\s\\-_]*');

  const regex = new RegExp(queryPattern);
  return regex.test(textLower);
};

// Calculate relevance score for search results
const calculateRelevance = (filename, query, depth = 0) => {
  if (!query) return 1000;

  const filenameLower = filename.toLowerCase();
  const queryLower = query.toLowerCase();

  // Exact match (highest priority)
  if (filenameLower === queryLower) {
    return 1000 - depth;
  }

  // Prefix match
  if (filenameLower.startsWith(queryLower)) {
    return 500 - depth;
  }

  // Substring match
  if (filenameLower.includes(queryLower)) {
    return 100 - depth;
  }

  // Fuzzy match (lowest priority)
  return 10 - depth;
};

// Recursive search through directories (async generator for progressive results)
const recursiveSearchFiles = async function* (dirHandle, query, maxDepth = 10, maxResults = 100) {
  const visited = new Set(); // Prevent infinite loops
  let resultCount = 0;

  const traverse = async function* (currentDir, currentPath = '', depth = 0) {
    // Stop if we've hit depth limit or result limit
    if (depth > maxDepth || resultCount >= maxResults) {
      return;
    }

    try {
      const entries = await FileSystemAdapter.listDirectory(currentDir);

      for (const entry of entries) {
        // Stop if we've reached result limit
        if (resultCount >= maxResults) {
          return;
        }

        // Skip hidden files and folders (starting with .)
        if (entry.name.startsWith('.')) {
          continue;
        }

        const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

        // Check if we've already visited this entry (avoid cycles)
        const entryKey = `${depth}:${entryPath}`;
        if (visited.has(entryKey)) {
          continue;
        }
        visited.add(entryKey);

        // Check if entry matches query
        if (fuzzyMatch(entry.name, query)) {
          const relevance = calculateRelevance(entry.name, query, depth);
          yield {
            name: entry.name,
            path: currentPath,
            fullPath: entryPath,
            kind: entry.kind,
            handle: entry,
            depth: depth,
            relevance: relevance,
          };
          resultCount++;
        }

        // Recursively search subdirectories
        if (entry.kind === 'directory' && resultCount < maxResults) {
          yield* traverse(entry, entryPath, depth + 1);
        }
      }
    } catch (err) {
      // Skip directories we can't access
      console.warn(`Cannot access directory: ${currentPath}`, err);
    }
  };

  yield* traverse(dirHandle);
};

// Helper function to get Material Symbol icon name based on file type
const getFileIcon = (filename, isDirectory) => {
  if (isDirectory) {
    return 'folder';
  }

  // Extract extension
  const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';

  // Handle special filenames without extensions
  if (filename === 'package.json' || filename === 'package-lock.json') {
    return 'inventory_2';
  }
  if (filename.endsWith('ignore')) {
    return 'visibility_off';
  }
  if (filename === 'Dockerfile' || filename === 'docker-compose.yml') {
    return 'deployed_code';
  }
  if (filename === 'Makefile') {
    return 'construction';
  }
  if (filename.toLowerCase().startsWith('readme')) {
    return 'article';
  }

  // Map file extensions to Material Symbol icons
  const iconMap = {
    // Code files
    js: 'javascript',
    jsx: 'javascript',
    ts: 'javascript',
    tsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'code',
    go: 'code',
    rs: 'code',
    java: 'code',
    c: 'code',
    cpp: 'code',
    cc: 'code',
    cxx: 'code',
    h: 'code',
    hpp: 'code',
    rb: 'code',
    php: 'code',

    // Web files
    html: 'html',
    htm: 'html',
    css: 'style',
    scss: 'style',
    sass: 'style',

    // Data/config files
    json: 'data_object',
    xml: 'code',
    yaml: 'settings',
    yml: 'settings',
    toml: 'settings',
    ini: 'settings',
    env: 'vpn_key',

    // Documents
    md: 'article',
    markdown: 'article',
    txt: 'description',
    pdf: 'picture_as_pdf',

    // Images
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    svg: 'image',
    webp: 'image',
    ico: 'image',

    // Scripts
    sh: 'terminal',
    bash: 'terminal',
    zsh: 'terminal',
    fish: 'terminal',
  };

  return iconMap[ext] || 'description';
};

// Helper function to create a dropdown item for autocomplete
const createDropdownItem = (result, input, dropdown, handleSubmit) => {
  const item = document.createElement('div');
  item.className = 'autocomplete-item';
  if (result.kind === 'directory') {
    item.classList.add('is-directory');
  }

  // Name line with Material Symbol icon
  const nameDiv = document.createElement('div');
  nameDiv.className = 'autocomplete-item-name';

  // Create icon element
  const iconSpan = document.createElement('span');
  iconSpan.className = 'material-symbols-outlined';
  const iconName = getFileIcon(result.name, result.kind === 'directory');
  iconSpan.textContent = iconName;

  // Create text node for filename
  const nameSpan = document.createElement('span');
  nameSpan.textContent = result.name;

  // Append icon and name
  nameDiv.appendChild(iconSpan);
  nameDiv.appendChild(nameSpan);

  // Path line (if not in current directory)
  if (result.path) {
    const pathDiv = document.createElement('div');
    pathDiv.className = 'autocomplete-item-path';
    pathDiv.textContent = result.path;
    item.appendChild(nameDiv);
    item.appendChild(pathDiv);
  } else {
    item.appendChild(nameDiv);
  }

  item.addEventListener('mousedown', (e) => {
    e.preventDefault(); // Prevent blur
    input.value = result.fullPath;
    dropdown.style.display = 'none';
    handleSubmit();
  });

  return item;
};

// Show inline filename input with autocomplete
const showFilenameInput = async (existingFiles = [], initialValue = '') => {
  return new Promise((resolve) => {
    const breadcrumb = document.getElementById('breadcrumb');
    breadcrumb.innerHTML = '';

    // Rebuild path if exists
    if (currentPath.length > 0) {
      currentPath.forEach((segment, _index) => {
        const item = document.createElement('span');
        item.className = 'breadcrumb-item';
        item.textContent = segment.name;
        breadcrumb.appendChild(item);
      });
    }

    // Create autocomplete container
    const autocompleteContainer = document.createElement('div');
    autocompleteContainer.className = 'autocomplete-container';

    // Add input where filename would normally appear
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'breadcrumb-input';
    input.placeholder = 'filename (/ for search)';
    input.value = initialValue;
    input.autocomplete = 'off';

    // Create custom block cursor
    const cursor = document.createElement('span');
    cursor.className = 'breadcrumb-cursor';

    // Create dropdown for autocomplete
    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    dropdown.style.display = 'none';

    let selectedIndex = -1;
    let filteredFiles = [];
    let resolved = false;
    let searchInProgress = false;
    const header = document.querySelector('header');

    const updateDropdownImpl = async () => {
      const value = input.value.trim();
      const isRecursiveMode = value.includes('/');
      const searchQuery = isRecursiveMode ? value.replace('/', '').trim() : value;

      if (!searchQuery) {
        dropdown.style.display = 'none';
        filteredFiles = [];
        header.classList.remove('searching');
        return;
      }

      // Prevent concurrent searches
      if (searchInProgress) {
        return;
      }

      try {
        searchInProgress = true;

        if (isRecursiveMode && currentDirHandle) {
          // Show loading animation for recursive search
          header.classList.add('searching');

          // Recursive search mode with progressive results
          const results = [];
          dropdown.innerHTML = '';

          // Stream results as they're found
          for await (const result of recursiveSearchFiles(currentDirHandle, searchQuery)) {
            results.push(result);

            // Add to dropdown immediately for instant feedback
            const item = createDropdownItem(result, input, dropdown, handleSubmit);
            dropdown.appendChild(item);

            // Show dropdown on first result
            if (results.length === 1) {
              const rect = input.getBoundingClientRect();
              dropdown.style.left = rect.left + 'px';
              dropdown.style.top = rect.bottom + 4 + 'px';
              dropdown.style.display = 'block';
            }
          }

          // Final sort when all results are in
          if (results.length > 1) {
            results.sort((a, b) => {
              if (b.relevance !== a.relevance) return b.relevance - a.relevance;
              if (a.depth !== b.depth) return a.depth - b.depth;
              return a.fullPath.localeCompare(b.fullPath);
            });

            // Rebuild dropdown with sorted results
            dropdown.innerHTML = '';
            results.forEach((result) => {
              const item = createDropdownItem(result, input, dropdown, handleSubmit);
              dropdown.appendChild(item);
            });
          }

          filteredFiles = results;
        } else {
          // Normal prefix mode (current directory only)
          filteredFiles = existingFiles
            .filter((file) => file.toLowerCase().startsWith(searchQuery.toLowerCase()))
            .map((name) => ({
              name: name,
              path: '',
              fullPath: name,
              kind: 'file',
              relevance: 1000,
            }));
        }

        if (filteredFiles.length === 0) {
          dropdown.style.display = 'none';
          return;
        }

        // Build dropdown items for non-recursive mode
        if (!isRecursiveMode) {
          dropdown.innerHTML = '';
          filteredFiles.forEach((result, _index) => {
            const item = createDropdownItem(result, input, dropdown, handleSubmit);
            dropdown.appendChild(item);
          });
        }

        // Position dropdown below input
        const rect = input.getBoundingClientRect();
        dropdown.style.left = rect.left + 'px';
        dropdown.style.top = rect.bottom + 4 + 'px';
        dropdown.style.display = 'block';
        selectedIndex = -1;
      } finally {
        searchInProgress = false;
        // Remove loading animation
        header.classList.remove('searching');
      }
    };

    // Debounced version for recursive search
    const debouncedUpdateDropdown = debounce(updateDropdownImpl, 300);

    const updateDropdown = () => {
      const isRecursiveMode = input.value.includes('/');
      if (isRecursiveMode) {
        debouncedUpdateDropdown();
      } else {
        updateDropdownImpl();
      }
    };

    const selectItem = (index) => {
      const items = dropdown.querySelectorAll('.autocomplete-item');
      items.forEach((item, i) => {
        item.classList.toggle('selected', i === index);
      });
    };

    const handleSubmit = async () => {
      if (resolved) return;
      resolved = true;

      // Clean up dropdown and loading animation
      dropdown.remove();
      header.classList.remove('searching');

      const filename = input.value.trim();
      // Validate filename
      if (!filename) {
        resolve(null);
        return;
      }

      // Handle special navigation shortcuts
      if (filename === '..' || filename === '...') {
        // Handle '..' - go up one folder
        if (filename === '..') {
          if (currentPath.length === 0) {
            // At top level, open folder dialog
            resolve(null);
            await openFolder();
            return;
          } else if (currentPath.length === 1) {
            // At root level, prompt to open a new parent folder
            resolve(null);
            await openFolder();
            return;
          } else {
            // Remove the last path segment
            currentPath.pop();
            currentDirHandle = currentPath[currentPath.length - 1].handle;
            currentFileHandle = null;
            currentFilename = '';
            await initEditor('', 'untitled');
            addToHistory();
            await showFilePicker(currentDirHandle);
            updateBreadcrumb();
            resolve(null);
            return;
          }
        }

        // Handle '...' - go to workspace root
        if (filename === '...') {
          if (currentPath.length === 0) {
            // At top level, open folder dialog
            resolve(null);
            await openFolder();
            return;
          } else {
            // Go to workspace root (first item in path)
            const rootHandle = currentPath[0].handle;
            currentPath = [currentPath[0]];
            currentDirHandle = rootHandle;
            currentFileHandle = null;
            currentFilename = '';
            await initEditor('', 'untitled');
            addToHistory();
            await showFilePicker(currentDirHandle);
            updateBreadcrumb();
            resolve(null);
            return;
          }
        }
      }

      // Check for invalid characters (allow / for paths)
      const invalidChars = /[\\:*?"<>|]/;
      if (invalidChars.test(filename)) {
        alert('Invalid filename. Please avoid using \\ : * ? " < > |');
        resolve(null);
        return;
      }
      resolve(filename);
    };

    const handleCancel = () => {
      if (resolved) return;
      resolved = true;

      // Clean up dropdown and loading animation
      dropdown.remove();
      header.classList.remove('searching');

      resolve(null);
    };

    input.addEventListener('input', updateDropdown);

    input.addEventListener('keydown', (e) => {
      if (dropdown.style.display === 'block' && filteredFiles.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedIndex = Math.min(selectedIndex + 1, filteredFiles.length - 1);
          selectItem(selectedIndex);
          // Scroll into view
          const items = dropdown.querySelectorAll('.autocomplete-item');
          if (items[selectedIndex]) {
            items[selectedIndex].scrollIntoView({ block: 'nearest' });
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedIndex = Math.max(selectedIndex - 1, -1);
          selectItem(selectedIndex);
          // Scroll into view
          const items = dropdown.querySelectorAll('.autocomplete-item');
          if (items[selectedIndex]) {
            items[selectedIndex].scrollIntoView({ block: 'nearest' });
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (selectedIndex >= 0) {
            input.value = filteredFiles[selectedIndex].fullPath;
            dropdown.style.display = 'none';
          }
          handleSubmit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          if (dropdown.style.display === 'block') {
            dropdown.style.display = 'none';
            selectedIndex = -1;
          } else {
            // Close input and focus editor
            handleCancel();
            setTimeout(() => {
              focusManager.focusEditor({ reason: 'escape-from-navbar' });
            }, 50);
          }
        }
      } else {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSubmit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          // Close input and focus editor
          handleCancel();
          setTimeout(() => {
            focusManager.focusEditor({ reason: 'escape-from-navbar' });
          }, 50);
        }
      }
    });

    input.addEventListener('blur', () => {
      // Delay to allow click on dropdown
      setTimeout(() => {
        dropdown.style.display = 'none';
        handleCancel();
      }, 200);
      // Hide cursor when input loses focus
      cursor.style.display = 'none';
    });

    // Create persistent measureSpan element (kept in DOM to avoid layout thrashing)
    const measureSpan = document.createElement('span');
    measureSpan.style.visibility = 'hidden';
    measureSpan.style.position = 'absolute';
    measureSpan.style.whiteSpace = 'pre';
    measureSpan.style.pointerEvents = 'none';
    document.body.appendChild(measureSpan);

    let isInitializing = true;

    input.addEventListener('focus', () => {
      // Show cursor when input gains focus
      cursor.style.display = 'inline-block';
      // Update position on focus only after initialization
      if (!isInitializing) {
        updateCursorPosition();
      }
    });

    // Function to update cursor position
    const updateCursorPosition = () => {
      try {
        // Only update if input is in the DOM
        if (!input.isConnected) return;

        // Copy input styles to measureSpan (only on first call or if styles changed)
        if (!measureSpan.dataset.styled) {
          const computedStyle = window.getComputedStyle(input);
          measureSpan.style.font = computedStyle.font;
          measureSpan.style.fontSize = computedStyle.fontSize;
          measureSpan.style.fontFamily = computedStyle.fontFamily;
          measureSpan.style.fontWeight = computedStyle.fontWeight;
          measureSpan.dataset.styled = 'true';
        }

        const cursorPos = input.selectionStart || 0;
        measureSpan.textContent = input.value.substring(0, cursorPos) || '\u200B';

        const width = measureSpan.offsetWidth;
        cursor.style.left = width + 'px';
      } catch (err) {
        // Silently fail if there's an error
        console.debug('Cursor position update error:', err);
      }
    };

    // Cleanup function to remove measureSpan when input is removed
    const cleanup = () => {
      if (measureSpan.parentNode) {
        measureSpan.remove();
      }
    };

    // Update cursor position on input and selection change
    input.addEventListener('input', updateCursorPosition);
    input.addEventListener('keyup', updateCursorPosition);
    input.addEventListener('click', updateCursorPosition);
    input.addEventListener('select', updateCursorPosition);

    autocompleteContainer.appendChild(input);
    autocompleteContainer.appendChild(cursor);
    breadcrumb.appendChild(autocompleteContainer);
    // Append dropdown to body for fixed positioning
    document.body.appendChild(dropdown);
    input.focus();

    // Use requestAnimationFrame for smooth initial cursor positioning
    requestAnimationFrame(() => {
      isInitializing = false;
      updateCursorPosition();

      // Trigger autocomplete if there's an initial value
      if (initialValue) {
        updateDropdown();
      }
    });

    // Clean up measureSpan when done
    input.addEventListener(
      'blur',
      () => {
        setTimeout(cleanup, 250);
      },
      { once: true }
    );
  });
};

// Quick file creation - triggered by typing
const quickFileCreate = async (initialChar = '') => {
  // Only trigger if we have a directory context
  if (!currentDirHandle) {
    return;
  }

  // Get existing files in current directory for autocomplete
  let existingFiles = [];
  try {
    const entries = await FileSystemAdapter.listDirectory(currentDirHandle);
    existingFiles = entries.filter((entry) => entry.kind === 'file').map((entry) => entry.name);
  } catch (err) {
    console.error('Error listing directory:', err);
  }

  // Show inline input for filename with initial character
  const filename = await showFilenameInput(existingFiles, initialChar);

  if (!filename) {
    // User cancelled - restore breadcrumb
    updateBreadcrumb();
    return;
  }

  // Continue with newFile logic
  await createOrOpenFile(filename);
};

// Helper to create or open a file
const createOrOpenFile = async (filePathOrName) => {
  const previousFileHandle = currentFileHandle;
  const previousFilename = currentFilename;
  const previousDirHandle = currentDirHandle;
  const previousPath = [...currentPath];
  const wasDirty = isDirty;

  try {
    let fileHandle;
    let fileExists = false;
    let actualFilename = filePathOrName;

    // Check if we have a path (contains /)
    if (filePathOrName.includes('/')) {
      const parts = filePathOrName.split('/');
      actualFilename = parts.pop(); // Last part is the filename
      const directories = parts.filter((p) => p); // Remove empty strings

      // Navigate through the directory path
      let targetDirHandle = currentDirHandle;
      const newPath = [...currentPath];

      for (const dirName of directories) {
        try {
          const dirHandle = await targetDirHandle.getDirectoryHandle(dirName, { create: false });
          targetDirHandle = dirHandle;
          newPath.push({ name: dirName, handle: dirHandle });
        } catch (err) {
          console.error(`Directory not found: ${dirName}`, err);
          alert(`Directory not found: ${dirName}`);
          return;
        }
      }

      // Update current context to the target directory
      currentDirHandle = targetDirHandle;
      currentPath = newPath;
    }

    // Check if the target is a directory or file
    if (currentDirHandle) {
      // First try to see if it's a directory
      try {
        const dirHandle = await currentDirHandle.getDirectoryHandle(actualFilename, {
          create: false,
        });

        // It's a directory - navigate to it
        currentDirHandle = dirHandle;
        currentPath.push({ name: actualFilename, handle: dirHandle });

        // Close current file
        currentFileHandle = null;
        currentFilename = '';
        await initEditor('', 'untitled');

        updateBreadcrumb();
        addToHistory();
        await showFilePicker(dirHandle);
        return;
      } catch {
        // Not a directory, try as file
        try {
          fileHandle = await currentDirHandle.getFileHandle(actualFilename, { create: false });
          fileExists = true;
        } catch {
          // File doesn't exist, create it
          fileHandle = await currentDirHandle.getFileHandle(actualFilename, { create: true });
        }
      }
    } else {
      fileHandle = await FileSystemAdapter.saveFilePicker(actualFilename);
      if (!fileHandle) {
        currentFileHandle = previousFileHandle;
        currentFilename = previousFilename;
        currentDirHandle = previousDirHandle;
        currentPath = previousPath;
        isDirty = wasDirty;
        updateBreadcrumb();
        return;
      }
    }

    // Set as current file
    currentFileHandle = fileHandle;
    currentFilename = actualFilename;

    // If file exists, open it instead of creating new
    if (fileExists) {
      const content = await FileSystemAdapter.readFile(fileHandle);
      await initEditor(content, actualFilename);
      isDirty = false;
      originalContent = content;
    } else {
      await FileSystemAdapter.writeFile(fileHandle, '');
      await initEditor('', actualFilename);
      isDirty = false;
      originalContent = '';
    }

    updateBreadcrumb();
    updateLogoState();
    addToHistory();
    hideFilePicker();

    // Focus the editor after DOM updates complete
    focusManager.focusEditor({ delay: 100, reason: 'new-file' });
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Error creating/opening file:', err);
      alert('Error: ' + err.message);
    }
    // Restore previous state
    currentFileHandle = previousFileHandle;
    currentFilename = previousFilename;
    currentDirHandle = previousDirHandle;
    currentPath = previousPath;
    isDirty = wasDirty;
    updateBreadcrumb();
  }
};

// New file
const newFile = async () => {
  if (!isFileSystemAccessSupported()) {
    alert(
      'File System Access API is not supported in this browser. Please use Chrome, Edge, or a recent version of Safari.'
    );
    return;
  }

  // Store current state in case we need to restore
  const previousFileHandle = currentFileHandle;
  const previousFilename = currentFilename;
  const wasDirty = isDirty;

  if (editorView && editorView.state.doc.toString().length > 0 && isDirty) {
    const confirm = window.confirm('Current file has unsaved changes. Create new file anyway?');
    if (!confirm) return;
  }

  // Get existing files in current directory for autocomplete
  let existingFiles = [];
  if (currentDirHandle) {
    try {
      const entries = await FileSystemAdapter.listDirectory(currentDirHandle);
      existingFiles = entries.filter((entry) => entry.kind === 'file').map((entry) => entry.name);
    } catch (err) {
      console.error('Error listing directory:', err);
    }
  }

  // Show inline input for filename with autocomplete
  const filename = await showFilenameInput(existingFiles);

  if (!filename) {
    // User cancelled - restore previous state
    currentFileHandle = previousFileHandle;
    currentFilename = previousFilename;
    isDirty = wasDirty;
    updateBreadcrumb();
    return;
  }

  // Use helper to create or open the file
  await createOrOpenFile(filename);
};

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
  if (editorView || editorManager) {
    const currentContent = getEditorContent();

    // Save editor state before destroying
    let scrollTop = 0;
    let scrollLeft = 0;
    let currentMode = null;

    if (editorView) {
      const scroller = editorView.scrollDOM;
      scrollTop = scroller.scrollTop;
      scrollLeft = scroller.scrollLeft;
    } else if (editorManager) {
      scrollTop = editorManager.getScrollPosition();
      currentMode = editorManager.getMode(); // Preserve current mode for markdown
    }

    // Temporarily set isRestoringSession to preserve the mode
    const wasRestoringSession = isRestoringSession;
    if (currentMode) {
      isRestoringSession = true;
      localStorage.setItem(`mode_${currentFilename}`, currentMode);
    }

    await initEditor(currentContent, currentFilename);

    // Restore previous session state
    isRestoringSession = wasRestoringSession;

    // Restore scroll position
    setTimeout(() => {
      if (editorView) {
        editorView.scrollDOM.scrollTop = scrollTop;
        editorView.scrollDOM.scrollLeft = scrollLeft;
      } else if (editorManager) {
        editorManager.setScrollPosition(scrollTop);
      }
      // Restore focus after editor reinit
      focusManager.focusEditor({ reason: 'theme-toggle' });
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
    if (editorView || editorManager) {
      const currentContent = getEditorContent();

      // Save editor state before destroying
      let scrollTop = 0;
      let scrollLeft = 0;
      let currentMode = null;

      if (editorView) {
        const scroller = editorView.scrollDOM;
        scrollTop = scroller.scrollTop;
        scrollLeft = scroller.scrollLeft;
      } else if (editorManager) {
        scrollTop = editorManager.getScrollPosition();
        currentMode = editorManager.getMode();
      }

      // Temporarily set isRestoringSession to preserve the mode
      const wasRestoringSession = isRestoringSession;
      if (currentMode) {
        isRestoringSession = true;
        localStorage.setItem(`mode_${currentFilename}`, currentMode);
      }

      await initEditor(currentContent, currentFilename);

      // Restore previous session state
      isRestoringSession = wasRestoringSession;

      // Restore scroll position
      setTimeout(() => {
        if (editorView) {
          editorView.scrollDOM.scrollTop = scrollTop;
          editorView.scrollDOM.scrollLeft = scrollLeft;
        } else if (editorManager) {
          editorManager.setScrollPosition(scrollTop);
        }
      }, 0);
    }
  }
});

// Event listeners
document.getElementById('new-btn').addEventListener('click', () => {
  focusManager.saveFocusState();
  newFile();
});
document.getElementById('back-btn').addEventListener('click', () => {
  // Save current editor state to history before navigating
  if (currentFileHandle && navigationHistory[historyIndex]) {
    const editorState = focusManager._captureEditorState();
    if (editorState) {
      navigationHistory[historyIndex].editorState = editorState;
    }
  }
  goBack();
});
document.getElementById('forward-btn').addEventListener('click', () => {
  // Save current editor state to history before navigating
  if (currentFileHandle && navigationHistory[historyIndex]) {
    const editorState = focusManager._captureEditorState();
    if (editorState) {
      navigationHistory[historyIndex].editorState = editorState;
    }
  }
  goForward();
});
document.getElementById('folder-up-btn').addEventListener('click', () => {
  focusManager.saveFocusState();
  goFolderUp();
});
// Helper function to animate autosave label
const animateAutosaveLabel = (shouldHide) => {
  const label = document.getElementById('autosave-label');

  if (shouldHide) {
    // Linger for 2 seconds, then fade out
    setTimeout(() => {
      label.classList.add('fade-out');
      // After fade animation completes, hide completely
      setTimeout(() => {
        label.classList.add('hidden');
      }, 500); // Match CSS transition duration
    }, 2000);
  } else {
    // Show label immediately when unchecked
    label.classList.remove('hidden', 'fade-out');
  }
};

document.getElementById('autosave-checkbox').addEventListener('change', (e) => {
  toggleAutosave(e.target.checked);
  animateAutosaveLabel(e.target.checked);
});
document.getElementById('rich-toggle-btn').addEventListener('click', () => {
  console.log('[RichMode] Rich toggle button clicked');
  focusManager.saveFocusState();
  toggleRichMode();
});
document.getElementById('dark-mode-toggle').addEventListener('click', () => {
  focusManager.saveFocusState();
  toggleDarkMode();
});

// Header click to show file picker
document.querySelector('header').addEventListener('click', (e) => {
  // Only handle if a folder is currently open
  if (!currentDirHandle) return;

  // Don't trigger if clicking on interactive elements
  if (e.target.closest('button') || e.target.closest('input') || e.target.closest('label')) {
    return;
  }

  // Show the file picker (same behavior as clicking filename)
  focusManager.saveFocusState();
  showFilePicker(currentDirHandle);
});

// Browser back/forward button listener
window.addEventListener('popstate', async (event) => {
  // If there's no state or it's not from our app, let the browser handle it
  if (!event.state || !event.state.appHistory) {
    return;
  }

  const targetIndex = event.state.historyIndex;

  // Set flag to prevent addToHistory from creating duplicate entries
  isPopStateNavigation = true;

  try {
    // Navigate to the target index
    if (targetIndex < historyIndex) {
      // Going back
      while (historyIndex > targetIndex && historyIndex > 0) {
        await goBack();
      }
    } else if (targetIndex > historyIndex) {
      // Going forward
      while (historyIndex < targetIndex && historyIndex < navigationHistory.length - 1) {
        await goForward();
      }
    }
  } finally {
    // Always reset the flag
    isPopStateNavigation = false;
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
  if (!currentDirHandle) {
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
  if (focusManager.hasEditorFocus()) {
    return;
  }

  // Focus the appropriate editor
  e.preventDefault();
  focusManager.focusEditor({ reason: 'enter-key' });
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
  if (focusManager.hasEditorFocus()) {
    // Blur the active element (editor) and show search box
    e.preventDefault();
    document.activeElement.blur();

    // Show search box if we have a directory context
    if (currentDirHandle) {
      await quickFileCreate('');
      // Select all text in the input
      const input = document.querySelector('.breadcrumb-input');
      if (input) {
        input.select();
      }
    }
  }
});

// Breadcrumb click handler to show file picker
document.addEventListener('DOMContentLoaded', () => {
  const breadcrumb = document.getElementById('breadcrumb');
  if (breadcrumb) {
    breadcrumb.addEventListener('click', (e) => {
      // Only handle if not clicking on a specific breadcrumb item or input
      if (
        !e.target.classList.contains('breadcrumb-item') &&
        !e.target.classList.contains('breadcrumb-input') &&
        !e.target.closest('.autocomplete-container') &&
        currentDirHandle
      ) {
        showFilePicker(currentDirHandle);
      }
    });
  }
});

// Visual blur effect management - toggle blur class on editor based on focus
function updateEditorBlurState() {
  const editorElement = document.getElementById('editor');
  if (!editorElement) return;

  if (focusManager.hasEditorFocus()) {
    editorElement.classList.remove('blurred');
  } else {
    editorElement.classList.add('blurred');
  }
}

// Monitor focus changes to update blur state
document.addEventListener('focusin', () => {
  updateEditorBlurState();
});

document.addEventListener('focusout', () => {
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
    focusManager.saveFocusState();
    hideFilePicker();
    openFolder();
  });

  document.getElementById('new-folder-btn').addEventListener('click', () => {
    // Clear saved folder name and show welcome prompt
    focusManager.saveFocusState();
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
    focusManager.saveFocusState();
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

  // Start autosave (enabled by default)
  if (autosaveEnabled) {
    startAutosave();
    // Animate the autosave label to hide after initial load
    animateAutosaveLabel(true);
  }

  // Set initial history state
  if (!window.history.state || !window.history.state.appHistory) {
    window.history.replaceState(
      {
        historyIndex: historyIndex,
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
    await cleanupTrash();
  });

  // Add window focus listener for multi-instance detection
  window.addEventListener('focus', async () => {
    // Check for version updates when tab regains focus
    performVersionCheck();

    if (!currentDirHandle || !currentFileHandle) return;

    try {
      // Reload session file to check for external changes
      const sessionData = await loadSessionFile(currentDirHandle);
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
