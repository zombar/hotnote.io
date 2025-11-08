import { EditorView, keymap, lineNumbers, placeholder } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { syntaxHighlighting, HighlightStyle, StreamLanguage } from '@codemirror/language';
import { tags } from '@lezer/highlight';
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
import {
    initMarkdownEditor,
    destroyMarkdownEditor,
    getMarkdownContent,
    isMarkdownEditorActive
} from './markdown-editor.js';

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
                    accept: { 'text/*': ['.txt', '.md', '.js', '.py', '.html', '.css', '.json'] }
                }
            ],
            suggestedName: suggestedName
        });
    },

    // Get file metadata (name, etc.)
    async getFileMetadata(fileHandle) {
        const file = await fileHandle.getFile();
        return {
            name: file.name
        };
    },

    // Navigate to subdirectory
    async navigateToSubdirectory(parentHandle, name) {
        return await parentHandle.getDirectoryHandle(name);
    }
};

// App state
let currentFileHandle = null;
let currentFilename = 'untitled';
let currentDirHandle = null;
let currentPath = []; // Array of {name, handle} objects
let editorView = null;
let isRichMode = false; // Track if rich markdown editor is active

// Navigation history
let navigationHistory = [];
let historyIndex = -1;

// Autosave
let autosaveEnabled = false;
let autosaveInterval = null;
let isDirty = false;

// Original file content (for detecting undo to original state)
let originalContent = '';

// Temp storage for unsaved changes
const TEMP_STORAGE_PREFIX = 'hotnote_temp_';

// Get file path key for storage
const getFilePathKey = () => {
    if (!currentFileHandle) return null;
    const pathParts = currentPath.map(p => p.name);
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
    { tag: tags.keyword, color: '#a65580', fontWeight: '500' },          // darker muted pink
    { tag: tags.operator, color: '#7a65ad' },                             // darker muted purple
    { tag: tags.variableName, color: '#5a9cb8' },                         // darker muted cyan
    { tag: tags.string, color: '#5a9cb8' },                               // darker muted cyan
    { tag: tags.number, color: '#7a65ad' },                               // darker muted purple
    { tag: tags.bool, color: '#7a65ad' },                                 // darker muted purple
    { tag: tags.comment, color: '#999999', fontStyle: 'italic' },         // gray
    { tag: tags.tagName, color: '#5a9cb8' },                              // darker muted cyan
    { tag: tags.attributeName, color: '#a65580' },                        // darker muted pink
    { tag: tags.propertyName, color: '#5a9cb8' },                         // darker muted cyan
    { tag: tags.function(tags.variableName), color: '#5a9cb8', fontWeight: '500' }, // darker muted cyan
    { tag: tags.className, color: '#a65580' },                            // darker muted pink
    { tag: tags.typeName, color: '#a65580' },                             // darker muted pink
    { tag: tags.regexp, color: '#7a65ad' },                               // darker muted purple
    { tag: tags.escape, color: '#a65580' },                               // darker muted pink
    { tag: tags.meta, color: '#5a9cb8' },                                 // darker muted cyan
    { tag: tags.constant(tags.variableName), color: '#7a65ad' },          // darker muted purple
]);

// Custom syntax highlighting using brand colors (dark mode - lighter muted)
const brandHighlightStyleDark = HighlightStyle.define([
    { tag: tags.keyword, color: '#e8bcd4', fontWeight: '500' },          // lighter muted pink
    { tag: tags.operator, color: '#c8bce8' },                             // lighter muted purple
    { tag: tags.variableName, color: '#b8e5f2' },                         // lighter muted cyan
    { tag: tags.string, color: '#b8e5f2' },                               // lighter muted cyan
    { tag: tags.number, color: '#c8bce8' },                               // lighter muted purple
    { tag: tags.bool, color: '#c8bce8' },                                 // lighter muted purple
    { tag: tags.comment, color: '#888888', fontStyle: 'italic' },         // gray
    { tag: tags.tagName, color: '#b8e5f2' },                              // lighter muted cyan
    { tag: tags.attributeName, color: '#e8bcd4' },                        // lighter muted pink
    { tag: tags.propertyName, color: '#b8e5f2' },                         // lighter muted cyan
    { tag: tags.function(tags.variableName), color: '#b8e5f2', fontWeight: '500' }, // lighter muted cyan
    { tag: tags.className, color: '#e8bcd4' },                            // lighter muted pink
    { tag: tags.typeName, color: '#e8bcd4' },                             // lighter muted pink
    { tag: tags.regexp, color: '#c8bce8' },                               // lighter muted purple
    { tag: tags.escape, color: '#e8bcd4' },                               // lighter muted pink
    { tag: tags.meta, color: '#b8e5f2' },                                 // lighter muted cyan
    { tag: tags.constant(tags.variableName), color: '#c8bce8' },          // lighter muted purple
]);

