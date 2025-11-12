# GitHub Repository Browser Feature

## Overview

The GitHub Repository Browser feature enables users to open, browse, and view files from GitHub repositories directly in Hotnote without requiring a local workspace. This read-only mode provides a seamless way to explore documentation, review code, and read markdown files from any public GitHub repository.

## Key Features

- **URL-based File Opening**: Open any GitHub file via URL parameter
- **Full Repository Navigation**: Browse the complete directory structure of any GitHub repository
- **Folder Navigation**: Click folders to navigate into directories, use '...' to go to parent directory
- **Related Files Section**: View and navigate folders and files in the current directory
- **README Discovery**: Automatically highlight and quick-access README files
- **Read-Only Mode**: Safe viewing without risk of accidental modifications
- **No Workspace Required**: Access files without local directory setup

## User Stories

### Story 1: Quick Documentation Review
> As a developer, I want to quickly view a project's README from a GitHub link so that I can understand the project without cloning the repository.

**Flow:**
1. User receives link: `https://hotnote.io/?gitreader=https://raw.githubusercontent.com/user/repo/main/README.md`
2. Hotnote opens with the README displayed in WYSIWYG mode
3. File picker shows the repository structure
4. User can browse other documentation files

### Story 2: Code Exploration
> As a code reviewer, I want to explore a repository's file structure so that I can understand the project organization.

**Flow:**
1. User opens any file from a GitHub repo
2. Related Files section displays folders and files in the current directory
3. Breadcrumb shows: `owner/repo@branch > folder > file.md`
4. User clicks a folder in Related Files to navigate into it
5. Breadcrumb updates to show new location: `owner/repo@branch > folder > subfolder`
6. Related Files shows contents of the subfolder
7. User clicks '...' to navigate back to parent directory
8. Breadcrumb updates to reflect parent path
9. User clicks different files to open and read them

## Technical Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────┐
│                     app.js (Entry Point)                │
│  - URL Parameter Detection                              │
│  - GitHub Mode Initialization                           │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
┌───────▼──────────┐      ┌────────▼─────────┐
│  GitHub Adapter  │      │   App State      │
│                  │      │                  │
│ - API Client     │◄─────┤ - isGitHubMode   │
│ - URL Parsing    │      │ - isReadOnly     │
│ - Rate Limiting  │      │ - githubRepo     │
│ - Caching        │      └──────────────────┘
└────────┬─────────┘
         │
┌────────▼─────────────────────────────────────┐
│        Virtual File Handle Layer             │
│  - GitHubFileHandle (wraps API responses)    │
│  - Compatible with FileSystemHandle interface│
└────────┬─────────────────────────────────────┘
         │
    ┌────┴────┐
    │         │
┌───▼────┐ ┌─▼──────────┐
│File    │ │ Breadcrumb │
│Picker  │ │ Navigation │
│        │ │            │
│- Tree  │ │- Repo Path │
│- Search│ │- Click Nav │
└────────┘ └────────────┘
```

### Core Modules

#### 1. GitHub Adapter (`src/fs/github-adapter.js`)

**Responsibilities:**
- Parse GitHub URLs (raw.githubusercontent.com, github.com)
- Interact with GitHub Contents API
- Implement rate limiting and caching
- Provide virtual file handles

**Key Methods:**
```javascript
class GitHubAdapter {
  constructor(owner, repo, branch = 'main')

  // Parse various GitHub URL formats
  static parseURL(url) → { owner, repo, branch, path }

  // List directory contents
  async listDirectory(path) → Array<VirtualFileHandle>

  // Fetch file content
  async readFile(path) → string

  // Get file metadata
  async getMetadata(path) → { size, lastModified, sha }

  // Check rate limit status
  async getRateLimit() → { remaining, limit, reset }
}
```

#### 2. Virtual File Handle (`src/fs/virtual-file-handle.js`)

**Purpose:** Provide a compatible interface with FileSystemHandle for GitHub files

```javascript
class GitHubFileHandle {
  constructor(owner, repo, branch, path, type, downloadUrl)

  // Properties
  name: string
  kind: 'file' | 'directory'
  path: string
  downloadUrl: string
  isRemote: true

