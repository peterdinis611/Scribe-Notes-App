# scribe-capture

Local LAN capture HTTP protocol — phone opens a QR URL and posts notes into Inbox.

- Inline capture HTML page (`capture_page`)
- HTTP handler (`handle_connection`) with Bearer / header token + one-time form nonce
- LAN IP helpers for QR URLs

## Host wiring

Implement:

- `CaptureTokenAuth` — short-lived session validation
- `CaptureRateLimit` — per-client throttling
- `CaptureInbox` — create document in Inbox folder

Tauri keeps the accept loop, tray lifecycle, and DB insert in `src-tauri/src/capture/`.
