# PWA Installation Guide

This guide helps you install and run Hotnote as a Progressive Web App (PWA) across different browsers and operating systems.

## Quick Install

Visit [https://hotnote.io](https://hotnote.io) and:

- **Chrome/Edge**: Click the install icon (➕ or computer icon) in the address bar
- **Safari (macOS)**: Share menu → Add to Dock
- **Safari (iOS)**: Share → Add to Home Screen
- **Firefox**: Not fully supported - use browser version instead

## macOS: "App is damaged" Error Fix

If you see "hotnote is damaged and can't be opened", this is a macOS security feature blocking downloaded apps.

### Quick Fix (Command Line)

1. **Find the app location:**
   ```bash
   find ~/Applications /Applications -name "hotnote.app" 2>/dev/null
   ```

2. **Remove quarantine attribute** (replace PATH with actual path from step 1):
   ```bash
   sudo xattr -cr "/PATH/TO/hotnote.app"
   ```

3. **Launch the app** - it should now open normally

### Alternative: System Preferences

1. Try to open the app (you'll see the error)
2. Go to **System Preferences → Security & Privacy → General**
3. Click **"Open Anyway"** next to the hotnote warning
4. Confirm to open the app

### Complete Reinstall (if still broken)

1. **Remove old installation:**
   ```bash
   # Find and remove the app
   rm -rf ~/Applications/hotnote.app /Applications/hotnote.app
   ```

2. **Clear browser data:**
   - Chrome: Settings → Privacy → Clear browsing data (select Cached images and Site data)
   - Safari: Safari → Settings → Privacy → Manage Website Data → Remove hotnote.io

3. **Hard refresh and reinstall:**
   - Visit https://hotnote.io
   - Press **Cmd+Shift+R** to hard refresh
   - Install the PWA again

## Windows

PWAs install without issues on Windows. If you encounter problems:

1. **Ensure you're using Chrome or Edge** (best PWA support)
2. **Clear browser cache**: Settings → Privacy → Clear browsing data
3. **Reinstall**: Visit https://hotnote.io and click the install icon

## Linux

Most Linux browsers support PWAs:

1. **Chrome/Chromium**: Click install icon in address bar
2. **Firefox**: Limited support - use browser version
3. **Check installed PWAs**: chrome://apps

## iOS/Android

### iOS (Safari only)
1. Visit https://hotnote.io in Safari
2. Tap Share button
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add"

### Android (Chrome)
1. Visit https://hotnote.io in Chrome
2. Tap the menu (⋮)
3. Tap "Install app" or "Add to Home Screen"
4. Tap "Install"

## Troubleshooting

### Service Worker Issues
If the app doesn't work offline:
1. Open DevTools (F12 or Cmd+Option+I)
2. Application tab → Service Workers
3. Click "Unregister" for hotnote
4. Refresh the page (it will re-register)

### Icons Not Showing
- Clear browser cache
- Reinstall the PWA
- Check that https://hotnote.io/manifest.json loads correctly

### App Not Installing
- Ensure you're using HTTPS (http:// won't work)
- Check that your browser supports PWAs
- Try a different browser (Chrome has best support)

## Why Use PWA vs Browser?

- **Offline access**: Works without internet
- **Native feel**: Runs in its own window
- **Faster**: Pre-cached assets load instantly
- **Desktop integration**: Appears in app launcher/dock

## Development/Local Testing

To test the PWA locally:

```bash
npm run build
npm run preview
```

Then visit http://localhost:4173 and install the PWA.

**Note**: Service workers are disabled in dev mode (`npm run dev`) to avoid caching issues during development.