  // Methods
  async getFile() → VirtualFile
  async queryPermission() → 'granted' (read-only)
}
```

#### 3. App State Extensions (`src/state/app-state.js`)

**New State Properties:**
```javascript
{
  // GitHub mode flag
  isGitHubMode: boolean,

  // Read-only mode (for all URL-loaded files)
  isReadOnly: boolean,

  // GitHub repository info
  githubRepo: {
    owner: string,
    repo: string,
    branch: string,
    rootPath: string
  },

  // Current directory path being viewed in GitHub mode
  githubCurrentPath: string,

  // GitHub adapter instance
  githubAdapter: GitHubAdapter | null,

  // Remote source URL
  remoteSource: string | null
}
```

### URL Parameter Specification

#### Supported URL Formats

**1. Raw GitHub Content URLs**
```
https://hotnote.io/?gitreader=https://raw.githubusercontent.com/OWNER/REPO/BRANCH/PATH
```

Example:
```
https://hotnote.io/?gitreader=https://raw.githubusercontent.com/zombar/hotnote.io/main/README.md
```

**2. GitHub Blob URLs (Optional/Future)**
```
https://hotnote.io/?gitreader=https://github.com/OWNER/REPO/blob/BRANCH/PATH
```

Example:
```
https://hotnote.io/?gitreader=https://github.com/zombar/hotnote.io/blob/main/README.md
```

#### URL Parsing Logic

```javascript
function parseGitHubURL(url) {
  // Raw GitHub pattern
  const rawPattern = /^https:\/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)\/(.+)$/;

  // GitHub blob pattern (optional)
  const blobPattern = /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)$/;

  const rawMatch = url.match(rawPattern);
  if (rawMatch) {
    return {
      owner: rawMatch[1],
      repo: rawMatch[2],
      branch: rawMatch[3],
      path: rawMatch[4]
    };
  }

  const blobMatch = url.match(blobPattern);
  if (blobMatch) {
    return {
      owner: blobMatch[1],
      repo: blobMatch[2],
      branch: blobMatch[3],
      path: blobMatch[4]
    };
  }

  throw new Error('Invalid GitHub URL format');
}
```

## File Browsing & Navigation

### Directory Listing

**GitHub API Endpoint:**
```
GET https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}
```

**Response Processing:**
```javascript
async function loadDirectory(path) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const response = await fetch(url);
  const items = await response.json();

  return items.map(item => ({
    name: item.name,
    type: item.type, // 'file' | 'dir'
    size: item.size,
    downloadUrl: item.download_url,
    path: item.path
  }));
}
```

### File Picker Integration

**Modifications to `src/ui/file-picker.js`:**

1. **Detect GitHub Mode:**
```javascript
const isGitHub = appState.isGitHubMode;
const adapter = isGitHub ? appState.githubAdapter : FileSystemAdapter;
```

2. **Disable Write Operations:**
```javascript
if (appState.isReadOnly) {
  // Hide delete button
  deleteBtn.style.display = 'none';

  // Hide create file/folder buttons
  createFileBtn.style.display = 'none';
  createFolderBtn.style.display = 'none';
}
```

3. **Add Loading States:**
```javascript
async function loadDirectoryWithLoading(path) {
  showLoadingSpinner();
  try {
    const items = await adapter.listDirectory(path);
    renderFileList(items);
  } catch (error) {
    showError('Failed to load directory: ' + error.message);
  } finally {
    hideLoadingSpinner();
  }
}
```

### Related Files Section (GitHub Mode)

**Overview:**
When in GitHub reader mode, the "Related Files" section (file picker) must display folder navigation similar to local mode, allowing users to browse the repository structure.

**Required Elements:**

1. **Parent Directory Row ('...')**
   - Show a `...` row at the top of the file list to navigate to parent directory
   - Only show when not at repository root
   - Clicking navigates up one level in the directory hierarchy

2. **Folder Rows**
   - Display all directories in the current path
   - Show folder icon (📁) to distinguish from files
   - Clicking a folder navigates into that directory and loads its contents
   - Sort folders before files (alphabetically within each group)

3. **File Rows**
   - Display all files in the current directory
   - Show file icon based on extension
   - Clicking opens the file in the editor

**Implementation:**
```javascript
async function renderRelatedFilesForGitHub(currentPath) {
  const items = await appState.githubAdapter.listDirectory(currentPath);
  const relatedFilesList = document.getElementById('related-files-list');

  relatedFilesList.innerHTML = '';

  // Add parent directory navigation if not at root
  if (currentPath !== '' && currentPath !== '/') {
    const parentRow = document.createElement('div');
    parentRow.className = 'file-row parent-dir';
    parentRow.innerHTML = `
      <span class="file-icon">📁</span>
      <span class="file-name">...</span>
    `;
    parentRow.addEventListener('click', () => {
      const parentPath = currentPath.split('/').slice(0, -1).join('/');
      navigateToDirectory(parentPath);
    });
    relatedFilesList.appendChild(parentRow);
  }

  // Separate and sort folders and files
  const folders = items.filter(item => item.type === 'dir');
  const files = items.filter(item => item.type === 'file');

  // Render folders first
  folders.forEach(folder => {
    const folderRow = document.createElement('div');
    folderRow.className = 'file-row folder';
    folderRow.innerHTML = `
      <span class="file-icon">📁</span>
      <span class="file-name">${folder.name}</span>
    `;
    folderRow.addEventListener('click', () => {
      navigateToDirectory(folder.path);
    });
    relatedFilesList.appendChild(folderRow);
  });

  // Render files
  files.forEach(file => {
    const fileRow = document.createElement('div');
    fileRow.className = 'file-row';
    fileRow.innerHTML = `
      <span class="file-icon">${getFileIcon(file.name)}</span>
      <span class="file-name">${file.name}</span>
    `;
    fileRow.addEventListener('click', () => {
      openGitHubFile(file.path);
    });
    relatedFilesList.appendChild(fileRow);
  });
}

