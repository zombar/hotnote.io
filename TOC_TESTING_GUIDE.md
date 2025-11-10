# TOC Testing Guide

This document explains how to test the Table of Contents (TOC) functionality in hotnote.

## Quick Start

### Manual Testing in Browser

1. **Build and run the app:**
   ```bash
   npm run build
   npm run preview
   ```

2. **Open a markdown file:**
   - Click "Choose Folder" or press Ctrl/Cmd+O
   - Select a folder containing markdown files
   - Open a `.md` file

3. **Test TOC functionality:**
   - **TOC should appear** - Look for the sidebar on the left with "CONTENTS" heading
   - **Click a heading** - Should scroll to that heading and place cursor there
   - **Check console** - Open DevTools and look for `[TOC]` and `[WYSIWYGView]` logs
   - **Collapse/expand** - Click chevrons (▼) to collapse sections
   - **Suggested links** - See other markdown files in the same folder below TOC

## Debug Mode

The current implementation includes extensive console logging to debug issues:

### Console Logs to Watch

**When TOC is initialized:**
```
[TOC] Attaching event listeners to X items
```

**When you click a TOC item:**
```
[TOC] Clicked heading at position: 42
[TOC] Editor manager: [object]
[TOC] Active editor: [object]
[TOC] Calling scrollToPosition with: 42
```

**In scrollToPosition:**
```
[WYSIWYGView] scrollToPosition called with pos: 42
[WYSIWYGView] Document size: 1234
[WYSIWYGView] Safe position: 42
[WYSIWYGView] Created selection: {...}
[WYSIWYGView] Dispatched transaction
[WYSIWYGView] Focusing editor element
```

### Troubleshooting

**If TOC clicks don't work:**

1. **Check console for errors**
   - Look for `[TOC] Editor or scrollToPosition not available`
   - This means the editor isn't properly initialized

2. **Verify TOC items have positions**
   - Inspect a TOC item in DevTools
   - Should have `data-pos="42"` attribute

3. **Check if in WYSIWYG mode**
   - TOC only works in WYSIWYG mode
   - Click the wysiwyg button (icon) to toggle

4. **Verify markdown file is loaded**
   - TOC only appears for `.md` or `.markdown` files

## Running Tests

### Unit Tests (50 tests)

```bash
# Run all TOC unit tests
npm test -- tests/toc tests/wysiwyg-view-toc.test.js

# Run specific test file
npm test -- tests/toc-functions.test.js
npm test -- tests/toc-integration.test.js
npm test -- tests/toc-click-behavior.test.js
npm test -- tests/wysiwyg-view-toc.test.js
```

### E2E Tests

```bash
# Run all TOC e2e tests
npm run test:e2e -- tests/e2e/markdown-toc-comprehensive.spec.js
npm run test:e2e -- tests/e2e/toc-navigation.spec.js

# Run with UI
npm run test:e2e -- --ui tests/e2e/toc-navigation.spec.js
```

## Test Coverage

### Unit Tests (50 tests)
- ✓ Heading extraction from ProseMirror
- ✓ ID generation and sanitization
- ✓ Tree building from flat headings
- ✓ TOC rendering with collapsible sections
- ✓ Click behavior and event handling
- ✓ Focus management
- ✓ Error handling

### E2E Tests (60+ tests)
- ✓ TOC structure and rendering
- ✓ Click handlers attachment
- ✓ Console logging verification
- ✓ Chevron expand/collapse
- ✓ Focus preservation
- ✓ Error handling
- ✓ Visual feedback (hover, transitions)
- ✓ Material UI compliance
- ✓ Responsive layout

## Expected Behavior

### When Clicking a TOC Item

1. **Cursor moves** - Caret should jump to the heading position
2. **Document scrolls** - Heading should scroll into view smoothly
3. **Editor stays focused** - Editor remains focused for immediate typing
4. **Selection visible** - Cursor/selection should be visible at heading

### When Clicking a Chevron

1. **Chevron rotates** - Rotates -90° when collapsed
2. **Children hide** - Nested headings collapse
3. **No editor blur** - Editor focus is unaffected

### When Clicking Suggested Links

1. **File opens** - New markdown file loads
2. **TOC updates** - New TOC reflects new file's headings
3. **Suggested links update** - Shows other files in new directory

## Implementation Details

### Key Files

- **app.js** - `attachTOCEventListeners()`, `updateTOC()`
- **src/editors/wysiwyg-view.js** - `getHeadings()`, `scrollToPosition()`
- **style.css** - TOC and suggested links styling

### How It Works

1. **Heading Extraction:**
   - `getHeadings()` walks ProseMirror document tree
   - Extracts all heading nodes with level, text, and position
   - Generates unique IDs from heading text

2. **Tree Building:**
   - `buildHeadingTree()` creates hierarchical structure
   - Parent-child relationships based on heading levels
   - Supports collapsible sections

3. **Rendering:**
   - `renderTOCTree()` generates HTML with data attributes
   - Includes chevrons for expandable sections
   - Adds proper indentation (16px per level)

4. **Click Handling:**
   - `attachTOCEventListeners()` adds click handlers
   - Calls `scrollToPosition(pos)` on click
   - Sets cursor and scrolls using ProseMirror transaction

5. **Focus Management:**
   - `setTimeout()` ensures editor gets focus after scroll
   - Uses `view.dom.focus()` to maintain editor focus
   - Prevents blur during navigation

## Removing Debug Logs

Once TOC is working correctly, remove console.log statements:

**In app.js:**
```javascript
// Remove all lines starting with:
console.log('[TOC]
console.error('[TOC]
```

**In wysiwyg-view.js:**
```javascript
// Remove all lines starting with:
console.log('[WYSIWYGView]
console.error('[WYSIWYGView]
```

## Performance Considerations

- **Debounced updates** - TOC updates every 500ms during typing
- **Event delegation** - Could be improved by delegating to parent
- **Re-rendering** - Full re-render on every update (acceptable for small docs)

## Future Improvements

1. **Active heading highlight** - Highlight current heading based on scroll position
2. **Smooth scroll animation** - Better visual feedback
3. **Keyboard navigation** - Arrow keys to navigate TOC
4. **Search within TOC** - Filter headings by text
5. **Persist collapsed state** - Remember which sections are collapsed
6. **Drag to reorder** - Reorganize document structure via TOC

## Reporting Issues

When reporting TOC issues, include:

1. **Console output** - Copy all `[TOC]` and `[WYSIWYGView]` logs
2. **Browser and version**
3. **Steps to reproduce**
4. **Expected vs actual behavior**
5. **Screenshot or video if possible**
