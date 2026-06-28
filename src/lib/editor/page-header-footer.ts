import type { PageHeaderFooter } from '@/lib/editor/page-setup'

export type HeaderFooterContext = {
  title: string
  page: number
  pages: number
  date: string
}

export function resolveHeaderFooterTemplate(
  template: string,
  context: HeaderFooterContext,
): string {
  return template
    .replaceAll('{title}', context.title)
    .replaceAll('{page}', String(context.page))
    .replaceAll('{pages}', String(context.pages))
    .replaceAll('{date}', context.date)
    .trim()
}

export function buildHeaderFooterLines(
  config: PageHeaderFooter,
  context: HeaderFooterContext,
): { header: string; footer: string } {
  if (!config.enabled) {
    return { header: '', footer: '' }
  }

  const header = resolveHeaderFooterTemplate(config.headerText, context)
  const footerBase = resolveHeaderFooterTemplate(config.footerText, context)
  const pageLabel = config.showPageNumber ? `Strana ${context.page} / ${context.pages}` : ''
  const footer = [footerBase, pageLabel].filter(Boolean).join(' · ')

  return { header, footer }
}

export function formatExportDate(date = new Date()): string {
  return date.toLocaleDateString('sk-SK', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** px at 96dpi → jsPDF points (72dpi) */
export function pxToPt(px: number): number {
  return Math.round(px * 0.75)
}