async function navigateToDirectory(path) {
  // Update current path state
  appState.githubCurrentPath = path;

  // Update breadcrumb to reflect new location
  updateBreadcrumbForGitHub(path);

  // Re-render file list with new directory contents
  await renderRelatedFilesForGitHub(path);
}

// Example usage when clicking a folder:
// User clicks "src" folder → navigateToDirectory("src")
//   → Breadcrumb updates to "owner/repo@branch > src"
//   → Related Files shows contents of src folder
```

**Visual Hierarchy:**
```
Related Files
├── ... (parent directory - only if not at root)
├── 📁 docs (folder)
├── 📁 src (folder)
├── 📖 README.md (file - special icon for README)
├── 📄 package.json (file)
└── 📄 index.html (file)
```

**State Management:**
```javascript
// Add to app-state.js
{
  // ... existing GitHub state
  githubCurrentPath: string,  // Current directory path being viewed
}
```

**Integration with Breadcrumbs:**
The Related Files section and breadcrumb navigation are tightly integrated:
- Every folder navigation updates both the Related Files list AND the breadcrumb
- Clicking a breadcrumb segment navigates to that folder and updates Related Files
- Both components always stay synchronized via `appState.githubCurrentPath`

### README Discovery

**Auto-Detection Logic:**
```javascript
function highlightREADME(items) {
  return items.map(item => {
    if (item.name.toLowerCase() === 'readme.md') {
      item.isREADME = true;
      item.icon = '📖'; // Special icon
      item.priority = 1; // Sort to top
    }
    return item;
  });
}
```

**Quick README Access:**
- Add "View README" button when browsing directories
- Auto-open README when entering a new folder (optional)
- Highlight README files with special icon/styling

### Breadcrumb Navigation

**Dynamic Updates:**
The breadcrumb must update in real-time when navigating between folders in GitHub mode. This provides users with clear context about their current location in the repository.

**Format for GitHub Repos:**
```
owner/repo@branch > folder1 > folder2 > file.md
```

**Behavior:**
- When user clicks a folder: breadcrumb updates to show new path
- When user clicks '...' (parent): breadcrumb updates to show parent path
- When user clicks a file: breadcrumb updates to show full file path
- Each breadcrumb segment is clickable to navigate to that level

**Implementation:**
```javascript
function updateBreadcrumbForGitHub(currentPath) {
  const { owner, repo, branch } = appState.githubRepo;
  const pathParts = currentPath.split('/').filter(Boolean);

  breadcrumb.innerHTML = `
    <span class="repo-root clickable" data-path="">${owner}/${repo}@${branch}</span>
    ${pathParts.map((part, idx) => `
      <span class="separator">›</span>
      <span class="path-part clickable" data-path="${pathParts.slice(0, idx + 1).join('/')}">${part}</span>
    `).join('')}
  `;

  // Make breadcrumb parts clickable for navigation
  breadcrumb.querySelectorAll('.clickable').forEach(el => {
    el.addEventListener('click', () => {
      const path = el.getAttribute('data-path');
      navigateToDirectory(path);
    });
  });
}
```

**Examples:**
```
# At repository root
zombar/hotnote@main

