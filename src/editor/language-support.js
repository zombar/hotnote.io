/**
 * Language Support and Syntax Highlighting
 * Handles file type detection and syntax highlighting configuration
 */

import { HighlightStyle, StreamLanguage } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { go } from '@codemirror/lang-go';
import { rust } from '@codemirror/lang-rust';
import { php } from '@codemirror/lang-php';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { shell as shellMode } from '@codemirror/legacy-modes/mode/shell';
import { ruby as rubyMode } from '@codemirror/legacy-modes/mode/ruby';
import { groovy as groovyMode } from '@codemirror/legacy-modes/mode/groovy';
import { nginx as nginxMode } from '@codemirror/legacy-modes/mode/nginx';
import { python as pythonMode } from '@codemirror/legacy-modes/mode/python';

/**
 * Custom syntax highlighting using brand colors (light mode - darker muted)
 */
export const brandHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#a65580', fontWeight: '500' }, // darker muted pink
  { tag: tags.operator, color: '#7a65ad' }, // darker muted purple
  { tag: tags.variableName, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.string, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.number, color: '#7a65ad' }, // darker muted purple
  { tag: tags.bool, color: '#7a65ad' }, // darker muted purple
  { tag: tags.comment, color: '#999999', fontStyle: 'italic' }, // gray
  { tag: tags.tagName, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.attributeName, color: '#a65580' }, // darker muted pink
  { tag: tags.propertyName, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.function(tags.variableName), color: '#5a9cb8', fontWeight: '500' }, // darker muted cyan
  { tag: tags.className, color: '#a65580' }, // darker muted pink
  { tag: tags.typeName, color: '#a65580' }, // darker muted pink
  { tag: tags.regexp, color: '#7a65ad' }, // darker muted purple
  { tag: tags.escape, color: '#a65580' }, // darker muted pink
  { tag: tags.meta, color: '#5a9cb8' }, // darker muted cyan
  { tag: tags.constant(tags.variableName), color: '#7a65ad' }, // darker muted purple
]);

/**
 * Custom syntax highlighting using brand colors (dark mode - lighter muted)
 */
export const brandHighlightStyleDark = HighlightStyle.define([
  { tag: tags.keyword, color: '#e8bcd4', fontWeight: '500' }, // lighter muted pink
  { tag: tags.operator, color: '#c8bce8' }, // lighter muted purple
  { tag: tags.variableName, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.string, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.number, color: '#c8bce8' }, // lighter muted purple
  { tag: tags.bool, color: '#c8bce8' }, // lighter muted purple
  { tag: tags.comment, color: '#888888', fontStyle: 'italic' }, // gray
  { tag: tags.tagName, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.attributeName, color: '#e8bcd4' }, // lighter muted pink
  { tag: tags.propertyName, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.function(tags.variableName), color: '#b8e5f2', fontWeight: '500' }, // lighter muted cyan
  { tag: tags.className, color: '#e8bcd4' }, // lighter muted pink
  { tag: tags.typeName, color: '#e8bcd4' }, // lighter muted pink
  { tag: tags.regexp, color: '#c8bce8' }, // lighter muted purple
  { tag: tags.escape, color: '#e8bcd4' }, // lighter muted pink
  { tag: tags.meta, color: '#b8e5f2' }, // lighter muted cyan
  { tag: tags.constant(tags.variableName), color: '#c8bce8' }, // lighter muted purple
]);

/**
 * Get appropriate language extension for syntax highlighting
 * @param {string} filename - The filename to detect language from
 * @returns {Array} CodeMirror language extension or empty array
 */
