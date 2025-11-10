# TOC Test Design Document

## Overview
This document outlines the test design for the Table of Contents (TOC) feature in hotnote, with a focus on the requirement: **"Only the first entry in the TOC area should be expanded (if it exists)"**.

## Current State Analysis

### Implementation Location
- **File**: `app.js:578-665`
- **Functions**:
  - `buildHeadingTree(headings)` - Builds hierarchical structure from flat headings
  - `renderTOCTree(nodes, depth)` - Renders HTML for TOC with collapse/expand state
  - `updateTOC()` - Main orchestrator function

### Current Behavior
- **Line 590**: All nodes are created with `collapsed: false` (everything expanded)
```javascript
const node = { ...heading, children: [], collapsed: false };
```
- **No differentiation** between first entry and subsequent entries
- **No tests exist** for the "first entry expanded" requirement

### Existing Test Coverage
- ✅ 50+ unit tests covering:
  - Heading extraction from ProseMirror
  - Tree building logic (basic hierarchy)
  - Rendering with indentation
  - Click handlers
  - Chevron toggle behavior

- ✅ 60+ e2e tests covering:
  - TOC structure and rendering
  - User interactions (clicking, expanding, collapsing)
  - Focus management
  - Visual feedback

- ❌ **Missing**: Tests for default collapsed/expanded state
- ❌ **Missing**: Tests ensuring only first entry is expanded

## Required Changes

### 1. Implementation Changes Needed

The `buildHeadingTree` function needs to be modified to set the collapsed state based on position:

```javascript
const buildHeadingTree = (headings) => {
  const root = { children: [], level: 0 };
  const stack = [root];

  headings.forEach((heading, index) => {
    // Pop from stack until we find the parent level
    while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];

    // Only expand first top-level entry; collapse all others
    const isTopLevel = parent === root;
    const isFirstTopLevel = isTopLevel && root.children.length === 0;
    const collapsed = isTopLevel ? !isFirstTopLevel : true;

    const node = { ...heading, children: [], collapsed };

    if (!parent.children) {
      parent.children = [];
    }
    parent.children.push(node);
    stack.push(node);
  });

  return root.children;
};
```

## Test Design

### Unit Tests (`tests/toc-functions.test.js`)

#### 1. Default Collapsed State Tests

Add to the `buildHeadingTree` describe block:

```javascript
describe('buildHeadingTree - collapsed state', () => {
  it('should expand first top-level entry by default', () => {
    const headings = [
      { level: 1, text: 'First', id: 'first', pos: 0 },
      { level: 1, text: 'Second', id: 'second', pos: 10 },
      { level: 1, text: 'Third', id: 'third', pos: 20 },
    ];
    const result = buildHeadingTree(headings);

    expect(result).toHaveLength(3);
    expect(result[0].collapsed).toBe(false); // First entry expanded
    expect(result[1].collapsed).toBe(true);  // Second entry collapsed
    expect(result[2].collapsed).toBe(true);  // Third entry collapsed
  });

  it('should collapse all top-level entries except first', () => {
    const headings = [
      { level: 1, text: 'Chapter 1', id: 'ch1', pos: 0 },
      { level: 1, text: 'Chapter 2', id: 'ch2', pos: 10 },
      { level: 1, text: 'Chapter 3', id: 'ch3', pos: 20 },
      { level: 1, text: 'Chapter 4', id: 'ch4', pos: 30 },
    ];
    const result = buildHeadingTree(headings);

    expect(result[0].collapsed).toBe(false);
    expect(result[1].collapsed).toBe(true);
    expect(result[2].collapsed).toBe(true);
    expect(result[3].collapsed).toBe(true);
  });

  it('should collapse nested entries within collapsed sections', () => {
    const headings = [
      { level: 1, text: 'Chapter 1', id: 'ch1', pos: 0 },
      { level: 2, text: 'Section 1.1', id: 's11', pos: 10 },
      { level: 1, text: 'Chapter 2', id: 'ch2', pos: 20 },
      { level: 2, text: 'Section 2.1', id: 's21', pos: 30 },
    ];
    const result = buildHeadingTree(headings);

    // Chapter 1 expanded, its children should be collapsed
    expect(result[0].collapsed).toBe(false);
    expect(result[0].children[0].collapsed).toBe(true);

    // Chapter 2 collapsed
    expect(result[1].collapsed).toBe(true);
    // Children exist but parent is collapsed
    expect(result[1].children[0].collapsed).toBe(true);
  });

  it('should expand first entry even with nested children', () => {
    const headings = [
      { level: 1, text: 'Introduction', id: 'intro', pos: 0 },
      { level: 2, text: 'Overview', id: 'overview', pos: 10 },
      { level: 3, text: 'Purpose', id: 'purpose', pos: 20 },
      { level: 1, text: 'Main Content', id: 'main', pos: 30 },
    ];
    const result = buildHeadingTree(headings);

    expect(result[0].collapsed).toBe(false); // Introduction expanded
    expect(result[0].children).toHaveLength(1);
    expect(result[1].collapsed).toBe(true);  // Main Content collapsed
  });

  it('should handle single top-level entry (expanded)', () => {
    const headings = [
      { level: 1, text: 'Only Chapter', id: 'only', pos: 0 },
      { level: 2, text: 'Section', id: 'section', pos: 10 },
    ];
    const result = buildHeadingTree(headings);

    expect(result).toHaveLength(1);
    expect(result[0].collapsed).toBe(false); // Should be expanded
  });

  it('should handle document starting at h2 level', () => {
    const headings = [
      { level: 2, text: 'First Section', id: 'first', pos: 0 },
      { level: 2, text: 'Second Section', id: 'second', pos: 10 },
      { level: 3, text: 'Subsection', id: 'sub', pos: 20 },
    ];
    const result = buildHeadingTree(headings);

    expect(result[0].collapsed).toBe(false); // First h2 expanded
    expect(result[1].collapsed).toBe(true);  // Second h2 collapsed
  });

  it('should handle empty headings array', () => {
    const result = buildHeadingTree([]);
    expect(result).toEqual([]);
  });
});
```