# In docs folder
zombar/hotnote@main > docs

# In nested folder
zombar/hotnote@main > src > components

# Viewing a file
zombar/hotnote@main > src > index.js
```

## Read-Only Mode

### Visual Indicators

**1. Header Badge:**
```html
<div class="readonly-badge">
  🔒 Read-Only (GitHub)
</div>
```

**2. Status Bar:**
```html
<div class="status-bar">
  Source: github.com/owner/repo/blob/branch/file.md
</div>
```

**3. Disabled UI Elements:**
- Save button (grayed out)
- Autosave indicator (hidden)
- File deletion (hidden)
- File creation (hidden)

### Editor Configuration

**CodeMirror Read-Only:**
```javascript
if (appState.isReadOnly) {
  extensions.push(EditorState.readOnly.of(true));
  extensions.push(EditorView.editable.of(false));
}
```

**Milkdown Read-Only:**
```javascript
if (appState.isReadOnly) {
  editor.use(readonly.plugin());
}
```

### User Feedback

**Attempt to Save:**
```javascript
function handleSave() {
  if (appState.isReadOnly) {
    showNotification('This file is read-only. Open a local workspace to make edits.', 'warning');
    return;
  }
  // ... normal save logic
}
```

## GitHub API Integration

### Rate Limiting

**Limits:**
- Unauthenticated: 60 requests/hour
- Authenticated: 5,000 requests/hour

**Rate Limit Tracking:**
```javascript
class RateLimiter {
  constructor() {
    this.remaining = 60;
    this.limit = 60;
    this.reset = null;
  }

  updateFromHeaders(headers) {
    this.remaining = parseInt(headers.get('X-RateLimit-Remaining'));
    this.limit = parseInt(headers.get('X-RateLimit-Limit'));
    this.reset = new Date(parseInt(headers.get('X-RateLimit-Reset')) * 1000);
  }

  async waitIfNeeded() {
    if (this.remaining <= 5) {
      const waitTime = this.reset - Date.now();
      if (waitTime > 0) {
        showNotification(`Rate limit low. Waiting ${Math.ceil(waitTime / 60000)} minutes...`);
        await sleep(waitTime);
      }
    }
  }
}
```

**Display in UI:**
```html
<div class="rate-limit-indicator">
  API Calls: 45/60 remaining
</div>
```

### Caching Strategy

**1. Response Cache:**
```javascript
class APICache {
  constructor(ttl = 5 * 60 * 1000) { // 5 minutes
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }
}
```

**2. Cache Keys:**
```javascript
function getCacheKey(owner, repo, branch, path) {
  return `${owner}/${repo}@${branch}:${path}`;
}
```

**3. Invalidation:**
- Time-based (5 minute TTL)
- Manual refresh button
- Branch switch clears cache

### Error Handling

**1. Network Errors:**
```javascript
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000); // Exponential backoff
    }
  }
}
```

**2. 404 Not Found:**
```javascript
if (response.status === 404) {
  showError('File not found in repository. It may have been moved or deleted.');
}
```

**3. Rate Limit Exceeded:**
```javascript
if (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0') {
  const reset = new Date(parseInt(response.headers.get('X-RateLimit-Reset')) * 1000);
  showError(`GitHub API rate limit exceeded. Resets at ${reset.toLocaleTimeString()}`);
}
```

**4. CORS Errors:**
```javascript
catch (error) {
  if (error.name === 'TypeError' && error.message.includes('CORS')) {
    showError('Unable to access this file due to CORS restrictions.');
  }
}
```

## Security & Privacy

### URL Validation

**Whitelist Approach:**
```javascript
function validateGitHubURL(url) {
  const allowedDomains = [
    'raw.githubusercontent.com',
    'github.com'
  ];

  try {
    const parsed = new URL(url);
    if (!allowedDomains.includes(parsed.hostname)) {
      throw new Error('Only GitHub URLs are allowed');
    }
    return true;
  } catch (error) {
    throw new Error('Invalid URL format');
  }
}
```

### Content Safety

**1. File Size Limits:**
```javascript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

