# [hotnote.io](https://hotnote.io)

![Tests](https://img.shields.io/badge/tests-1373%20passing-success)
![Build](https://img.shields.io/badge/build-passing-success)
![Size](https://img.shields.io/badge/size-514KB%20gzipped-blue)

Minimalist online code editor with local filesystem access.

We ❤️ lean software and dream of the days of MS Edit and Windows 3.11.

## Features

* **Local files** - Direct filesystem access via File System Access API

- **WYSIWYG markdown** - Rich editor for .md files (toggle with source mode)

- **Syntax highlighting** - CodeMirror 6 for JS/TS/Python/Go/Rust/etc

- **Autosave** - Optional 2s interval

- **Temp storage** - Unsaved changes preserved in browser

- **Dark mode** - Toggle light/dark theme

- **PWA** - Install and use offline

- **Shortcuts** - Cmd/Ctrl+S (save), Cmd/Ctrl+Shift+O (folder), Cmd/Ctrl+N (new)

## Quick Start

```bash
make init     # first-time setup: install brew tools & pre-commit hooks
npm run dev
```

### Docker

```bash
make up    # start dev server on http://localhost:3011
make down  # stop
make logs  # view logs
```

### Makefile Commands

```bash
make help      # show all commands
make init      # install dev tools (brew) & set up git hooks
make build     # docker build (no cache)
make test      # run all tests + validation
make validate  # lint + format checks
make coverage  # run tests with coverage report
```

**1373 tests** covering core functionality, file operations, navigation, edge cases, commenting system, and event listener management.

## Browser Support

Best in Chrome/Edge (full File System Access API support).

## Deploy

Deploy `dist/` to Netlify, Vercel, GitHub Pages, or any static host.

## License

Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
