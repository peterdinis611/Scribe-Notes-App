import html2pdf from 'html2pdf.js'
import {
  buildHeaderFooterLines,
  formatExportDate,
  pxToPt,
} from '@/lib/editor/page-header-footer'
import {
  DEFAULT_PAGE_SETUP,
  normalizePageSetup,
  PAPER_SIZES,
  type PageSetup,
} from '@/lib/editor/page-setup'
import { shouldShowHeaderFooter } from '@/lib/editor/page-segments'

export type PdfExportOptions = {
  pageSetup?: PageSetup
  title?: string
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Nepodarilo sa prečítať PDF dáta.'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Nepodarilo sa prečítať PDF dáta.'))
    reader.readAsDataURL(blob)
  })
}

function createRenderFrame(html: string, pageSetup: PageSetup): HTMLIFrameElement {
  const paper = PAPER_SIZES[pageSetup.paperSize]
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    `width:${paper.width}px`,
    'border:0',
    'visibility:hidden',
    'pointer-events:none',
  ].join(';')

  document.body.appendChild(frame)

  const doc = frame.contentDocument
  if (!doc) {
    document.body.removeChild(frame)
    throw new Error('Nepodarilo sa pripraviť PDF náhľad.')
  }

  doc.open()
  doc.write(html)
  doc.close()

  return frame
}

async function waitForImages(root: ParentNode): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve()
            return
          }
          img.onload = () => resolve()
          img.onerror = () => resolve()
        }),
    ),
  )
}

async function prepareRenderRoot(html: string, pageSetup: PageSetup): Promise<{
  root: HTMLElement
  frame: HTMLIFrameElement
}> {
  const frame = createRenderFrame(html, pageSetup)
  const doc = frame.contentDocument
  if (!doc) {
    frame.remove()
    throw new Error('Nepodarilo sa pripraviť PDF náhľad.')
  }

  try {
    await doc.fonts.ready
    await waitForImages(doc)
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })

    const height = Math.max(
      doc.body.scrollHeight,
      doc.documentElement.scrollHeight,
      doc.body.offsetHeight,
      1,
    )
    frame.style.height = `${height}px`

    return { root: doc.body, frame }
  } catch (error) {
    frame.remove()
    throw error
  }
}

function applyHeaderFooterToPdf(
  pdf: {
    internal: {
      getNumberOfPages: () => number
      pageSize: { getWidth: () => number; getHeight: () => number }
    }
    setPage: (page: number) => void
    setFontSize: (size: number) => void
    setTextColor: (color: number) => void
    text: (text: string, x: number, y: number, options?: { align?: string }) => void
  },
  pageSetup: PageSetup,
  title: string,
): void {
  if (!pageSetup.headerFooter.enabled) return

  const marginTop = pxToPt(pageSetup.marginTop)
  const marginBottom = pxToPt(pageSetup.marginBottom)
  const marginLeft = pxToPt(pageSetup.marginLeft)
  const marginRight = pxToPt(pageSetup.marginRight)
  const totalPages = pdf.internal.getNumberOfPages()
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const date = formatExportDate()

  for (let page = 1; page <= totalPages; page += 1) {
    if (!shouldShowHeaderFooter(pageSetup, page)) continue

    pdf.setPage(page)
    const lines = buildHeaderFooterLines(pageSetup.headerFooter, {
      title,
      page,
      pages: totalPages,
      date,
    })

    pdf.setFontSize(9)
    pdf.setTextColor(120)

    if (lines.header) {
      pdf.text(lines.header, marginLeft, Math.max(18, marginTop * 0.45))
    }

    if (lines.footer) {
      pdf.text(lines.footer, pageWidth - marginRight, pageHeight - Math.max(18, marginBottom * 0.45), {
        align: 'right',
      })
    }
  }
}

function applyWatermarkToPdf(
  pdf: {
    internal: {
      getNumberOfPages: () => number
      pageSize: { getWidth: () => number; getHeight: () => number }
    }
    setPage: (page: number) => void
    setFontSize: (size: number) => void
    setTextColor: (color: number) => void
    text: (
      text: string,
      x: number,
      y: number,
      options?: { align?: string; angle?: number },
    ) => void
  },
  pageSetup: PageSetup,
): void {
  const normalized = normalizePageSetup(pageSetup)
  if (!normalized.watermark.enabled || !normalized.watermark.text.trim()) return

  const totalPages = pdf.internal.getNumberOfPages()
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const opacity = Math.round(normalized.watermark.opacity * 255)

  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page)
    pdf.setFontSize(42)
    pdf.setTextColor(opacity)
    pdf.text(normalized.watermark.text.trim(), pageWidth / 2, pageHeight / 2, {
      align: 'center',
      angle: normalized.watermark.angle,
    })
  }
}

export async function generatePdfFromHtml(
  html: string,
  options?: PdfExportOptions,
): Promise<{ blob: Blob; dataBase64: string }> {
  const pageSetup = normalizePageSetup(options?.pageSetup ?? DEFAULT_PAGE_SETUP)
  const title = options?.title ?? 'Dokument'
  const { root, frame } = await prepareRenderRoot(html, pageSetup)
  const doc = frame.contentDocument!

  const marginTop = pxToPt(pageSetup.marginTop)
  const marginBottom = pxToPt(pageSetup.marginBottom)
  const marginLeft = pxToPt(pageSetup.marginLeft)
  const marginRight = pxToPt(pageSetup.marginRight)
  const jsPdfFormat =
    pageSetup.paperSize === 'letter' ? 'letter' : pageSetup.paperSize

  const captureWidth = Math.max(
    root.scrollWidth,
    doc.documentElement.scrollWidth,
    PAPER_SIZES[pageSetup.paperSize].width,
  )
  const captureHeight = Math.max(root.scrollHeight, doc.documentElement.scrollHeight)

  try {
    const worker = html2pdf()
      .set({
        margin: [marginTop, marginRight, marginBottom, marginLeft],
        filename: 'export.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: 0,
          windowWidth: captureWidth,
          windowHeight: captureHeight,
        },
        jsPDF: { unit: 'pt', format: jsPdfFormat, orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      } as {
        margin: [number, number, number, number]
        filename: string
        image: { type: 'jpeg'; quality: number }
        html2canvas: Record<string, unknown>
        jsPDF: { unit: string; format: string; orientation: 'portrait' }
        pagebreak: { mode: string[] }
      })
      .from(root)
      .toPdf()

    const pdf = await worker.get('pdf')
    applyHeaderFooterToPdf(pdf, pageSetup, title)
    applyWatermarkToPdf(pdf, pageSetup)

    const blob = (await worker.output('blob')) as Blob
    const dataBase64 = await blobToBase64(blob)
    return { blob, dataBase64 }
  } finally {
    frame.remove()
  }
}