async function fetchFileContent(url) {
  const response = await fetch(url);
  const contentLength = response.headers.get('Content-Length');

  if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
    throw new Error('File too large to display (max 10MB)');
  }

  return await response.text();
}
```

**2. Content Type Validation:**
```javascript
function isSafeContentType(contentType) {
  const safeTypes = [
    'text/plain',
    'text/markdown',
    'application/json',
    'text/javascript',
    // ... other text-based types
  ];

  return safeTypes.some(type => contentType.includes(type));
}
```

### CORS Handling

**GitHub Raw Content:**
- `raw.githubusercontent.com` allows CORS for all origins
- GitHub API endpoint `api.github.com` requires proper CORS headers

**No Proxy Needed:**
All GitHub raw content URLs are CORS-enabled by default.

### Privacy Considerations

**1. No Authentication by Default:**
- Only public repositories accessible
- No personal access tokens stored
- No OAuth flow required

**2. No Tracking:**
- File access not logged
- User browsing history not collected
- GitHub API calls use standard rate limits

**3. Local-Only State:**
- No server-side storage
- No user data transmitted
- All operations client-side

## Browser Compatibility

### Supported Browsers

| Browser | Version | Support Level |
|---------|---------|--------------|
| Chrome | 90+ | ✅ Full Support |
| Edge | 90+ | ✅ Full Support |
| Firefox | 88+ | ✅ Full Support |
| Safari | 14+ | ✅ Full Support |
| Opera | 76+ | ✅ Full Support |

### Required APIs

**1. Fetch API:**
- Supported: All modern browsers
- Fallback: None needed

**2. URL API:**
- Supported: All modern browsers
- Fallback: None needed

**3. URLSearchParams:**
- Supported: All modern browsers
- Fallback: Manual parsing for IE11

**4. ES6+ Features:**
- Classes, async/await, arrow functions
- Transpilation handled by build process

### Polyfills

None required for target browsers (modern evergreen browsers only).

## Future Enhancements

### Phase 2: Authentication

**GitHub Personal Access Token:**
```javascript
class AuthenticatedGitHubAdapter extends GitHubAdapter {
  constructor(owner, repo, branch, token) {
    super(owner, repo, branch);
    this.token = token;
  }

  async fetch(url) {
    return fetch(url, {
      headers: {
        'Authorization': `token ${this.token}`
      }
    });
  }
}
```

**Benefits:**
- Access private repositories
- Increased rate limit (5,000 req/hour)
- Access to protected branches

**UI:**
- Settings panel for token input
- Secure storage in localStorage (encrypted)
- Token validation

### Phase 3: Local File Opening (`?localdir`)

**File Handling API Investigation:**

**Manifest Declaration:**
```json
{
  "file_handlers": [
    {
      "action": "/",
      "accept": {
        "text/markdown": [".md"],
        "text/plain": [".txt"]
      }
    }
  ]
}
```

**Launch Handler:**
```javascript
if ('launchQueue' in window) {
  launchQueue.setConsumer(async (launchParams) => {
    if (launchParams.files && launchParams.files.length > 0) {
      const fileHandle = launchParams.files[0];
      await openFileWithoutWorkspace(fileHandle);
    }
  });
}
```

**Limitations:**
- Chrome 102+, Edge 102+ only
- Requires PWA installation
- User must set Hotnote as default handler

**Alternative: File Picker API**
```javascript
async function openLocalFileReadOnly() {
  const [fileHandle] = await window.showOpenFilePicker({
    types: [
      {
        description: 'Markdown Files',
        accept: { 'text/markdown': ['.md'] }
      }
    ]
  });

  const file = await fileHandle.getFile();
  await openInReadOnlyMode(file);
}
```

### Phase 4: Branch/Tag Selector

**UI Component:**
```html
<select id="branch-selector" class="branch-select">
  <option value="main">main</option>
  <option value="develop">develop</option>
  <option value="v1.0.0">v1.0.0 (tag)</option>
