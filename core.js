// Core functionality for hotNote - exported for testing

// Constants
export const TEMP_STORAGE_PREFIX = 'hotnote_temp_';

// Get file path key for storage
export const getFilePathKey = (currentPath, currentFilename) => {
    if (!currentFilename) return null;
    const pathParts = currentPath.map(p => p.name);
    pathParts.push(currentFilename);
    return pathParts.join('/');
};

// Save temp changes
export const saveTempChanges = (key, content) => {
    if (!key || !content) return;
    localStorage.setItem(TEMP_STORAGE_PREFIX + key, content);
};

// Load temp changes
export const loadTempChanges = (key) => {
    return localStorage.getItem(TEMP_STORAGE_PREFIX + key);
};

// Clear temp changes
export const clearTempChanges = (key) => {
    localStorage.removeItem(TEMP_STORAGE_PREFIX + key);
};

// Check if file has temp changes
export const hasTempChanges = (key) => {
    return localStorage.getItem(TEMP_STORAGE_PREFIX + key) !== null;
};

// Language detection based on file extension
export const getLanguageExtension = (filename, languageModules) => {
    // Check for special filenames without extensions
    const basename = filename.split('/').pop().toLowerCase();
    if (basename === 'jenkinsfile') {
        return languageModules.groovy ? languageModules.groovy() : [];
    }
    if (basename === '.gitignore' || basename.endsWith('ignore')) {
        return languageModules.shell ? languageModules.shell() : [];
    }

    const ext = filename.split('.').pop().toLowerCase();
    const langMap = {
        js: languageModules.javascript(),
        jsx: languageModules.javascript({ jsx: true }),
        ts: languageModules.javascript({ typescript: true }),
        tsx: languageModules.javascript({ typescript: true, jsx: true }),
        py: languageModules.python(),
        go: languageModules.go(),
        rs: languageModules.rust ? languageModules.rust() : [],
        php: languageModules.php ? languageModules.php() : [],
        java: languageModules.java ? languageModules.java() : [],
        groovy: languageModules.groovy ? languageModules.groovy() : [],
        c: languageModules.cpp ? languageModules.cpp() : [],
        cpp: languageModules.cpp ? languageModules.cpp() : [],
        cc: languageModules.cpp ? languageModules.cpp() : [],
        cxx: languageModules.cpp ? languageModules.cpp() : [],
        h: languageModules.cpp ? languageModules.cpp() : [],
        hpp: languageModules.cpp ? languageModules.cpp() : [],
        xml: languageModules.xml ? languageModules.xml() : [],
        yaml: languageModules.yaml ? languageModules.yaml() : [],
        yml: languageModules.yaml ? languageModules.yaml() : [],
        sh: languageModules.shell ? languageModules.shell() : [],
        bash: languageModules.shell ? languageModules.shell() : [],
        rb: languageModules.ruby ? languageModules.ruby() : [],
        html: languageModules.html(),
        htm: languageModules.html(),
        css: languageModules.css(),
        scss: languageModules.css(),
        json: languageModules.json(),
        md: languageModules.markdown(),
        markdown: languageModules.markdown(),
    };
    return langMap[ext] || [];
};

// Check if File System Access API is supported
export const isFileSystemAccessSupported = () => {
    return 'showOpenFilePicker' in window && 'showDirectoryPicker' in window;
};

// Build breadcrumb path
export const buildBreadcrumbPath = (currentPath, currentFilename, currentFileHandle) => {
    const segments = [];

    if (currentPath.length === 0) {
        segments.push({ name: currentFilename, isFile: true, isLast: true });
    } else {
        currentPath.forEach((segment, index) => {
            segments.push({
                name: segment.name,
                isFile: false,
                isLast: false,
                index
            });
        });

        if (currentFileHandle) {
            segments.push({ name: currentFilename, isFile: true, isLast: true });
        }
    }

    return segments;
};

// Sort directory entries (directories first, then files, alphabetically)
export const sortDirectoryEntries = (entries) => {
    return entries.sort((a, b) => {
        if (a.kind === 'directory' && b.kind === 'file') return -1;
        if (a.kind === 'file' && b.kind === 'directory') return 1;
        return a.name.localeCompare(b.name);
    });
};

// Validate navigation history index
export const canNavigateBack = (historyIndex) => {
    return historyIndex > 0;
};

export const canNavigateForward = (historyIndex, historyLength) => {
    return historyIndex < historyLength - 1;
};

// Check if can navigate up
export const canNavigateUp = (currentPath) => {
    return currentPath.length > 0;
};