#### 2. Rendering Tests for Collapsed State

Add to the `renderTOCTree` describe block:

```javascript
describe('renderTOCTree - collapsed state rendering', () => {
  it('should render first entry with expanded chevron', () => {
    const nodes = [
      {
        level: 1,
        text: 'First',
        id: 'first',
        pos: 0,
        children: [{ level: 2, text: 'Sub', id: 'sub', pos: 10, children: [], collapsed: true }],
        collapsed: false,
      },
    ];
    const html = renderTOCTree(nodes);

    expect(html).toContain('indeterminate_check_box'); // Expanded icon
    expect(html).not.toContain('collapsed');
    expect(html).toContain('Sub'); // Children visible
  });

  it('should render subsequent entries with collapsed chevron', () => {
    const nodes = [
      {
        level: 1,
        text: 'Second',
        id: 'second',
        pos: 0,
        children: [{ level: 2, text: 'Hidden', id: 'hidden', pos: 10, children: [], collapsed: true }],
        collapsed: true,
      },
    ];
    const html = renderTOCTree(nodes);

    expect(html).toContain('add_box'); // Collapsed icon
    expect(html).toContain('collapsed');
    expect(html).not.toContain('Hidden'); // Children not visible
  });

  it('should render mixed collapsed and expanded entries correctly', () => {
    const nodes = [
      {
        level: 1,
        text: 'First',
        id: 'first',
        pos: 0,
        children: [{ level: 2, text: 'Visible', id: 'visible', pos: 5, children: [], collapsed: true }],
        collapsed: false,
      },
      {
        level: 1,
        text: 'Second',
        id: 'second',
        pos: 10,
        children: [{ level: 2, text: 'Hidden', id: 'hidden', pos: 15, children: [], collapsed: true }],
        collapsed: true,
      },
    ];
    const html = renderTOCTree(nodes);

    expect(html).toContain('First');
    expect(html).toContain('Visible'); // First entry's children visible
    expect(html).toContain('Second');
    expect(html).not.toContain('Hidden'); // Second entry's children hidden
  });
});
```

### E2E Tests (`tests/e2e/toc-default-state.spec.js`)

Create a new test file for the default expanded/collapsed state:

```javascript
import { test, expect } from '@playwright/test';
import { createTestFile, cleanupTestFiles } from './test-helpers';

test.describe('TOC Default State - First Entry Expanded', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="editor"]');
  });

  test.afterEach(async () => {
    await cleanupTestFiles();
  });

  test('should expand only first top-level entry by default', async ({ page }) => {
    // Create a markdown file with multiple top-level sections
    const content = `# Chapter 1

