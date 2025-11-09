# [hotnote.io](https://hotnote.io)

![Tests](https://img.shields.io/badge/tests-266%20passing-success)
![Build](https://img.shields.io/badge/build-passing-success)
![Size](https://img.shields.io/badge/size-503KB%20gzipped-blue)

Minimalist online code editor with local filesystem access.

We ❤️ lean software and dream of the days of MS Edit and Windows 3.11.

## Features

- **Local files** - Direct filesystem access via File System Access API
- **WYSIWYG markdown** - Rich editor for .md files (toggle with source mode)
- **Syntax highlighting** - CodeMirror 6 for JS/TS/Python/Go/Rust/etc
- **Autosave** - Optional 2s interval
- **Temp storage** - Unsaved changes preserved in browser
- **Dark mode** - Toggle light/dark theme
- **PWA** - Install and use offline
- **Shortcuts** - Cmd/Ctrl+S (save), Cmd/Ctrl+Shift+O (folder), Cmd/Ctrl+N (new)

## Quick Start

```bash
npm install
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
make build     # docker build (no cache)
make test      # run all tests + validation
make validate  # lint + format checks
make clean     # remove containers/volumes
```

## Build

```bash
npm run build    # → dist/
npm run preview  # test build
```

## Test

```bash
npm test              # watch mode
npm test -- --run     # single run
npm run test:coverage # coverage report
```

**266 tests** covering core functionality, file operations, navigation, and edge cases.

## Browser Support

Best in Chrome/Edge (full File System Access API support).

## Deploy

Deploy `dist/` to Netlify, Vercel, GitHub Pages, or any static host.

## License

Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
