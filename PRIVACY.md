# Privacy Policy — Scribe

**Effective 20 September 2026 · Scribe 2.1.0**

Scribe is a local document editor for macOS. This notice describes what the app stores on your Mac, what it does not send to the developer, and when a feature you turn on may talk to another machine.

The operator of this software is **Peter Dinis**. Scribe does not run a cloud account service and does not collect analytics from the app.

## 1. Local first

Documents, the SQLite library, settings, revisions, and optional `.scribe` backups stay on the Mac user account that runs Scribe. There is no Scribe sign-in and no Scribe cloud.

## 2. What stays on this Mac

Depending on how you use the app, Scribe may store on disk:

- Document content, titles, folders, tags, comments, and version history
- Interface settings, themes, shortcuts, and language packs
- Optional Local AI indexes generated on this Mac
- Clipboard history kept inside the app
- Sync-conflict revisions when a file on disk and the in-app copy both change

macOS file permissions still apply. Scribe writes to the library you choose (default `~/Documents/Scribe`) and to its application data — it does not scan your whole disk.

## 3. What we do not collect

The app does not create an account with us. It does not send your notes, usage analytics, advertising identifiers, or crash telemetry to the developer.

## 4. Optional network use you start

Some features contact other servers only when you use them:

- **Google Fonts** — choosing a Google Font loads font metadata and CSS from Google. Google may see a typical web request (IP address, user agent).
- **Remote images and embeds** — a URL or YouTube embed you insert is fetched from that host.
- **Check for updates** — Diagnostics can open the GitHub Releases page in your browser. GitHub then sees that visit.

Scribe does not phone home on a schedule to report how you write.

## 5. MCP (Cursor / Claude)

The MCP bridge is optional and runs as a local stdio process on this Mac. It does not upload notes by itself. If you ask Cursor, Claude, or another host to read Scribe through tools, **that host’s privacy policy applies** to any content the model fetches.

## 6. Mobile capture

Mobile capture is a local Wi‑Fi listener on your Mac. Your phone talks to that Mac on the LAN. Scribe does not relay capture notes through a developer-operated server.

## 7. Your control

You can change the documents folder, export or delete the library, turn optional features off, and uninstall the app. Deleting Scribe’s application data and the documents folder removes the local library from that Mac.

## 8. Children

Scribe is a general writing tool. It is not directed at children under 13, and we do not knowingly collect personal information from children.

## 9. Changes

When this policy changes, the in-app notice and this file are updated with the app version. Continued use after an update means the current notice applies.

## 10. Contact

Questions about this policy: open an issue on [Scribe-Notes-App](https://github.com/peterdinis611/Scribe-Notes-App).

---

Slovak version: [PRIVACY.sk.md](PRIVACY.sk.md)