## Section 1.1
Content here.

## Section 1.2
More content.

# Chapter 2

## Section 2.1
Some text.

# Chapter 3

## Section 3.1
Final section.`;

    await createTestFile('test-toc.md', content);
    await page.click('[data-filename="test-toc.md"]');

    // Wait for TOC to render
    await page.waitForSelector('#toc-content .toc-item');

    // Get all top-level TOC items (h1 headings)
    const topLevelItems = await page.locator('.toc-item[data-level="1"]').all();
    expect(topLevelItems).toHaveLength(3);

    // First chapter chevron should be expanded (indeterminate_check_box)
    const firstChevron = page.locator('.toc-item[data-level="1"]').first().locator('.toc-chevron');
    await expect(firstChevron).toHaveText('indeterminate_check_box');
    await expect(firstChevron).not.toHaveClass(/collapsed/);

    // Second chapter chevron should be collapsed (add_box)
    const secondChevron = page.locator('.toc-item[data-level="1"]').nth(1).locator('.toc-chevron');
    await expect(secondChevron).toHaveText('add_box');
    await expect(secondChevron).toHaveClass(/collapsed/);

    // Third chapter chevron should be collapsed
    const thirdChevron = page.locator('.toc-item[data-level="1"]').nth(2).locator('.toc-chevron');
    await expect(thirdChevron).toHaveText('add_box');
    await expect(thirdChevron).toHaveClass(/collapsed/);
  });

  test('should show first entry children, hide others', async ({ page }) => {
    const content = `# First