// Language detection based on file extension
const getLanguageExtension = (filename) => {
    // Check for special filenames without extensions
    const basename = filename.split('/').pop().toLowerCase();

    // Bazel files (use Python/Starlark syntax)
    if (basename === 'build' || basename === 'build.bazel' || basename === 'workspace' || basename === 'workspace.bazel') {
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
        bzl: StreamLanguage.define(pythonMode),  // Bazel/Starlark files
        conf: StreamLanguage.define(nginxMode),  // Nginx config files
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
    if (isRichMode && isMarkdownEditorActive()) {
        return getMarkdownContent();
    } else if (editorView) {
        return editorView.state.doc.toString();
    }
    return '';
};

// Initialize editor (CodeMirror or Milkdown based on file type and mode)
const initEditor = async (initialContent = '', filename = 'untitled') => {
    // Store original content for undo detection
    originalContent = initialContent;

    // Clear both editors first
    if (editorView) {
        editorView.destroy();
        editorView = null;
    }
    if (isMarkdownEditorActive()) {
        destroyMarkdownEditor();
    }

    // Determine if we should use rich markdown editor
    const shouldUseRichEditor = isMarkdownFile(filename) && isRichMode;

    if (shouldUseRichEditor) {
        // Initialize Milkdown for markdown files
        const editorContainer = document.getElementById('editor');
        editorContainer.innerHTML = ''; // Clear container

        try {
            await initMarkdownEditor(editorContainer, initialContent, (content) => {
                // Handle content changes
                const currentContent = content;

                if (currentContent === originalContent) {
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
            });
        } catch (error) {
            console.error('Failed to initialize Milkdown, falling back to CodeMirror:', error);
            // Fall back to CodeMirror if Milkdown fails
            await initCodeMirrorEditor(initialContent, filename);
        }
    } else {
        // Initialize CodeMirror for all other files
        await initCodeMirrorEditor(initialContent, filename);
    }

    isDirty = false;
    updateRichToggleButton();
};

// Initialize CodeMirror editor
const initCodeMirrorEditor = async (initialContent = '', filename = 'untitled') => {
    // Use appropriate highlight style based on current theme
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const highlightStyle = isDark ? brandHighlightStyleDark : brandHighlightStyle;

    // Check if we have a file open
    const hasFileOpen = currentFileHandle !== null;

    const extensions = [
        lineNumbers(),
        EditorView.lineWrapping,
        syntaxHighlighting(highlightStyle),
        keymap.of([
            { key: 'Mod-s', run: () => { saveFile(); return true; } },
            { key: 'Mod-Shift-o', run: () => { openFolder(); return true; } },
            { key: 'Mod-n', run: () => { newFile(); return true; } },
        ]),
        EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                const currentContent = update.state.doc.toString();

                // Check if we've undone back to original content
                if (currentContent === originalContent) {
                    if (isDirty) {
                        isDirty = false;
                        // Clear temp storage
                        const key = getFilePathKey();
                        if (key) {
                            clearTempChanges(key);
                        }
                        updateBreadcrumb();
                    }
                } else {
                    // Content differs from original
                    if (!isDirty) {
                        isDirty = true;
                        updateBreadcrumb();
                    }
                }
            }
        }),
    ];

    // If no file is open, make editor read-only and show placeholder
    if (!hasFileOpen) {
        extensions.push(EditorState.readOnly.of(true));
        extensions.push(placeholder('Open a file or create a new one to start editing (Cmd/Ctrl+Shift+O or Cmd/Ctrl+N)'));
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
        breadcrumb.appendChild(item);
    } else {
        // Show full path
        currentPath.forEach((segment, index) => {
            const item = document.createElement('span');
            item.className = 'breadcrumb-item';
            item.textContent = segment.name;
            item.dataset.index = index;

            // Make all folder items clickable (even the last one)
            item.addEventListener('click', () => navigateToPathIndex(index));

            breadcrumb.appendChild(item);
        });

        // Add current file if opened
        if (currentFileHandle) {
            const fileItem = document.createElement('span');
            fileItem.className = 'breadcrumb-item';
            if (isDirty) {
                fileItem.classList.add('has-changes');
            }
            fileItem.textContent = currentFilename;
            breadcrumb.appendChild(fileItem);
        }
    }

    document.title = currentPath.length > 0
        ? `${currentPath.map(p => p.name).join('/')}${currentFileHandle ? '/' + currentFilename : ''}${isDirty ? ' •' : ''} - hotNote`
        : `${currentFilename}${isDirty ? ' •' : ''} - hotNote`;
};

