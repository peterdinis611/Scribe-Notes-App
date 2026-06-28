/** Shared typography and layout CSS for editor print mode, HTML export, and print preview. */
export const DOCUMENT_BODY_FONT =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif'

export const DOCUMENT_CONTENT_CSS = `
  font-family: ${DOCUMENT_BODY_FONT};
  font-size: 12pt;
  line-height: 1.6;
  letter-spacing: 0;
  color: #111111;
`

export const DOCUMENT_TIPTAP_CSS = `
  .document-content h1 { font-size: 24pt; font-weight: 700; margin: 0 0 12pt; line-height: 1.15; }
  .document-content h2 { font-size: 18pt; font-weight: 600; margin: 18pt 0 8pt; line-height: 1.2; }
  .document-content h3 { font-size: 14pt; font-weight: 600; margin: 14pt 0 6pt; line-height: 1.25; }
  .document-content h4 { font-size: 12pt; font-weight: 600; margin: 12pt 0 4pt; }
  .document-content h5 { font-size: 11pt; font-weight: 600; margin: 10pt 0 4pt; }
  .document-content h6 { font-size: 10pt; font-weight: 600; margin: 8pt 0 4pt; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
  .document-content p { margin: 0 0 10pt; }
  .document-content ul:not([data-type='taskList']), .document-content ol { margin: 0 0 10pt; padding-left: 20pt; }
  .document-content li { margin: 0 0 4pt; }
  .document-content blockquote { border-left: 3px solid #ccc; padding-left: 12pt; color: #555; margin: 0 0 10pt; }
  .document-content pre { background: #0d1117; color: #e6edf3; padding: 10pt; border-radius: 6pt; overflow-x: auto; margin: 0 0 10pt; }
  .document-content pre code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10pt; }
  .document-content code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10pt; background: #f3f4f6; padding: 1pt 4pt; border-radius: 4pt; }
  .document-content mark { background: #fff3a3; }
  .document-content table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
  .document-content th, .document-content td { border: 1px solid #ccc; padding: 8pt; text-align: left; }
  .document-content img { max-width: 100%; height: auto; }
  .document-content hr { border: none; border-top: 1px solid #ddd; margin: 16pt 0; }
`

export const DOCUMENT_HIGHLIGHT_CSS = `
  .hljs-comment, .hljs-quote { color: #8b949e; }
  .hljs-keyword, .hljs-selector-tag { color: #ff7b72; }
  .hljs-string, .hljs-addition { color: #a5d6ff; }
  .hljs-number, .hljs-literal { color: #79c0ff; }
  .hljs-title, .hljs-section { color: #d2a8ff; }
  .hljs-built_in, .hljs-type { color: #ffa657; }
  .hljs-attr, .hljs-variable { color: #79c0ff; }
`

export function buildWatermarkCss(opacity: number, angle: number): string {
  return `
    .export-watermark, .print-watermark {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 0;
    }
    .export-watermark span, .print-watermark span {
      transform: rotate(${angle}deg);
      font-size: 56pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: rgba(120, 120, 120, ${opacity});
      text-transform: uppercase;
      user-select: none;
    }
  `
}
