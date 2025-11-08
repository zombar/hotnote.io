# hotnote

A lightweight, minimalistic code editor and note-taking app with local filesystem access.

## Features

- **Local filesystem access** via File System Access API
- **Folder browsing** with breadcrumb navigation
  - Navigate through directories
  - Clickable breadcrumb path (e.g., `src › test › pipeline`)
  - Back/forward navigation buttons
  - Folder up button (↑) to navigate to parent directory - works beyond initial folder
  - Inline file picker to browse and select files
- **Autosave** - Optional automatic saving every 2 seconds (disabled by default)
- **Rich Markdown Editor** - WYSIWYG editing for markdown files
  - Enabled by default for .md files
  - Toggle between rich and source mode with the "rich" button
  - Type # for instant heading formatting
  - Real-time rendering of bold, italic, lists, and more
  - Powered by Milkdown
- **Temporary file storage** - Unsaved changes are preserved in browser storage
  - Changes persist when navigating between files
  - Dot indicator (•) shows files with unsaved changes
  - Temp changes restored when reopening files
  - Cleared automatically when files are saved
- **Syntax highlighting** with CodeMirror 6 for:
  - JavaScript/TypeScript (JSX/TSX)
  - Python
  - Go
  - Groovy/Jenkinsfile
  - Rust
  - PHP
  - Java
  - C/C++
  - Ruby
  - Shell/Bash
  - HTML
  - XML
  - CSS/SCSS
  - JSON
  - YAML
  - Markdown
  - Bazel (BUILD, WORKSPACE, .bzl files)
  - Nginx (nginx.conf, .conf files)
  - .gitignore and other ignore files
- **Minimal, distraction-free interface** with pale, washed-out theme
- **Dark mode** - Toggle between light and dark themes with persistent preference
- **Progressive Web App** - install and use offline
- **Keyboard shortcuts**:
  - `Ctrl/Cmd + Shift + O` - Open folder
  - `Ctrl/Cmd + S` - Save file
  - `Ctrl/Cmd + N` - New file

## Browser Support

The File System Access API is supported in:

- Chrome/Edge (full support)
- Safari 15.2+ (partial support)
- Firefox (behind flag, experimental)

For the best experience, use Chrome or Edge.

## Installation

### Web Application

Deploy hotnote to any static hosting service:

1. Build the application:

   ```bash
   npm install
   npm run build
   ```

2. Deploy the `dist/` directory to:
   - Netlify
   - Vercel
   - GitHub Pages
   - Cloudflare Pages
   - Or any static hosting service

3. Or run locally:
   ```bash
   npm run preview
   # Or use any static server:
   # python -m http.server 8000 --directory dist
   ```

## Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open your browser to the URL shown (typically `http://localhost:5173`)

4. Build for production:

   ```bash
   npm run build
   ```

5. Preview production build:
   ```bash
   npm run preview
   ```

## Testing

hotnote includes a comprehensive test suite with 101 unit and integration tests:

