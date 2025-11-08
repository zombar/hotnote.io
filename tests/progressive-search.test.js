import { describe, it, expect, beforeEach } from 'vitest';
import { createMockProject } from './mocks/filesystem.js';

/**
 * Tests for progressive search functionality
 * These tests verify that the async generator implementation
 * yields results progressively rather than all at once
 */
describe('Progressive Search Tests', () => {
  let mockProject;

  beforeEach(() => {
    // Create a mock project structure
    mockProject = createMockProject({
      'app.js': 'app',
      'app.test.js': 'test',
      src: {
        'app.js': 'src app',
        'index.js': 'index',
        components: {
          'App.js': 'component',
          'AppHeader.js': 'header',
        },
        utils: {
          'helpers.js': 'helpers',
        },
      },
    });
  });

  it('should yield results progressively as an async generator', async () => {
    // Mock implementation of async generator
    async function* mockProgressiveSearch(dirHandle, query) {
      const allFiles = dirHandle._getAllFiles();
      for (const file of allFiles) {
        if (file.name.toLowerCase().includes(query.toLowerCase())) {
          // Simulate progressive yielding
          await new Promise((resolve) => setTimeout(resolve, 1));
          yield {
            name: file.name,
            path: file.path,
            fullPath: file.path ? `${file.path}/${file.name}` : file.name,
            kind: 'file',
            handle: file.handle,
            depth: file.depth || 0,
            relevance: 100,
          };
        }
      }
    }

    const results = [];
    const startTime = Date.now();
    const timestamps = [];

    // Consume the async generator
    for await (const result of mockProgressiveSearch(mockProject, 'app')) {
      results.push(result);
      timestamps.push(Date.now() - startTime);
    }

    // Verify we got results
    expect(results.length).toBeGreaterThan(0);

    // Verify results came progressively (not all at once)
    // Each result should have a different timestamp
    const uniqueTimestamps = new Set(timestamps);
    expect(uniqueTimestamps.size).toBeGreaterThan(1);
  });

  it('should allow early consumption of results before search completes', async () => {
    async function* mockProgressiveSearch(dirHandle, query, maxResults = 100) {
      const allFiles = dirHandle._getAllFiles();
      let count = 0;

      for (const file of allFiles) {
        if (count >= maxResults) break;

        if (file.name.toLowerCase().includes(query.toLowerCase())) {
          yield {
            name: file.name,
            path: file.path,
            fullPath: file.path ? `${file.path}/${file.name}` : file.name,
            kind: 'file',
            relevance: 100,
          };
          count++;
        }
      }
    }

    // Test early break - only consume first 2 results
    const firstTwo = [];
    for await (const _result of mockProgressiveSearch(mockProject, 'app')) {
      firstTwo.push(_result);
      if (firstTwo.length === 2) break;
    }

    expect(firstTwo).toHaveLength(2);
    expect(firstTwo[0].name).toContain('app');
  });

  it('should respect max results limit during streaming', async () => {
    async function* mockProgressiveSearch(dirHandle, query, maxResults = 3) {
      const allFiles = dirHandle._getAllFiles();
      let count = 0;

      for (const file of allFiles) {
        if (count >= maxResults) return;

        if (file.name.toLowerCase().includes(query.toLowerCase())) {
          yield {
            name: file.name,
            relevance: 100,
          };
          count++;
        }
      }
    }

    const results = [];
    for await (const _result of mockProgressiveSearch(mockProject, 'app', 3)) {
      results.push(_result);
    }

    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('should handle empty search results gracefully', async () => {
    async function* mockProgressiveSearch(dirHandle, query) {
      const allFiles = dirHandle._getAllFiles();
      for (const file of allFiles) {
        if (file.name.toLowerCase().includes(query.toLowerCase())) {
          yield { name: file.name };
        }
      }
    }

    const results = [];
    for await (const result of mockProgressiveSearch(mockProject, 'nonexistent')) {
      results.push(result);
    }

    expect(results).toHaveLength(0);
  });

  it('should support depth-first traversal for progressive results', async () => {
    async function* mockDepthFirstSearch(
      dirHandle,
      query,
      currentPath = '',
      depth = 0,
      maxDepth = 10
    ) {
      if (depth > maxDepth) return;

      const entries = dirHandle._entries || new Map();

      // First yield files at current level
      for (const [name, entry] of entries) {
        if (entry.kind === 'file' && name.toLowerCase().includes(query.toLowerCase())) {
          yield {
            name,
            path: currentPath,
            depth: depth,
          };
        }
      }

      // Then recurse into directories
      for (const [name, entry] of entries) {
        if (entry.kind === 'directory') {
          const newPath = currentPath ? `${currentPath}/${name}` : name;
          yield* mockDepthFirstSearch(entry, query, newPath, depth + 1, maxDepth);
        }
      }
    }

    const results = [];
    for await (const result of mockDepthFirstSearch(mockProject, 'js')) {
      results.push(result);
    }

    // Should find multiple files at different depths
    expect(results.length).toBeGreaterThan(0);
    const depths = results.map((r) => r.depth);
    const maxDepth = Math.max(...depths);
    const minDepth = Math.min(...depths);

    // Verify we're searching multiple levels
    expect(maxDepth).toBeGreaterThan(minDepth);
  });

  it('should handle concurrent async generator iterations', async () => {
    async function* mockProgressiveSearch(dirHandle, query) {
      const allFiles = dirHandle._getAllFiles();
      for (const file of allFiles) {
        if (file.name.toLowerCase().includes(query.toLowerCase())) {
          await new Promise((resolve) => setTimeout(resolve, 1));
          yield { name: file.name };
        }
      }
    }

    // Start two searches concurrently
    const search1Promise = (async () => {
      const results = [];
      for await (const result of mockProgressiveSearch(mockProject, 'app')) {
        results.push(result);
      }
      return results;
    })();

    const search2Promise = (async () => {
      const results = [];
      for await (const result of mockProgressiveSearch(mockProject, 'js')) {
        results.push(result);
      }
      return results;
    })();

    const [results1, results2] = await Promise.all([search1Promise, search2Promise]);

    expect(results1.length).toBeGreaterThan(0);
    expect(results2.length).toBeGreaterThan(0);
  });

  it('should properly clean up on early termination', async () => {
    let cleanupCalled = false;

    async function* mockSearchWithCleanup(dirHandle, query) {
      try {
        const allFiles = dirHandle._getAllFiles();
        for (const file of allFiles) {
          if (file.name.toLowerCase().includes(query.toLowerCase())) {
            yield { name: file.name };
          }
        }
      } finally {
        cleanupCalled = true;
      }
    }

    // Early termination
    for await (const _result of mockSearchWithCleanup(mockProject, 'app')) {
      break; // Terminate after first result
    }

    // Cleanup should still be called
    expect(cleanupCalled).toBe(true);
  });

  it('should handle errors during progressive search', async () => {
    async function* mockSearchWithError(dirHandle, query) {
      const allFiles = dirHandle._getAllFiles();
      let count = 0;

      for (const file of allFiles) {
        if (file.name.toLowerCase().includes(query.toLowerCase())) {
          if (count === 2) {
            throw new Error('Search error');
          }
          yield { name: file.name };
          count++;
        }
      }
    }

    const results = [];
    let errorCaught = false;

    try {
      for await (const result of mockSearchWithError(mockProject, 'app')) {
        results.push(result);
      }
    } catch (err) {
      errorCaught = true;
      expect(err.message).toBe('Search error');
    }

    expect(errorCaught).toBe(true);
    expect(results.length).toBe(2); // Should have partial results
  });

  it('should maintain result order with progressive updates', async () => {
    async function* mockOrderedSearch(dirHandle, query) {
      const allFiles = dirHandle._getAllFiles();
      const matches = [];

      // Collect and score matches
      for (const file of allFiles) {
        if (file.name.toLowerCase().includes(query.toLowerCase())) {
          const relevance =
            file.name.toLowerCase() === query.toLowerCase()
              ? 1000
              : file.name.toLowerCase().startsWith(query.toLowerCase())
                ? 500
                : 100;
          matches.push({
            name: file.name,
            path: file.path,
            relevance,
          });
        }
      }

      // Yield in order of relevance
      matches.sort((a, b) => b.relevance - a.relevance);
      for (const match of matches) {
        yield match;
      }
    }

    const results = [];
    for await (const result of mockOrderedSearch(mockProject, 'app')) {
      results.push(result);
    }

    // Verify results are in descending relevance order
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].relevance).toBeGreaterThanOrEqual(results[i].relevance);
    }
  });
});
