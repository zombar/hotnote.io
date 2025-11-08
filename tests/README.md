# hotnote Test Suite

Comprehensive unit and integration tests for the hotnote code editor.

## Test Coverage

**46 tests** covering all core functionality:
- ✅ Temp storage operations (save, load, clear, check)
- ✅ File path key generation
- ✅ Language detection for all supported file types
- ✅ File System Access API support detection
- ✅ Breadcrumb path building
- ✅ Directory entry sorting
- ✅ Navigation validation (back, forward, up)
- ✅ Integration workflows
- ✅ Edge cases and special scenarios

## Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests once
npm test -- --run

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

## Test Structure

### Unit Tests (`core.test.js`)
Tests for individual functions in `core.js`:

**Temp Storage Functions**
- `getFilePathKey()` - File path key generation
- `saveTempChanges()` - Saving unsaved changes to localStorage
- `loadTempChanges()` - Loading saved changes
- `clearTempChanges()` - Clearing temp storage
- `hasTempChanges()` - Checking for unsaved changes

**Language Detection**
- Tests for all supported languages: JS, JSX, TS, TSX, Python, HTML, CSS, JSON, Markdown
- Proper configuration for language variants (JSX, TypeScript)
- Unknown extension handling

**File System API**
- Support detection for File System Access API
- Handles missing APIs gracefully

**Breadcrumb Building**
- Path generation for various folder structures
- File and folder differentiation
- Index tracking for navigation

**Directory Sorting**
- Directories sorted before files
- Alphabetical sorting within types

**Navigation Validation**
- Back/forward history validation
- Folder up capability checking

### Integration Tests (`integration.test.js`)
Tests for complete user workflows:

**File Navigation and Temp Storage**
- Saving and restoring changes when switching files
- Clearing temp storage after save
- Maintaining changes across folder navigation

**Multiple Files**
- Tracking unsaved changes across multiple files
- Nested folder structures
- Independent file management

**Autosave Workflow**
- Simulating autosave behavior
- Clearing temp storage after successful save

**Edge Cases**
- Files with same name in different folders
- Special characters in filenames
- Empty content handling
- Very long paths (20+ levels deep)

## Test Setup

### Configuration (`vitest.config.js`)
- Environment: happy-dom (fast, lightweight DOM implementation)
- Global test utilities
- Coverage reporting with v8

### Setup File (`setup.js`)
- localStorage mock
- File System Access API mocks
- Mock file and directory handle creators
- Automatic cleanup between tests

### Mocks
```javascript
// Create mock file handle
const fileHandle = createMockFileHandle('test.js', 'content');

// Create mock directory handle
const dirHandle = createMockDirectoryHandle('src', [
    createMockFileHandle('index.js'),
    createMockDirectoryHandle('components'),
]);
```

## Coverage Report

Current coverage for `core.js`: **100%**
- Statements: 100%
- Branches: 96.77%
- Functions: 100%
- Lines: 100%

## Writing New Tests

### Example Unit Test
```javascript
import { describe, it, expect } from 'vitest';
import { functionToTest } from '../core.js';

describe('Feature Name', () => {
    it('should do something specific', () => {
        const result = functionToTest(input);
        expect(result).toBe(expectedOutput);
    });
});
```

### Example Integration Test
```javascript
import { describe, it, expect, beforeEach } from 'vitest';

describe('Integration: Feature Workflow', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('should complete a full workflow', () => {
        // Arrange: Set up initial state
        // Act: Perform actions
        // Assert: Verify results
    });
});
```

## CI/CD Integration

Tests are designed to run in CI/CD pipelines:
- Fast execution (~1 second)
- No external dependencies
- Deterministic results
- Comprehensive coverage

Add to your CI config:
```yaml
- name: Run tests
  run: npm test -- --run

- name: Generate coverage
  run: npm run test:coverage
```

## Best Practices

1. **Test isolation**: Each test clears localStorage and mocks
2. **Descriptive names**: Tests clearly state what they verify
3. **AAA pattern**: Arrange, Act, Assert
4. **Edge cases**: Tests cover normal and error scenarios
5. **Integration tests**: Verify complete user workflows
6. **Fast execution**: Tests run in under 2 seconds

## Troubleshooting

### Tests fail with localStorage errors
Ensure `setup.js` is loaded in `vitest.config.js`

### Mock file handles not working
Check that you're using the mock creators from `setup.js`

### Coverage not generating
Install `@vitest/coverage-v8` package

## Future Test Additions

Potential areas for additional tests:
- [ ] Editor integration with CodeMirror
- [ ] Autosave interval timing
- [ ] File System Access API error handling
- [ ] Keyboard shortcut handling
- [ ] Service worker functionality
- [ ] PWA installation flow