```bash
# Run tests in watch mode
npm test

# Run tests once
npm test -- --run

# Run with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

**Test Coverage:**

- ✅ 100% coverage of core functionality
- ✅ Temp storage operations
- ✅ Language detection
- ✅ Navigation logic
- ✅ File operations
- ✅ Integration workflows
- ✅ Edge cases

See [tests/README.md](tests/README.md) for detailed testing documentation.

## Usage

### First Launch

On first load, hotnote will show a welcome prompt:

- Click **Open Folder** to browse and navigate through a folder structure

### Opening Folders

Press `Ctrl/Cmd + Shift + O` or click "Open Folder" from the welcome prompt to open a folder. This enables:

- **Breadcrumb navigation** - Click any folder in the path to navigate to it
- **File picker** - Browse files and subdirectories in an inline list
- **Folder up button (↑)** - Navigate to the parent directory, or open a new folder when at root
- **Back/forward buttons (← →)** - Navigate through your browsing history

### Navigating Files

When browsing a folder:

- Click on a **folder name** (📁) to navigate into it
- Click on a **file name** (📄) to open and edit it
- Click breadcrumb segments (including folders) to navigate back and close the current file
- Use back/forward buttons to navigate through history
- Use the folder-up button (↑) to go to the parent directory
  - When at the root folder, clicking ↑ will prompt you to open a new parent folder

### Unsaved Changes

hotnote intelligently manages unsaved changes:

- Files with unsaved changes show a **dot indicator (•)** next to their name
- The dot appears in both the breadcrumb and the file list
- When you navigate away from a file with unsaved changes, they're stored in browser storage
- Changes are automatically restored when you reopen the file
- **Undo to original**: If you undo all changes back to the original file content, the file is automatically marked as clean and temp storage is cleared
- Temp storage is cleared when you save the file or reload the browser

### Saving Files

Press `Ctrl/Cmd + S` to save the current file. If you haven't opened or saved the file yet, the browser will prompt you to choose a location.

### Autosave

Enable the **autosave** checkbox in the top-right corner to automatically save your changes every 2 seconds. Autosave only works when you have an open file with a save location.

### Creating New Files

Click the "new" button or press `Ctrl/Cmd + N` to create a new file:

1. A text input appears in the breadcrumb
2. Type the filename (e.g., `notes.md`, `script.js`)
3. Press **Enter** to create the file

The file is immediately:

- **Created on disk** (in the current directory if browsing, or you'll choose a location)
- **Opened in the editor** ready for editing
- **Autosave enabled** automatically for the new file
- **Added to the file picker** if in a directory context

hotnote will warn you if you have unsaved changes in the current file before creating a new one.

### Rich Markdown Editing

When you open a `.md` file, hotnote automatically enables the rich WYSIWYG editor:

- **WYSIWYG Experience**: Type naturally and see formatted text in real-time
  - Type `# ` for H1, `## ` for H2, etc.
  - Type `**bold**` to create **bold** text
  - Type `*italic*` to create _italic_ text
  - Type `- ` or `1. ` to start lists
  - Type `> ` for blockquotes
  - Type ``` for code blocks

- **Toggle Modes**: Click the **"rich"** button to switch between:
  - **Rich mode**: WYSIWYG editing (default for .md files)
  - **Source mode**: Traditional markdown syntax editing

- **Shortcuts**: All markdown shortcuts work naturally - just type them!

The rich editor preserves your markdown formatting while providing a clean writing experience similar to Notion or Typora.

## PWA Installation

To install hotnote as a Progressive Web App:

1. Open hotnote in Chrome or Edge
2. Click the install icon in the address bar
3. Follow the prompts to install

Once installed, hotnote will work offline and can be launched from your app launcher.

## Color Scheme

hotnote features both **light** and **dark** themes with a minimalistic color scheme and washed-out colors for a distraction-free writing and coding experience. Click the sun/moon button in the navbar to toggle between themes.

### Light Theme

- **Background**: Light (#fafafa)
- **Text**: Dark charcoal (#333333)
- **Syntax highlighting** (washed-out palette):
  - Keywords: Soft red (#cc9999)
  - Strings: Soft green (#99cc99)
  - Functions: Soft green (bold)
  - Numbers/Booleans: Soft purple (#cc99cc)
  - Comments: Muted gray (#999999, italic)
  - Properties: Soft aqua (#99cccc)
  - Types/Classes: Soft yellow (#cccc99)
  - Operators: Soft orange (#ccaa99)

### Dark Theme

- **Background**: Dark charcoal (#1a1a1a)
- **Text**: Light gray (#e0e0e0)
- **Accent colors**: Brighter pink, purple, and cyan from the logo
- All syntax highlighting colors adjusted for dark backgrounds

The color schemes provide a calm, low-saturation environment that reduces eye strain during extended coding sessions. Your theme preference is automatically saved and restored across sessions.

## Customization

### Adding Language Support

To add support for additional languages, install the appropriate CodeMirror language package and update `app.js`:

```javascript
import { rust } from '@codemirror/lang-rust';

const langMap = {
  // ... existing languages
  rs: rust(),
};
```

### Changing the Theme

Edit `style.css` to customize the colors. Key CSS variables are defined in `:root`:

```css
:root {
  /* Pale minimalistic theme */
  --bg-primary: #fafafa;
  --bg-secondary: #f5f5f5;
  --bg-tertiary: #eeeeee;
  --text-primary: #333333;
  --text-secondary: #888888;
  --border: #e0e0e0;
  --accent: #d0d0d0;

  /* Washed out colors */
  --red: #cc9999;
  --green: #99cc99;
  --yellow: #cccc99;
  --blue: #9999cc;
  --purple: #cc99cc;
  --aqua: #99cccc;
  --orange: #ccaa99;
  --gray: #999999;
}
```

To use a different theme, modify these variables and update the syntax highlighting tokens in the CSS.

## Technical Details

### Core Technologies

- **Editor**: CodeMirror 6
- **Rich Markdown**: Milkdown
- **Build tool**: Vite
- **Size**: ~1.3MB minified (including all language modules)
- **No backend required**: Fully client-side application

### Architecture

hotnote is a browser-based application that uses the File System Access API for local file operations:

**File System Adapter (`FileSystemAdapter` in app.js)**

- Uses browser's native File System Access API
- Provides unified interface for file operations
- Handles folders, files, reading, and writing

**Key Features:**

- Direct filesystem access (Chrome/Edge/Safari)
- Progressive Web App (PWA) capabilities
- Offline-first architecture
- Zero backend dependencies
- LocalStorage for temporary changes

The adapter handles:

- Opening folders and files
- Reading and writing file content
- Directory navigation
- File metadata access

## License

MIT
