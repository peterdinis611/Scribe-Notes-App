import { tiptapJsonToHtml, type HtmlExportOptions } from '@/lib/export/html'

export function printDocumentHtml(html: string, title: string): void {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1024,height=768')
  if (!printWindow) {
    window.alert('Nepodarilo sa otvoriť okno tlače. Povoľte vyskakovacie okná pre Scribe.')
    return
  }

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.document.title = title

  const triggerPrint = () => {
    printWindow.focus()
    printWindow.print()
  }

  printWindow.onload = triggerPrint
  window.setTimeout(triggerPrint, 500)
}

export function printDocumentFromContent(
  contentJson: string,
  title: string,
  options?: HtmlExportOptions,
): void {
  const html = tiptapJsonToHtml(contentJson, title, {
    ...options,
    forPrint: true,
  })
  printDocumentHtml(html, title)
}