// Update rich toggle button visibility and state
const updateRichToggleButton = () => {
    const richToggleBtn = document.getElementById('rich-toggle-btn');

    if (isMarkdownFile(currentFilename)) {
        richToggleBtn.classList.remove('hidden');
        richToggleBtn.textContent = isRichMode ? 'source' : 'rich';
        richToggleBtn.title = isRichMode ? 'Switch to source mode' : 'Switch to rich mode';
    } else {
        richToggleBtn.classList.add('hidden');
    }
};

// Toggle between rich and source mode for markdown files
const toggleRichMode = async () => {
    if (!isMarkdownFile(currentFilename)) return;

    // Save current content before switching
    const currentContent = getEditorContent();

    // Toggle mode
    isRichMode = !isRichMode;

    // Reinitialize editor with new mode
    await initEditor(currentContent, currentFilename);

    updateRichToggleButton();
};

// Navigate to a specific path index (breadcrumb click)
const navigateToPathIndex = async (index) => {
    if (index >= currentPath.length) return;

    // Save temp changes if file is dirty
    if (isDirty && currentFileHandle) {
        saveTempChanges();
    }

    // Truncate path to the clicked index
    currentPath = currentPath.slice(0, index + 1);
    currentDirHandle = currentPath[currentPath.length - 1].handle;

    // Close current file
    currentFileHandle = null;
    currentFilename = '';
    await initEditor('', 'untitled');

    // Add to navigation history
    addToHistory();

    // Show file picker for this directory
    await showFilePicker(currentDirHandle);
    updateBreadcrumb();
};

// Add current state to navigation history
const addToHistory = () => {
    // Remove any forward history when navigating to a new location
    navigationHistory = navigationHistory.slice(0, historyIndex + 1);

    navigationHistory.push({
        path: [...currentPath],
        dirHandle: currentDirHandle,
        fileHandle: currentFileHandle,
        filename: currentFilename,
    });

    historyIndex = navigationHistory.length - 1;
    updateNavigationButtons();
};

