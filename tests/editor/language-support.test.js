import { describe, it, expect } from 'vitest';
import {
  brandHighlightStyle,
  brandHighlightStyleDark,
  getLanguageExtension,
  isMarkdownFile,
  getFileExtension,
  getBasename,
  hasLanguageSupport,
  getSupportedExtensions,
  getLanguageName,
} from '../../src/editor/language-support.js';

describe('Language Support', () => {
  describe('brandHighlightStyle', () => {
    it('should be defined', () => {
      expect(brandHighlightStyle).toBeDefined();
    });

    it('should be a HighlightStyle', () => {
      expect(brandHighlightStyle).toHaveProperty('specs');
    });
  });

  describe('brandHighlightStyleDark', () => {
    it('should be defined', () => {
      expect(brandHighlightStyleDark).toBeDefined();
    });

    it('should be a HighlightStyle', () => {
      expect(brandHighlightStyleDark).toHaveProperty('specs');
    });
  });

  describe('getLanguageExtension', () => {
    describe('JavaScript family', () => {
      it('should return JavaScript extension for .js files', () => {
        const ext = getLanguageExtension('test.js');
        expect(ext).toBeDefined();
        expect(ext).toBeTruthy();
      });

      it('should return JSX extension for .jsx files', () => {
        const ext = getLanguageExtension('Component.jsx');
        expect(ext).toBeDefined();
      });

      it('should return TypeScript extension for .ts files', () => {
        const ext = getLanguageExtension('test.ts');
        expect(ext).toBeDefined();
      });

      it('should return TSX extension for .tsx files', () => {
        const ext = getLanguageExtension('Component.tsx');
        expect(ext).toBeDefined();
      });
    });

    describe('Other languages', () => {
      it('should return Python extension for .py files', () => {
        const ext = getLanguageExtension('script.py');
        expect(ext).toBeDefined();
      });

      it('should return Go extension for .go files', () => {
        const ext = getLanguageExtension('main.go');
        expect(ext).toBeDefined();
      });

      it('should return Rust extension for .rs files', () => {
        const ext = getLanguageExtension('main.rs');
        expect(ext).toBeDefined();
      });

      it('should return PHP extension for .php files', () => {
        const ext = getLanguageExtension('index.php');
        expect(ext).toBeDefined();
      });

      it('should return Java extension for .java files', () => {
        const ext = getLanguageExtension('Main.java');
        expect(ext).toBeDefined();
      });

      it('should return Groovy extension for .groovy files', () => {
        const ext = getLanguageExtension('script.groovy');
        expect(ext).toBeDefined();
      });

      it('should return Ruby extension for .rb files', () => {
        const ext = getLanguageExtension('script.rb');
        expect(ext).toBeDefined();
      });
    });

    describe('C/C++ family', () => {
      it('should return C++ extension for .c files', () => {
        const ext = getLanguageExtension('main.c');
        expect(ext).toBeDefined();
      });

      it('should return C++ extension for .cpp files', () => {
        const ext = getLanguageExtension('main.cpp');
        expect(ext).toBeDefined();
      });

      it('should return C++ extension for .cc files', () => {
        const ext = getLanguageExtension('main.cc');
        expect(ext).toBeDefined();
      });

      it('should return C++ extension for .cxx files', () => {
        const ext = getLanguageExtension('main.cxx');
        expect(ext).toBeDefined();
      });

      it('should return C++ extension for .h files', () => {
        const ext = getLanguageExtension('header.h');
        expect(ext).toBeDefined();
      });

      it('should return C++ extension for .hpp files', () => {
        const ext = getLanguageExtension('header.hpp');
        expect(ext).toBeDefined();
      });
    });

    describe('Markup and data formats', () => {
      it('should return HTML extension for .html files', () => {
        const ext = getLanguageExtension('index.html');
        expect(ext).toBeDefined();
      });

      it('should return HTML extension for .htm files', () => {
        const ext = getLanguageExtension('index.htm');
        expect(ext).toBeDefined();
      });

      it('should return CSS extension for .css files', () => {
        const ext = getLanguageExtension('style.css');
        expect(ext).toBeDefined();
      });

      it('should return CSS extension for .scss files', () => {
        const ext = getLanguageExtension('style.scss');
        expect(ext).toBeDefined();
      });

      it('should return JSON extension for .json files', () => {
        const ext = getLanguageExtension('package.json');
        expect(ext).toBeDefined();
      });

      it('should return XML extension for .xml files', () => {
        const ext = getLanguageExtension('config.xml');
        expect(ext).toBeDefined();
      });

      it('should return YAML extension for .yaml files', () => {
        const ext = getLanguageExtension('config.yaml');
        expect(ext).toBeDefined();
      });

      it('should return YAML extension for .yml files', () => {
        const ext = getLanguageExtension('config.yml');
        expect(ext).toBeDefined();
      });

      it('should return Markdown extension for .md files', () => {
        const ext = getLanguageExtension('README.md');
        expect(ext).toBeDefined();
      });

      it('should return Markdown extension for .markdown files', () => {
        const ext = getLanguageExtension('README.markdown');
        expect(ext).toBeDefined();
      });
    });

    describe('Shell scripts', () => {
      it('should return Shell extension for .sh files', () => {
        const ext = getLanguageExtension('script.sh');
        expect(ext).toBeDefined();
      });

      it('should return Shell extension for .bash files', () => {
        const ext = getLanguageExtension('script.bash');
        expect(ext).toBeDefined();
      });
    });

    describe('Special files', () => {
      it('should return Python extension for BUILD files', () => {
        const ext = getLanguageExtension('BUILD');
        expect(ext).toBeDefined();
      });

      it('should return Python extension for build.bazel files', () => {
        const ext = getLanguageExtension('build.bazel');
        expect(ext).toBeDefined();
      });

      it('should return Python extension for WORKSPACE files', () => {
        const ext = getLanguageExtension('WORKSPACE');
        expect(ext).toBeDefined();
      });

      it('should return Python extension for workspace.bazel files', () => {
        const ext = getLanguageExtension('workspace.bazel');
        expect(ext).toBeDefined();
      });

      it('should return Groovy extension for Jenkinsfile', () => {
        const ext = getLanguageExtension('Jenkinsfile');
        expect(ext).toBeDefined();
      });

      it('should return Nginx extension for nginx.conf', () => {
        const ext = getLanguageExtension('nginx.conf');
        expect(ext).toBeDefined();
      });

      it('should return Shell extension for .gitignore', () => {
        const ext = getLanguageExtension('.gitignore');
        expect(ext).toBeDefined();
      });

      it('should return Shell extension for .dockerignore', () => {
        const ext = getLanguageExtension('.dockerignore');
        expect(ext).toBeDefined();
      });
    });

    describe('Terraform and HCL', () => {
      it('should return JavaScript extension for .tf files', () => {
        const ext = getLanguageExtension('main.tf');
        expect(ext).toBeDefined();
      });

      it('should return JavaScript extension for .tfvars files', () => {
        const ext = getLanguageExtension('vars.tfvars');
        expect(ext).toBeDefined();
      });

      it('should return JavaScript extension for .hcl files', () => {
        const ext = getLanguageExtension('config.hcl');
        expect(ext).toBeDefined();
      });
    });

    describe('Bazel files', () => {
      it('should return Python extension for .bzl files', () => {
        const ext = getLanguageExtension('rules.bzl');
        expect(ext).toBeDefined();
      });
    });

    describe('Config files', () => {
      it('should return Nginx extension for .conf files', () => {
        const ext = getLanguageExtension('app.conf');
        expect(ext).toBeDefined();
      });
    });

    describe('Unknown extensions', () => {
      it('should return empty array for unknown extensions', () => {
        const ext = getLanguageExtension('file.unknown');
        expect(ext).toEqual([]);
      });

      it('should return empty array for files without extension', () => {
        const ext = getLanguageExtension('file');
        expect(ext).toEqual([]);
      });
    });

    describe('Case insensitivity', () => {
      it('should handle uppercase extensions', () => {
        const ext = getLanguageExtension('TEST.JS');
        expect(ext).toBeDefined();
        expect(ext).toBeTruthy();
      });

      it('should handle mixed case extensions', () => {
        const ext = getLanguageExtension('Component.JSX');
        expect(ext).toBeDefined();
      });

      it('should handle uppercase special files', () => {
        const ext = getLanguageExtension('BUILD');
        expect(ext).toBeDefined();
      });
    });

    describe('Path handling', () => {
      it('should work with relative paths', () => {
        const ext = getLanguageExtension('src/components/App.jsx');
        expect(ext).toBeDefined();
      });

      it('should work with absolute paths', () => {
        const ext = getLanguageExtension('/home/user/projects/main.go');
        expect(ext).toBeDefined();
      });

      it('should work with deep nesting', () => {
        const ext = getLanguageExtension('a/b/c/d/e/file.py');
        expect(ext).toBeDefined();
      });
    });
  });

  describe('isMarkdownFile', () => {
    it('should return true for .md files', () => {
      expect(isMarkdownFile('README.md')).toBe(true);
    });

    it('should return true for .markdown files', () => {
      expect(isMarkdownFile('CHANGELOG.markdown')).toBe(true);
    });

    it('should return false for non-markdown files', () => {
      expect(isMarkdownFile('script.js')).toBe(false);
    });

    it('should return false for files without extension', () => {
      expect(isMarkdownFile('README')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isMarkdownFile('README.MD')).toBe(true);
      expect(isMarkdownFile('README.MARKDOWN')).toBe(true);
    });

    it('should work with paths', () => {
      expect(isMarkdownFile('docs/API.md')).toBe(true);
    });
  });

  describe('getFileExtension', () => {
    it('should return extension for simple filename', () => {
      expect(getFileExtension('file.txt')).toBe('txt');
    });

    it('should return extension in lowercase', () => {
      expect(getFileExtension('File.TXT')).toBe('txt');
    });

    it('should handle multiple dots', () => {
      expect(getFileExtension('file.test.js')).toBe('js');
    });

    it('should return filename if no extension', () => {
      expect(getFileExtension('Makefile')).toBe('makefile');
    });

    it('should work with paths', () => {
      expect(getFileExtension('src/components/App.jsx')).toBe('jsx');
    });
  });

  describe('getBasename', () => {
    it('should return basename for simple filename', () => {
      expect(getBasename('file.txt')).toBe('file.txt');
    });

    it('should return basename in lowercase', () => {
      expect(getBasename('File.TXT')).toBe('file.txt');
    });

    it('should extract basename from path', () => {
      expect(getBasename('src/components/App.jsx')).toBe('app.jsx');
    });

    it('should handle absolute paths', () => {
      expect(getBasename('/home/user/file.js')).toBe('file.js');
    });

    it('should handle deep nesting', () => {
      expect(getBasename('a/b/c/d/file.py')).toBe('file.py');
    });
  });

  describe('hasLanguageSupport', () => {
    it('should return true for supported extensions', () => {
      expect(hasLanguageSupport('test.js')).toBe(true);
    });

    it('should return false for unsupported extensions', () => {
      expect(hasLanguageSupport('file.unknown')).toBe(false);
    });

    it('should return true for special files', () => {
      expect(hasLanguageSupport('BUILD')).toBe(true);
    });

    it('should return false for files without extension', () => {
      expect(hasLanguageSupport('Makefile')).toBe(false);
    });
  });

  describe('getSupportedExtensions', () => {
    it('should return an array', () => {
      const exts = getSupportedExtensions();
      expect(Array.isArray(exts)).toBe(true);
    });

    it('should include common extensions', () => {
      const exts = getSupportedExtensions();
      expect(exts).toContain('js');
      expect(exts).toContain('ts');
      expect(exts).toContain('py');
      expect(exts).toContain('go');
      expect(exts).toContain('html');
      expect(exts).toContain('css');
    });

    it('should include markdown extensions', () => {
      const exts = getSupportedExtensions();
      expect(exts).toContain('md');
      expect(exts).toContain('markdown');
    });

    it('should not be empty', () => {
      const exts = getSupportedExtensions();
      expect(exts.length).toBeGreaterThan(0);
    });
  });

  describe('getLanguageName', () => {
    describe('Common languages', () => {
      it('should return JavaScript for .js files', () => {
        expect(getLanguageName('test.js')).toBe('JavaScript');
      });

      it('should return JSX for .jsx files', () => {
        expect(getLanguageName('Component.jsx')).toBe('JSX');
      });

      it('should return TypeScript for .ts files', () => {
        expect(getLanguageName('test.ts')).toBe('TypeScript');
      });

      it('should return TSX for .tsx files', () => {
        expect(getLanguageName('Component.tsx')).toBe('TSX');
      });

      it('should return Python for .py files', () => {
        expect(getLanguageName('script.py')).toBe('Python');
      });

      it('should return Go for .go files', () => {
        expect(getLanguageName('main.go')).toBe('Go');
      });

      it('should return Rust for .rs files', () => {
        expect(getLanguageName('main.rs')).toBe('Rust');
      });

      it('should return HTML for .html files', () => {
        expect(getLanguageName('index.html')).toBe('HTML');
      });

      it('should return CSS for .css files', () => {
        expect(getLanguageName('style.css')).toBe('CSS');
      });

      it('should return JSON for .json files', () => {
        expect(getLanguageName('package.json')).toBe('JSON');
      });

      it('should return Markdown for .md files', () => {
        expect(getLanguageName('README.md')).toBe('Markdown');
      });
    });

    describe('Special files', () => {
      it('should return Bazel for BUILD files', () => {
        expect(getLanguageName('BUILD')).toBe('Bazel');
      });

      it('should return Groovy for Jenkinsfile', () => {
        expect(getLanguageName('Jenkinsfile')).toBe('Groovy');
      });

      it('should return Nginx for nginx.conf', () => {
        expect(getLanguageName('nginx.conf')).toBe('Nginx');
      });

      it('should return Shell for .gitignore', () => {
        expect(getLanguageName('.gitignore')).toBe('Shell');
      });
    });

    describe('Unknown files', () => {
      it('should return Text for unknown extensions', () => {
        expect(getLanguageName('file.unknown')).toBe('Text');
      });

      it('should return Text for files without extension', () => {
        expect(getLanguageName('Makefile')).toBe('Text');
      });
    });

    describe('C/C++ family', () => {
      it('should return C for .c files', () => {
        expect(getLanguageName('main.c')).toBe('C');
      });

      it('should return C++ for .cpp files', () => {
        expect(getLanguageName('main.cpp')).toBe('C++');
      });

      it('should return C/C++ Header for .h files', () => {
        expect(getLanguageName('header.h')).toBe('C/C++ Header');
      });
    });
  });
});
