import html2pdf from 'html2pdf.js'
import { resolveImageSrc } from '@/lib/editor/image-utils'
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

function prepareRenderContainer(html: string, pageSetup: PageSetup): HTMLDivElement {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const paper = PAPER_SIZES[pageSetup.paperSize]

  parsed.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src')
    if (src) img.setAttribute('src', resolveImageSrc(src))
  })

  const styles = parsed.querySelector('style')?.textContent ?? ''
  const bodyHtml = parsed.body?.innerHTML ?? html

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-10000px'
  container.style.top = '0'
  container.style.width = `${paper.width}px`
  container.style.background = '#ffffff'
  container.style.color = '#111111'

  const styleEl = document.createElement('style')
  styleEl.textContent = styles
  container.appendChild(styleEl)

  const content = document.createElement('div')
  content.innerHTML = bodyHtml
  container.appendChild(content)

  return container
}

async function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'))
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

export async function generatePdfFromHtml(
  html: string,
  options?: PdfExportOptions,
): Promise<{ blob: Blob; dataBase64: string }> {
  const pageSetup = normalizePageSetup(options?.pageSetup ?? DEFAULT_PAGE_SETUP)
  const title = options?.title ?? 'Dokument'
  const container = prepareRenderContainer(html, pageSetup)
  document.body.appendChild(container)

  const marginTop = pxToPt(pageSetup.marginTop)
  const marginBottom = pxToPt(pageSetup.marginBottom)
  const marginLeft = pxToPt(pageSetup.marginLeft)
  const marginRight = pxToPt(pageSetup.marginRight)
  const jsPdfFormat =
    pageSetup.paperSize === 'letter' ? 'letter' : pageSetup.paperSize

  try {
    await document.fonts.ready
    await waitForImages(container)
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })

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
        },
        jsPDF: { unit: 'pt', format: jsPdfFormat, orientation: 'portrait' },
      })
      .from(container)
      .toPdf()

    const pdf = await worker.get('pdf')
    applyHeaderFooterToPdf(pdf, pageSetup, title)

    const blob = (await worker.output('blob')) as Blob
    const dataBase64 = await blobToBase64(blob)
    return { blob, dataBase64 }
  } finally {
    document.body.removeChild(container)
  }
}