// Update back/forward button states
const updateNavigationButtons = () => {
    document.getElementById('back-btn').disabled = historyIndex <= 0;
    document.getElementById('forward-btn').disabled = historyIndex >= navigationHistory.length - 1;
    document.getElementById('folder-up-btn').disabled = currentPath.length === 0;
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

        // Set rich mode for markdown files
        if (isMarkdownFile(currentFilename)) {
            isRichMode = true;
        } else {
            isRichMode = false;
        }

        // Initialize with file content (sets originalContent)
        await initEditor(fileContent, currentFilename);

        // If we have temp changes, apply them
        if (tempContent !== null) {
            if (editorView) {
                editorView.dispatch({
                    changes: { from: 0, to: editorView.state.doc.length, insert: tempContent }
                });
            } else if (isRichMode && isMarkdownFile(currentFilename)) {
                await initEditor(tempContent, currentFilename);
            }
            isDirty = true;
        }
    } else {
        await initEditor('', 'untitled');
    }

    if (currentDirHandle) {
        await showFilePicker(currentDirHandle);
    }

    updateBreadcrumb();
    updateNavigationButtons();
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

        // Set rich mode for markdown files
        if (isMarkdownFile(currentFilename)) {
            isRichMode = true;
        } else {
            isRichMode = false;
        }

        // Initialize with file content (sets originalContent)
        await initEditor(fileContent, currentFilename);

        // If we have temp changes, apply them
        if (tempContent !== null) {
            if (editorView) {
                editorView.dispatch({
                    changes: { from: 0, to: editorView.state.doc.length, insert: tempContent }
                });
            } else if (isRichMode && isMarkdownFile(currentFilename)) {
                await initEditor(tempContent, currentFilename);
            }
            isDirty = true;
        }
    } else {
        await initEditor('', 'untitled');
    }

    if (currentDirHandle) {
        await showFilePicker(currentDirHandle);
    }

    updateBreadcrumb();
    updateNavigationButtons();
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
        alert('File System Access API is not supported in this browser. Please use Chrome, Edge, or a recent version of Safari.');
        return;
    }

    try {
        // Save temp changes if file is dirty
        if (isDirty && currentFileHandle) {
            saveTempChanges();
        }

        const dirHandle = await FileSystemAdapter.openDirectory();
        if (!dirHandle) return; // User cancelled

        currentDirHandle = dirHandle;
        currentPath = [{ name: dirHandle.name, handle: dirHandle }];
        currentFileHandle = null;
        currentFilename = '';
        await initEditor('', 'untitled');

        addToHistory();
        await showFilePicker(dirHandle);
        updateBreadcrumb();
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Error opening folder:', err);
            alert('Error opening folder: ' + err.message);
        }
    }
};

// Show file picker for a directory
const showFilePicker = async (dirHandle) => {
    const picker = document.getElementById('file-picker');
    picker.classList.remove('hidden');

    // Create header
    picker.innerHTML = `
        <div class="file-picker-header">
            <span class="file-picker-path">${currentPath.map(p => p.name).join(' › ')}</span>
            <button class="file-picker-close" onclick="hideFilePicker()">close</button>
        </div>
        <div class="file-list" id="file-list"></div>
    `;

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
        icon.textContent = entry.kind === 'directory' ? '📁' : '📄';

        const name = document.createElement('span');
        name.className = 'file-item-name';
        name.textContent = entry.name;

        // Check if file has temp changes
        if (entry.kind === 'file') {
            const pathParts = currentPath.map(p => p.name);
            pathParts.push(entry.name);
            const filePathKey = pathParts.join('/');
            if (hasTempChanges(filePathKey)) {
                item.classList.add('has-unsaved-changes');
            }
        }

        item.appendChild(icon);
        item.appendChild(name);

        item.addEventListener('click', async () => {
            if (entry.kind === 'directory') {
                await navigateToDirectory(entry);
            } else {
                await openFileFromPicker(entry);
            }
        });

        fileList.appendChild(item);
    }
};

// Hide file picker
window.hideFilePicker = () => {
    document.getElementById('file-picker').classList.add('hidden');
};