## First Child
# Second
## Second Child (should be hidden)`;

    await createTestFile('visibility-test.md', content);
    await page.click('[data-filename="visibility-test.md"]');

    await page.waitForSelector('#toc-content .toc-item');

    // First entry's children should be visible
    const firstChild = page.locator('.toc-item').filter({ hasText: 'First Child' });
    await expect(firstChild).toBeVisible();

    // Second entry's children should not be in DOM or hidden
    const secondChildContainer = page.locator('.toc-item-container').filter({
      has: page.locator('.toc-item').filter({ hasText: 'Second Child' })
    });
    // Check if it exists but is hidden (not rendered when parent is collapsed)
    const count = await secondChildContainer.count();
    expect(count).toBe(0); // Should not be rendered when parent is collapsed
  });

  test('should allow expanding collapsed sections', async ({ page }) => {
    const content = `# First
## First Child
# Second
## Second Child`;

    await createTestFile('expand-test.md', content);
    await page.click('[data-filename="expand-test.md"]');

    await page.waitForSelector('#toc-content .toc-item');

    // Click the second chapter's chevron to expand it
    const secondChevron = page.locator('.toc-item').filter({ hasText: 'Second' }).locator('.toc-chevron');
    await secondChevron.click();

    // Chevron should now be expanded
    await expect(secondChevron).toHaveText('indeterminate_check_box');
    await expect(secondChevron).not.toHaveClass(/collapsed/);

    // Second child should now be visible
    const secondChild = page.locator('.toc-item').filter({ hasText: 'Second Child' });
    await expect(secondChild).toBeVisible();
  });

  test('should allow collapsing first (initially expanded) section', async ({ page }) => {
    const content = `# First
## First Child
# Second`;

    await createTestFile('collapse-test.md', content);
    await page.click('[data-filename="collapse-test.md"]');

    await page.waitForSelector('#toc-content .toc-item');

    // First child should be visible initially
    const firstChild = page.locator('.toc-item').filter({ hasText: 'First Child' });
    await expect(firstChild).toBeVisible();

    // Click first chapter's chevron to collapse it
    const firstChevron = page.locator('.toc-item').filter({ hasText: 'First' }).locator('.toc-chevron');
    await firstChevron.click();

    // Chevron should now be collapsed
    await expect(firstChevron).toHaveText('add_box');
    await expect(firstChevron).toHaveClass(/collapsed/);

    // First child should no longer be visible
    await expect(firstChild).not.toBeVisible();
  });

  test('should handle single top-level entry (always expanded)', async ({ page }) => {
    const content = `# Only Chapter
## Section 1
## Section 2`;

    await createTestFile('single-entry.md', content);
    await page.click('[data-filename="single-entry.md"]');

    await page.waitForSelector('#toc-content .toc-item');

    const chevron = page.locator('.toc-item[data-level="1"]').locator('.toc-chevron');
    await expect(chevron).toHaveText('indeterminate_check_box');

    // All children should be visible
    await expect(page.locator('.toc-item').filter({ hasText: 'Section 1' })).toBeVisible();
    await expect(page.locator('.toc-item').filter({ hasText: 'Section 2' })).toBeVisible();
  });

  test('should handle document with no top-level h1', async ({ page }) => {
    const content = `## First Section
### Subsection
## Second Section
### Another Subsection`;

    await createTestFile('no-h1.md', content);
    await page.click('[data-filename="no-h1.md"]');

    await page.waitForSelector('#toc-content .toc-item');

    // First h2 should be expanded, second should be collapsed
    const firstChevron = page.locator('.toc-item[data-level="2"]').first().locator('.toc-chevron');
    await expect(firstChevron).toHaveText('indeterminate_check_box');

    const secondChevron = page.locator('.toc-item[data-level="2"]').nth(1).locator('.toc-chevron');
    await expect(secondChevron).toHaveText('add_box');
  });

  test('should reset to default state when opening new file', async ({ page }) => {
    const content1 = `# First\n# Second\n# Third`;
    const content2 = `# Alpha\n# Beta\n# Gamma`;

    await createTestFile('file1.md', content1);
    await createTestFile('file2.md', content2);

    // Open first file and expand second section
    await page.click('[data-filename="file1.md"]');
    await page.waitForSelector('#toc-content .toc-item');

    const secondChevron = page.locator('.toc-item').filter({ hasText: 'Second' }).locator('.toc-chevron');
    await secondChevron.click();

    // Open second file
    await page.click('[data-filename="file2.md"]');
    await page.waitForSelector('#toc-content .toc-item');

    // First section (Alpha) should be expanded, others collapsed
    const alphaChevron = page.locator('.toc-item').filter({ hasText: 'Alpha' }).locator('.toc-chevron');
    await expect(alphaChevron).toHaveText('indeterminate_check_box');

    const betaChevron = page.locator('.toc-item').filter({ hasText: 'Beta' }).locator('.toc-chevron');
    await expect(betaChevron).toHaveText('add_box');
  });
});
```

## Implementation Checklist

### Code Changes
- [ ] Modify `buildHeadingTree` in `app.js` to set collapsed state based on position
- [ ] Ensure nested children in collapsed sections are not rendered (already implemented in `renderTOCTree`)
- [ ] Test that chevron icons update correctly based on collapsed state

### Unit Tests
- [ ] Add `buildHeadingTree - collapsed state` test suite (7 tests)
- [ ] Add `renderTOCTree - collapsed state rendering` test suite (3 tests)
- [ ] Update existing tests that expect `collapsed: false` for all nodes

### E2E Tests
- [ ] Create `tests/e2e/toc-default-state.spec.js` (8 tests)
- [ ] Verify tests work with actual file system operations

### Documentation
- [ ] Update `TOC_TESTING_GUIDE.md` with new default state behavior
- [ ] Update `CHANGELOG.md` with the feature addition

## Test Execution

Run all tests after implementation:

```bash
# Unit tests
npm test -- tests/toc-functions.test.js

# E2E tests
npm run test:e2e -- tests/e2e/toc-default-state.spec.js

# All TOC tests
npm test -- tests/toc
npm run test:e2e -- tests/e2e/markdown-toc
```

## Edge Cases to Consider

1. **Empty document**: No headings → No TOC
2. **Single heading**: Should be expanded
3. **Deep nesting**: First top-level entry expanded, all nested children initially collapsed
4. **Document starts at h2**: First h2 treated as top-level and expanded
5. **File switching**: Should reset to default state for new file
6. **Live updates**: When user adds/removes headings, should reset to default state

## Future Enhancements

1. **State persistence**: Save collapsed/expanded state to session storage per file
2. **Keyboard navigation**: Use arrow keys to expand/collapse
3. **Expand/collapse all**: Buttons to expand or collapse all sections
4. **Deep linking**: URL parameter to expand specific section
5. **Smooth transitions**: CSS transitions for expand/collapse animations
