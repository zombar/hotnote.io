import { describe, it, expect } from 'vitest';

/**
 * Unit tests for TOC helper functions
 * These functions are extracted from app.js for testing
 */

// Helper function to build hierarchical structure from flat headings array
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

describe('buildHeadingTree', () => {
  it('should handle empty headings array', () => {
    const result = buildHeadingTree([]);
    expect(result).toEqual([]);
  });

  it('should handle single heading', () => {
    const headings = [{ level: 1, text: 'Title', id: 'title', pos: 0 }];
    const result = buildHeadingTree(headings);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Title');
    expect(result[0].level).toBe(1);
    expect(result[0].children).toEqual([]);
  });

  it('should build simple hierarchy (h1 > h2)', () => {
    const headings = [
      { level: 1, text: 'Title', id: 'title', pos: 0 },
      { level: 2, text: 'Subtitle', id: 'subtitle', pos: 10 },
    ];
    const result = buildHeadingTree(headings);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Title');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].text).toBe('Subtitle');
  });

  it('should build complex multi-level hierarchy', () => {
    const headings = [
      { level: 1, text: 'Chapter 1', id: 'ch1', pos: 0 },
      { level: 2, text: 'Section 1.1', id: 's11', pos: 10 },
      { level: 3, text: 'Subsection 1.1.1', id: 'ss111', pos: 20 },
      { level: 2, text: 'Section 1.2', id: 's12', pos: 30 },
      { level: 1, text: 'Chapter 2', id: 'ch2', pos: 40 },
    ];
    const result = buildHeadingTree(headings);

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('Chapter 1');
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children[0].text).toBe('Section 1.1');
    expect(result[0].children[0].children).toHaveLength(1);
    expect(result[0].children[0].children[0].text).toBe('Subsection 1.1.1');
    expect(result[0].children[1].text).toBe('Section 1.2');
    expect(result[1].text).toBe('Chapter 2');
  });

  it('should handle skipped heading levels', () => {
    const headings = [
      { level: 1, text: 'Title', id: 'title', pos: 0 },
      { level: 3, text: 'Subsection', id: 'subsection', pos: 10 },
      { level: 2, text: 'Section', id: 'section', pos: 20 },
    ];
    const result = buildHeadingTree(headings);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Title');
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children[0].text).toBe('Subsection');
    expect(result[0].children[1].text).toBe('Section');
  });

  it('should handle multiple top-level headings', () => {
    const headings = [
      { level: 1, text: 'First', id: 'first', pos: 0 },
      { level: 1, text: 'Second', id: 'second', pos: 10 },
      { level: 1, text: 'Third', id: 'third', pos: 20 },
    ];
    const result = buildHeadingTree(headings);

    expect(result).toHaveLength(3);
    expect(result[0].text).toBe('First');
    expect(result[1].text).toBe('Second');
    expect(result[2].text).toBe('Third');
  });

  it('should preserve heading properties', () => {
    const headings = [{ level: 1, text: 'Title', id: 'heading-title-0', pos: 42 }];
    const result = buildHeadingTree(headings);

    expect(result[0].id).toBe('heading-title-0');
    expect(result[0].pos).toBe(42);
    expect(result[0].collapsed).toBe(false);
  });

  it('should handle headings starting at h2', () => {
    const headings = [
      { level: 2, text: 'Section', id: 'section', pos: 0 },
      { level: 3, text: 'Subsection', id: 'subsection', pos: 10 },
    ];
    const result = buildHeadingTree(headings);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Section');
    expect(result[0].children).toHaveLength(1);
  });
});

describe('renderTOCTree', () => {
  // Helper function to render TOC tree with collapsible sections
  const renderTOCTree = (nodes, depth = 0) => {
    if (!nodes || nodes.length === 0) return '';

    const items = nodes
      .map((node) => {
        const hasChildren = node.children && node.children.length > 0;
        const indent = depth * 16; // 16px per level (Material UI 8px grid)
        const chevron = hasChildren
          ? `<span class="toc-chevron ${node.collapsed ? 'collapsed' : ''}" data-heading-id="${node.id}">▼</span>`
          : '<span class="toc-chevron-spacer"></span>';

        const childrenHtml =
          hasChildren && !node.collapsed ? renderTOCTree(node.children, depth + 1) : '';

        return `
        <div class="toc-item-container">
          <div class="toc-item" style="padding-left: ${indent}px" data-pos="${node.pos}" data-heading-id="${node.id}" data-level="${node.level}">
            ${chevron}
            <span class="toc-text" title="${node.text}">${node.text}</span>
          </div>
          ${childrenHtml}
        </div>
      `;
      })
      .join('');

    return items;
  };

  it('should return empty string for empty nodes', () => {
    expect(renderTOCTree([])).toBe('');
    expect(renderTOCTree(null)).toBe('');
  });

  it('should render single heading without children', () => {
    const nodes = [{ level: 1, text: 'Title', id: 'title', pos: 0, children: [] }];
    const html = renderTOCTree(nodes);

    expect(html).toContain('toc-item');
    expect(html).toContain('Title');
    expect(html).toContain('data-pos="0"');
    expect(html).toContain('toc-chevron-spacer');
    expect(html).not.toContain('toc-chevron collapsed');
  });

  it('should render heading with children and chevron', () => {
    const nodes = [
      {
        level: 1,
        text: 'Title',
        id: 'title',
        pos: 0,
        children: [{ level: 2, text: 'Subtitle', id: 'subtitle', pos: 10, children: [] }],
        collapsed: false,
      },
    ];
    const html = renderTOCTree(nodes);

    expect(html).toContain('toc-chevron');
    expect(html).toContain('Title');
    expect(html).toContain('Subtitle');
  });

  it('should apply correct indentation at different depths', () => {
    const nodes = [
      {
        level: 1,
        text: 'Title',
        id: 'title',
        pos: 0,
        children: [
          {
            level: 2,
            text: 'Subtitle',
            id: 'subtitle',
            pos: 10,
            children: [],
          },
        ],
        collapsed: false,
      },
    ];
    const html = renderTOCTree(nodes);

    expect(html).toContain('padding-left: 0px'); // Level 0
    expect(html).toContain('padding-left: 16px'); // Level 1 (Material UI 8px grid)
  });

  it('should not render children when node is collapsed', () => {
    const nodes = [
      {
        level: 1,
        text: 'Title',
        id: 'title',
        pos: 0,
        children: [{ level: 2, text: 'Subtitle', id: 'subtitle', pos: 10, children: [] }],
        collapsed: true,
      },
    ];
    const html = renderTOCTree(nodes);

    expect(html).toContain('Title');
    expect(html).not.toContain('Subtitle');
    expect(html).toContain('collapsed');
  });

  it('should include heading id and position in data attributes', () => {
    const nodes = [{ level: 1, text: 'Test', id: 'heading-test-42', pos: 42, children: [] }];
    const html = renderTOCTree(nodes);

    expect(html).toContain('data-heading-id="heading-test-42"');
    expect(html).toContain('data-pos="42"');
  });
});