// Navigate to a subdirectory
const navigateToDirectory = async (dirHandle) => {
    // Save temp changes if file is dirty
    if (isDirty && currentFileHandle) {
        saveTempChanges();
    }

    currentPath.push({ name: dirHandle.name, handle: dirHandle });
    currentDirHandle = dirHandle;

    // Close current file
    currentFileHandle = null;
    currentFilename = '';
    await initEditor('', 'untitled');

    addToHistory();
    await showFilePicker(dirHandle);
    updateBreadcrumb();
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

        // Set rich mode to true for markdown files by default
        if (isMarkdownFile(fileHandle.name)) {
            isRichMode = true;
        } else {
            isRichMode = false;
        }

        // Always load the original file content from disk
        const fileContent = await FileSystemAdapter.readFile(fileHandle);

        // Check for temp changes
        const pathKey = getFilePathKey();
        const tempContent = loadTempChanges(pathKey);

        let content;
        if (tempContent !== null) {
            // Restore temp changes but remember the file content as original
            content = tempContent;
            isDirty = true;
        } else {
            // Load from file
            content = fileContent;
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
                    changes: { from: 0, to: editorView.state.doc.length, insert: tempContent }
                });
            }
            // Note: For Milkdown, we pass tempContent directly to initEditor above
            // So we need to reinitialize with tempContent for Milkdown
            if (isRichMode && isMarkdownFile(file.name)) {
                await initEditor(tempContent, file.name);
            }
            isDirty = true;
        }

        updateBreadcrumb();
        hideFilePicker();

        addToHistory();
    } catch (err) {
        console.error('Error opening file:', err);
        alert('Error opening file: ' + err.message);
    }
};


// Save file
const saveFile = async () => {
    if (!isFileSystemAccessSupported()) {
        alert('File System Access API is not supported in this browser. Please use Chrome, Edge, or a recent version of Safari.');
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

// Show inline filename input
const showFilenameInput = () => {
    return new Promise((resolve) => {
        const breadcrumb = document.getElementById('breadcrumb');
        breadcrumb.innerHTML = '';

        // Rebuild path if exists
        if (currentPath.length > 0) {
            currentPath.forEach((segment, index) => {
                const item = document.createElement('span');
                item.className = 'breadcrumb-item';
                item.textContent = segment.name;
                breadcrumb.appendChild(item);
            });
        }

        // Add input where filename would normally appear
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'breadcrumb-input';
        input.placeholder = 'filename';
        input.value = '';

        let resolved = false;

        const handleSubmit = () => {
            if (resolved) return;
            resolved = true;

            const filename = input.value.trim();
            // Validate filename
            if (!filename) {
                resolve(null);
                return;
            }
            // Check for invalid characters
            const invalidChars = /[\/\\:*?"<>|]/;
            if (invalidChars.test(filename)) {
                alert('Invalid filename. Please avoid using / \\ : * ? " < > |');
                resolve(null);
                return;
            }
            resolve(filename);
        };

        const handleCancel = () => {
            if (resolved) return;
            resolved = true;
            resolve(null);
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            }
        });

        input.addEventListener('blur', handleCancel);

        breadcrumb.appendChild(input);
        input.focus();
    });
};

// New file
const newFile = async () => {
    if (!isFileSystemAccessSupported()) {
        alert('File System Access API is not supported in this browser. Please use Chrome, Edge, or a recent version of Safari.');
        return;
    }

    // Store current state in case we need to restore
    const previousFileHandle = currentFileHandle;
    const previousFilename = currentFilename;
    const previousContent = getEditorContent();
    const wasDirty = isDirty;

    if (editorView && editorView.state.doc.toString().length > 0 && isDirty) {
        const confirm = window.confirm('Current file has unsaved changes. Create new file anyway?');
        if (!confirm) return;
    }

    // Show inline input for filename
    const filename = await showFilenameInput();

    if (!filename) {
        // User cancelled - restore previous state
        currentFileHandle = previousFileHandle;
        currentFilename = previousFilename;
        isDirty = wasDirty;
        updateBreadcrumb();
        return;
    }

    try {
        let fileHandle;

        // If we're in a directory context, create the file there
        if (currentDirHandle) {
            // Create file in current directory
            fileHandle = await currentDirHandle.getFileHandle(filename, { create: true });
        } else {
            // No directory context, use save file picker
            fileHandle = await FileSystemAdapter.saveFilePicker(filename);
            if (!fileHandle) {
                // User cancelled
                currentFileHandle = previousFileHandle;
                currentFilename = previousFilename;
                isDirty = wasDirty;
                updateBreadcrumb();
                return;
            }
        }

        // Write empty content to create/touch the file
        await FileSystemAdapter.writeFile(fileHandle, '');

        // Set as current file
        currentFileHandle = fileHandle;
        currentFilename = filename;

        // Set rich mode for markdown files
        if (isMarkdownFile(filename)) {
            isRichMode = true;
        } else {
            isRichMode = false;
        }

        // Initialize editor with empty content
        await initEditor('', filename);

        // Mark as not dirty since we just created it empty
        isDirty = false;
        originalContent = '';

        // Update breadcrumb
        updateBreadcrumb();

        // Enable autosave for the new file
        if (!autosaveEnabled) {
            autosaveEnabled = true;
            document.getElementById('autosave-checkbox').checked = true;
            startAutosave();
        }

        // Add to navigation history
        addToHistory();

        // Refresh file picker if in directory context
        if (currentDirHandle) {
            await showFilePicker(currentDirHandle);
        }

        // Focus the editor
        if (editorView) {
            editorView.focus();
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('Error creating new file:', err);
            alert('Error creating new file: ' + err.message);
        }
        // Restore previous state on error
        currentFileHandle = previousFileHandle;
        currentFilename = previousFilename;
        isDirty = wasDirty;
        updateBreadcrumb();
    }
};

// Dark mode toggle
const toggleDarkMode = async () => {
    const html = document.documentElement;
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    const isDark = html.getAttribute('data-theme') === 'dark';

    if (isDark) {
        html.removeAttribute('data-theme');
        darkModeToggle.textContent = '○';
        darkModeToggle.title = 'Switch to dark mode';
        themeColorMeta.setAttribute('content', '#e91e8c');
        localStorage.setItem('theme', 'light');
    } else {
        html.setAttribute('data-theme', 'dark');
        darkModeToggle.textContent = '●';
        darkModeToggle.title = 'Switch to light mode';
        themeColorMeta.setAttribute('content', '#ff2d96');
        localStorage.setItem('theme', 'dark');
    }

    // Reinitialize editor with new theme colors
    if (editorView || isMarkdownEditorActive()) {
        const currentContent = getEditorContent();
        await initEditor(currentContent, currentFilename);
    }
};

// Initialize dark mode from localStorage
const initDarkMode = () => {
    const savedTheme = localStorage.getItem('theme');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');

    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        darkModeToggle.textContent = '●';
        darkModeToggle.title = 'Switch to light mode';
        themeColorMeta.setAttribute('content', '#ff2d96');
    }
};