</select>
```

**API Integration:**
```javascript
async function listBranches(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}/branches`;
  const response = await fetch(url);
  return await response.json();
}

async function listTags(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}/tags`;
  const response = await fetch(url);
  return await response.json();
}
```

### Phase 5: Advanced Features

**1. Search Across Repository:**
```javascript
async function searchCode(owner, repo, query) {
  const url = `https://api.github.com/search/code?q=${query}+repo:${owner}/${repo}`;
  const response = await fetch(url);
  return await response.json();
}
```

**2. Git Blame Integration:**
```javascript
async function getBlameInfo(owner, repo, path, lineNumber) {
  // Use GitHub GraphQL API
  const query = `
    query {
      repository(owner: "${owner}", name: "${repo}") {
        object(expression: "HEAD:${path}") {
          ... on Blob {
            blame {
              ranges {
                commit {
                  author { name }
                  message
                  committedDate
                }
              }
            }
          }
        }
      }
    }
  `;
  // Process and display blame info
}
```

**3. Markdown Link Resolution:**
- Relative links to other markdown files
- Click to navigate between docs
- Image loading from repository

**4. Offline Support:**
- Service Worker caching
- IndexedDB for file content
- Offline indicator

## Implementation Phases

### Phase 1: Foundation (Week 1)
**Goal:** Basic GitHub file opening

**Tasks:**
- [ ] Create `GitHubAdapter` class
- [ ] Implement URL parsing
- [ ] Add GitHub mode to app state
- [ ] Basic API integration
- [ ] Read-only mode implementation
- [ ] Simple error handling

**Deliverable:** Single file opening from GitHub URL

### Phase 2: Navigation (Week 2)
**Goal:** Full repository browsing

**Tasks:**
- [ ] Integrate with file picker
- [ ] Directory listing via API
- [ ] Related Files section with folder rows
- [ ] Parent directory ('...') navigation row
- [ ] Breadcrumb updates on folder navigation (synchronized with Related Files)
- [ ] Clickable breadcrumb segments for navigation
- [ ] README discovery
- [ ] Folder click-to-navigate functionality
- [ ] Loading states

**Deliverable:** Complete repository navigation with synchronized breadcrumb and Related Files

### Phase 3: Polish (Week 3)
**Goal:** Production-ready experience

**Tasks:**
- [ ] Rate limiting UI
- [ ] Comprehensive error handling
- [ ] Caching implementation
- [ ] Visual indicators (read-only badge)
- [ ] Performance optimization

**Deliverable:** Production-ready feature

### Phase 4: Documentation & Testing (Week 4)
**Goal:** Quality assurance

**Tasks:**
- [ ] Unit tests for GitHub adapter
- [ ] Integration tests for file picker
- [ ] User documentation
- [ ] Developer documentation
- [ ] Performance testing
- [ ] Security audit

**Deliverable:** Fully tested and documented feature

## Success Metrics

### Performance Metrics
- Initial file load: < 2 seconds
- Directory listing: < 1 second
- File navigation: < 500ms
- Cache hit rate: > 80%

### User Experience Metrics
- Clear read-only indicators
- Intuitive navigation
- Helpful error messages
- Responsive UI (no blocking)

### Technical Metrics
- API call efficiency (minimize redundant calls)
- Memory usage (< 50MB for typical repos)
- Rate limit utilization (< 50% for normal browsing)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Rate limit exceeded | High | Implement caching, show warnings at 80% |
| Large repositories | Medium | Lazy loading, virtual scrolling |
| Network failures | Medium | Retry logic, offline messaging |
| CORS issues | Low | Use raw.githubusercontent.com (CORS-enabled) |
| Security vulnerabilities | High | URL validation, content type checking |

## Conclusion

The GitHub Repository Browser feature transforms Hotnote into a versatile tool for exploring and viewing code repositories without local setup. By leveraging GitHub's public APIs and implementing a robust read-only mode, users can seamlessly access documentation, review code, and navigate project structures directly from their browser.

**Key Benefits:**
- Zero-friction access to GitHub content
- No local workspace setup required
- Safe read-only browsing
- Full repository navigation
- WYSIWYG markdown viewing

**Next Steps:**
1. Review and approve this feature specification
2. Begin Phase 1 implementation
3. Iterate based on user feedback
4. Expand to advanced features in later phases
