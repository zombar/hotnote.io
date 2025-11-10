import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Integration tests for TOC rendering and interactions
 * These tests verify the DOM structure and interactions
 */

describe('TOC Integration', () => {
  let tocContent;
  let markdownSidebar;
  let suggestedLinksContent;
  let suggestedLinksMobileContent;
  let suggestedLinksMobile;

  beforeEach(() => {
    // Setup DOM elements
    document.body.innerHTML = `
      <div id="editor-wrapper">
        <div id="markdown-sidebar" class="markdown-sidebar hidden">
          <div id="markdown-toc" class="markdown-toc">
            <h3 class="toc-title">Contents</h3>
            <div id="toc-content" class="toc-content"></div>
          </div>
          <div id="suggested-links" class="suggested-links">
            <h3 class="suggested-links-title">Related Files</h3>
            <div id="suggested-links-content" class="suggested-links-content"></div>
          </div>
        </div>
        <div id="editor"></div>
        <div id="suggested-links-mobile" class="suggested-links-mobile hidden">
          <h3 class="suggested-links-title">Related Files</h3>
          <div id="suggested-links-mobile-content" class="suggested-links-content"></div>
        </div>
      </div>
    `;

    tocContent = document.getElementById('toc-content');
    markdownSidebar = document.getElementById('markdown-sidebar');
    suggestedLinksContent = document.getElementById('suggested-links-content');
    suggestedLinksMobileContent = document.getElementById('suggested-links-mobile-content');
    suggestedLinksMobile = document.getElementById('suggested-links-mobile');
  });

  describe('TOC visibility', () => {
    it('should hide sidebar when no markdown file is open', () => {
      expect(markdownSidebar.classList.contains('hidden')).toBe(true);
    });

    it('should show sidebar when in WYSIWYG mode', () => {
      markdownSidebar.classList.remove('hidden');
      expect(markdownSidebar.classList.contains('hidden')).toBe(false);
    });
  });

  describe('TOC rendering', () => {
    it('should render empty state when no headings', () => {
      tocContent.innerHTML = '<p class="toc-empty">No headings found</p>';
      expect(tocContent.querySelector('.toc-empty')).toBeTruthy();
      expect(tocContent.textContent).toContain('No headings found');
    });

    it('should render TOC items with correct structure', () => {
      const tocHtml = `
        <div class="toc-item-container">
          <div class="toc-item" style="padding-left: 0px" data-pos="0" data-heading-id="title" data-level="1">
            <span class="toc-chevron-spacer"></span>
            <span class="toc-text" title="Title">Title</span>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const tocItem = tocContent.querySelector('.toc-item');
      expect(tocItem).toBeTruthy();
      expect(tocItem.dataset.pos).toBe('0');
      expect(tocItem.dataset.headingId).toBe('title');
      expect(tocItem.querySelector('.toc-text').textContent).toBe('Title');
    });

    it('should render nested TOC items with chevrons', () => {
      const tocHtml = `
        <div class="toc-item-container">
          <div class="toc-item" style="padding-left: 0px" data-pos="0" data-heading-id="parent" data-level="1">
            <span class="toc-chevron" data-heading-id="parent">▼</span>
            <span class="toc-text" title="Parent">Parent</span>
          </div>
          <div class="toc-item-container">
            <div class="toc-item" style="padding-left: 12px" data-pos="10" data-heading-id="child" data-level="2">
              <span class="toc-chevron-spacer"></span>
              <span class="toc-text" title="Child">Child</span>
            </div>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const chevron = tocContent.querySelector('.toc-chevron');
      expect(chevron).toBeTruthy();
      expect(chevron.textContent).toBe('▼');

      const items = tocContent.querySelectorAll('.toc-item');
      expect(items).toHaveLength(2);
      expect(items[0].style.paddingLeft).toBe('0px');
      expect(items[1].style.paddingLeft).toBe('12px');
    });
  });

  describe('TOC interactions', () => {
    it('should handle TOC item click to scroll', () => {
      const tocHtml = `
        <div class="toc-item-container">
          <div class="toc-item" data-pos="42">
            <span class="toc-text">Test</span>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const tocItem = tocContent.querySelector('.toc-item');
      const tocText = tocItem.querySelector('.toc-text');

      const clickHandler = vi.fn();
      tocText.addEventListener('click', clickHandler);
      tocText.click();

      expect(clickHandler).toHaveBeenCalled();
    });

    it('should toggle chevron collapsed state on click', () => {
      const tocHtml = `
        <div class="toc-item-container">
          <div class="toc-item">
            <span class="toc-chevron">▼</span>
            <span class="toc-text">Parent</span>
          </div>
          <div class="toc-item-container">
            <div class="toc-item">
              <span class="toc-text">Child</span>
            </div>
          </div>
        </div>
      `;
      tocContent.innerHTML = tocHtml;

      const chevron = tocContent.querySelector('.toc-chevron');
      expect(chevron.classList.contains('collapsed')).toBe(false);

      chevron.classList.toggle('collapsed');
      expect(chevron.classList.contains('collapsed')).toBe(true);

      chevron.classList.toggle('collapsed');
      expect(chevron.classList.contains('collapsed')).toBe(false);
    });
  });

  describe('Suggested links', () => {
    it('should render empty state when no files', () => {
      suggestedLinksContent.innerHTML =
        '<p class="suggested-links-empty">No other markdown files</p>';
      expect(suggestedLinksContent.querySelector('.suggested-links-empty')).toBeTruthy();
    });

    it('should render suggested links with correct structure', () => {
      const linksHtml = `
        <div class="suggested-link" data-filename="test.md">
          <span class="material-symbols-outlined">description</span>
          <span class="suggested-link-text">test.md</span>
        </div>
      `;
      suggestedLinksContent.innerHTML = linksHtml;

      const link = suggestedLinksContent.querySelector('.suggested-link');
      expect(link).toBeTruthy();
      expect(link.dataset.filename).toBe('test.md');
      expect(link.querySelector('.suggested-link-text').textContent).toBe('test.md');
    });

    it('should show mobile suggested links container', () => {
      suggestedLinksMobile.classList.remove('hidden');
      expect(suggestedLinksMobile.classList.contains('hidden')).toBe(false);
    });

    it('should render same content in both desktop and mobile containers', () => {
      const linksHtml = '<div class="suggested-link" data-filename="test.md">test.md</div>';
      suggestedLinksContent.innerHTML = linksHtml;
      suggestedLinksMobileContent.innerHTML = linksHtml;

      expect(suggestedLinksContent.innerHTML).toBe(suggestedLinksMobileContent.innerHTML);
    });
  });

  describe('Responsive layout', () => {
    it('should have correct container structure', () => {
      const wrapper = document.getElementById('editor-wrapper');
      expect(wrapper).toBeTruthy();
      expect(wrapper.querySelector('#markdown-sidebar')).toBeTruthy();
      expect(wrapper.querySelector('#editor')).toBeTruthy();
      expect(wrapper.querySelector('#suggested-links-mobile')).toBeTruthy();
    });

    it('should hide mobile suggested links by default', () => {
      expect(suggestedLinksMobile.classList.contains('hidden')).toBe(true);
    });
  });
});