// Event listeners
document.getElementById('new-btn').addEventListener('click', newFile);
document.getElementById('back-btn').addEventListener('click', goBack);
document.getElementById('forward-btn').addEventListener('click', goForward);
document.getElementById('folder-up-btn').addEventListener('click', goFolderUp);
document.getElementById('autosave-checkbox').addEventListener('change', (e) => {
    toggleAutosave(e.target.checked);
});
document.getElementById('rich-toggle-btn').addEventListener('click', toggleRichMode);
document.getElementById('dark-mode-toggle').addEventListener('click', toggleDarkMode);

// Initialize dark mode on load
initDarkMode();

// Register service worker for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
        console.log('Service worker registration failed:', err);
    });
}

// Show welcome prompt on first load
const showWelcomePrompt = () => {
    const picker = document.getElementById('file-picker');
    picker.classList.remove('hidden');

    picker.innerHTML = `
        <div class="file-picker-header">
            <span class="file-picker-path">Welcome to hotNote</span>
            <button class="file-picker-close" onclick="hideFilePicker()">close</button>
        </div>
        <div class="welcome-content">
            <p class="welcome-text">Open a folder to start browsing and editing files.</p>
            <div class="welcome-actions">
                <button id="welcome-folder-btn" class="welcome-btn">Open Folder</button>
            </div>
        </div>
    `;

    document.getElementById('welcome-folder-btn').addEventListener('click', () => {
        hideFilePicker();
        openFolder();
    });
};

// Initialize app
(async () => {
    // Initialize editor on load
    await initEditor();
    updateBreadcrumb();
    updateNavigationButtons();

    // Show welcome prompt on first load
    setTimeout(() => {
        showWelcomePrompt();
    }, 500);
})();
