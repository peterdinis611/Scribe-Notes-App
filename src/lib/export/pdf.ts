import html2pdf from 'html2pdf.js'
import { resolveImageSrc } from '@/lib/editor/image-utils'

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

function prepareRenderContainer(html: string): HTMLDivElement {
  const parsed = new DOMParser().parseFromString(html, 'text/html')

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
  container.style.width = '794px'
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

export async function generatePdfFromHtml(html: string): Promise<{ blob: Blob; dataBase64: string }> {
  const container = prepareRenderContainer(html)
  document.body.appendChild(container)

  try {
    await document.fonts.ready
    await waitForImages(container)
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })

    const blob = (await html2pdf()
      .set({
        margin: [36, 36, 36, 36],
        filename: 'export.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
        },
        jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
      })
      .from(container)
      .outputPdf('blob')) as Blob

    const dataBase64 = await blobToBase64(blob)
    return { blob, dataBase64 }
  } finally {
    document.body.removeChild(container)
  }
}
