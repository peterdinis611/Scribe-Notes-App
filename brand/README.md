# Scribe brand assets

Official mark: interlocking dual arcs (amber + cyan) on ink.

| File | Role |
|------|------|
| [`scribe-mark.svg`](scribe-mark.svg) | Transparent mark (in-app, docs) |
| [`scribe-app-icon.svg`](scribe-app-icon.svg) | Application icon (vector source) |
| [`scribe-document.svg`](scribe-document.svg) | `.scribe` file-type icon (vector source) |
| [`masters/scribe-app-icon.png`](masters/scribe-app-icon.png) | 1024×1024 app master |
| [`masters/scribe-document.png`](masters/scribe-document.png) | 1024×1024 document master |

## Colors

- Amber `#FFC131`
- Cyan `#24C8DB`
- Ink `#0E1210`

## Regenerating platform icons

```bash
# App dock / tray / Windows / Android / iOS
bunx tauri icon brand/masters/scribe-app-icon.png

# Document type (.icns for Finder)
bunx tauri icon brand/masters/scribe-document.png -o /tmp/scribe-doc-icons
cp /tmp/scribe-doc-icons/icon.icns src-tauri/icons/scribe-document.icns
cp /tmp/scribe-doc-icons/icon.png src-tauri/icons/scribe-document.png
```

Favicon: [`public/favicon.svg`](../public/favicon.svg)  
Bundled file icon: `src-tauri/icons/scribe-document.icns` + `Info.plist` `CFBundleTypeIconFile`
