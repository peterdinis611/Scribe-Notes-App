# Local video library API

Concrete surface for large local videos: Rust owns paths, copy/reference, SQLite index, ffprobe/ffmpeg; Python ASR returns text only (no base64 media).

## Storage

Under `{documentsDir}/files/`:

```text
attachments/videos/{videoId}/
  source.{ext}      # copy mode
  thumb.jpg         # optional
  transcript.md     # optional ASR
```

Reference mode (≥ 100 MiB default): absolute `sourcePath` only, no copy.

## Tauri commands

| Command | Args | Returns |
|---------|------|---------|
| `pick_local_video` | — | `string \| null` absolute path (PathAccessGate grant) |
| `import_local_video` | `{ request: ImportLocalVideoRequest }` | `ImportLocalVideoResult` |
| `list_library_videos_cmd` | — | `LibraryVideo[]` |
| `get_library_video_cmd` | `{ id }` | `LibraryVideo \| null` |
| `delete_library_video_cmd` | `{ id, removeFiles? }` | `bool` |
| `probe_library_video` | `{ id }` | `ProbeVideoResult` (`available: false` if no ffprobe) |
| `generate_library_video_thumbnail` | `{ id, atSecs? }` | `LibraryVideo` |
| `transcribe_library_video` | `{ request: TranscribeVideoRequest }` | `TranscribeVideoResult` |
| `library_video_playback_path` | `{ id }` | absolute path for `convertFileSrc` |

### Types (camelCase over the wire)

```ts
type VideoImportMode = 'copy' | 'reference'
type LibraryVideoStatus =
  | 'ready' | 'probing' | 'thumbPending'
  | 'transcribing' | 'transcriptReady' | 'failed'

type ImportLocalVideoRequest = {
  sourcePath: string
  title?: string
  importMode?: VideoImportMode  // default: reference if ≥100MiB else copy
  documentId?: string
}

type TranscribeVideoRequest = {
  videoId: string
  model?: string      // default "base"
  language?: string
  createDocument?: boolean
}
```

Frontend wrappers: `src/lib/db/api.ts` (`pickLocalVideoNative`, `importLocalVideoNative`, …).

## NLP JSON-RPC

Method: `transcribe_video` (timeout 600s).

Params: `{ videoId?, sourcePath, relPath?, model?, language? }`  
Result: `{ text, segments: [{ start, end, text }], model, language?, videoId? }`

Requires optional `faster-whisper`. Errors: `-32021` unavailable, `-32022` failed.

## Storage mode

`list_library_assets` / `delete_library_asset` include library videos (`kind: "video"`):
- rows from `library_videos` (copy + reference)
- orphan `source.*` under `files/attachments/videos/{id}/`

Deleting a video removes the SQLite row; copy mode also deletes the sandbox folder. Reference mode never deletes the external file.

## Suggested FE flow

1. `pickLocalVideoNative()` → path  
2. `importLocalVideoNative({ sourcePath })` → `video`  
3. Optional: `probeLibraryVideoNative(id)`, `generateLibraryVideoThumbnailNative(id)`  
4. Optional: `transcribeLibraryVideoNative({ videoId })` → store note from `text`  
5. Playback: `libraryVideoPlaybackPathNative(id)` + asset protocol  