export function getLanguageExtension(filename) {
  // Check for special filenames without extensions
  const basename = filename.split('/').pop().toLowerCase();

  // Bazel files (use Python/Starlark syntax)
  if (
    basename === 'build' ||
    basename === 'build.bazel' ||
    basename === 'workspace' ||
    basename === 'workspace.bazel'
  ) {
    return StreamLanguage.define(pythonMode);
  }

  // Jenkinsfile
  if (basename === 'jenkinsfile') {
    return StreamLanguage.define(groovyMode);
  }

  // Nginx config
  if (basename === 'nginx.conf' || basename.startsWith('nginx.')) {
    return StreamLanguage.define(nginxMode);
  }

  // .gitignore and other ignore files
  if (basename === '.gitignore' || basename.endsWith('ignore')) {
    return StreamLanguage.define(shellMode);
  }

  const ext = filename.split('.').pop().toLowerCase();
  const langMap = {
    js: javascript(),
    jsx: javascript({ jsx: true }),
    ts: javascript({ typescript: true }),
    tsx: javascript({ typescript: true, jsx: true }),
    py: python(),
    go: go(),
    rs: rust(),
    php: php(),
    java: java(),
    groovy: StreamLanguage.define(groovyMode),
    c: cpp(),
    cpp: cpp(),
    cc: cpp(),
    cxx: cpp(),
    h: cpp(),
    hpp: cpp(),
    xml: xml(),
    yaml: yaml(),
    yml: yaml(),
    sh: StreamLanguage.define(shellMode),
    bash: StreamLanguage.define(shellMode),
    rb: StreamLanguage.define(rubyMode),
    html: html(),
    htm: html(),
    css: css(),
    scss: css(),
    json: json(),
    md: markdown(),
    markdown: markdown(),
    bzl: StreamLanguage.define(pythonMode), // Bazel/Starlark files
    conf: StreamLanguage.define(nginxMode), // Nginx config files
    tf: javascript(), // Terraform files (HCL syntax similar to JavaScript)
    tfvars: javascript(), // Terraform variable files
    hcl: javascript(), // HashiCorp Configuration Language
  };
  return langMap[ext] || [];
}

/**
 * Check if file is markdown
 * @param {string} filename - The filename to check
 * @returns {boolean} True if file is markdown
 */
export function isMarkdownFile(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return ext === 'md' || ext === 'markdown';
}

/**
 * Get file extension from filename
 * @param {string} filename - The filename
 * @returns {string} The file extension in lowercase
 */
export function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

/**
 * Get basename from filename (without path)
 * @param {string} filename - The filename
 * @returns {string} The basename in lowercase
 */
export function getBasename(filename) {
  return filename.split('/').pop().toLowerCase();
}

/**
 * Check if language extension is available for file
 * @param {string} filename - The filename to check
 * @returns {boolean} True if language support is available
 */
export function hasLanguageSupport(filename) {
  const extension = getLanguageExtension(filename);
  return Array.isArray(extension) ? extension.length > 0 : !!extension;
}

/**
 * Get supported file extensions
 * @returns {Array<string>} List of supported file extensions
 */
export function getSupportedExtensions() {
  return [
    'js',
    'jsx',
    'ts',
    'tsx',
    'py',
    'go',
    'rs',
    'php',
    'java',
    'groovy',
    'c',
    'cpp',
    'cc',
    'cxx',
    'h',
    'hpp',
    'xml',
    'yaml',
    'yml',
    'sh',
    'bash',
    'rb',
    'html',
    'htm',
    'css',
    'scss',
    'json',
    'md',
    'markdown',
    'bzl',
    'conf',
    'tf',
    'tfvars',
    'hcl',
  ];
}

/**
 * Get language name for display
 * @param {string} filename - The filename
 * @returns {string} Human-readable language name
 */
export function getLanguageName(filename) {
  const ext = getFileExtension(filename);
  const basename = getBasename(filename);

  // Special cases
  if (
    basename === 'build' ||
    basename === 'build.bazel' ||
    basename === 'workspace' ||
    basename === 'workspace.bazel'
  ) {
    return 'Bazel';
  }
  if (basename === 'jenkinsfile') return 'Groovy';
  if (basename === 'nginx.conf' || basename.startsWith('nginx.')) return 'Nginx';
  if (basename === '.gitignore' || basename.endsWith('ignore')) return 'Shell';

  // Extension-based
  const nameMap = {
    js: 'JavaScript',
    jsx: 'JSX',
    ts: 'TypeScript',
    tsx: 'TSX',
    py: 'Python',
    go: 'Go',
    rs: 'Rust',
    php: 'PHP',
    java: 'Java',
    groovy: 'Groovy',
    c: 'C',
    cpp: 'C++',
    cc: 'C++',
    cxx: 'C++',
    h: 'C/C++ Header',
    hpp: 'C++ Header',
    xml: 'XML',
    yaml: 'YAML',
    yml: 'YAML',
    sh: 'Shell',
    bash: 'Bash',
    rb: 'Ruby',
    html: 'HTML',
    htm: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    json: 'JSON',
    md: 'Markdown',
    markdown: 'Markdown',
    bzl: 'Bazel',
    conf: 'Config',
    tf: 'Terraform',
    tfvars: 'Terraform',
    hcl: 'HCL',
  };

  return nameMap[ext] || 'Text';
}
