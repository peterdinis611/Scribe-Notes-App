import i18n from '@/i18n'
import {
  buildHeaderFooterLinesNative,
  formatExportDateNative,
  resolveHeaderFooterTemplateNative,
} from '@/lib/db/api'
import type { PageHeaderFooter } from '@/lib/editor/page-setup'
import { isTauriRuntime } from '@/lib/tauri'

/** Keep in sync with `crates/scribe-ui/src/page_header_footer.rs`. */

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

export async function resolveHeaderFooterTemplateAsync(
  template: string,
  context: HeaderFooterContext,
): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await resolveHeaderFooterTemplateNative(template, context)
    } catch {
      /* fall through */
    }
  }
  return resolveHeaderFooterTemplate(template, context)
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
  const pageLabel = config.showPageNumber
    ? i18n.t('pagination.summary', {
        current: context.page,
        total: context.pages,
      })
    : ''
  const footer = [footerBase, pageLabel].filter(Boolean).join(' · ')

  return { header, footer }
}

export async function buildHeaderFooterLinesAsync(
  config: PageHeaderFooter,
  context: HeaderFooterContext,
): Promise<{ header: string; footer: string }> {
  if (isTauriRuntime()) {
    try {
      const paginationSummary = (i18n.language ?? 'en').startsWith('sk')
        ? 'Strana {{current}} / {{total}}'
        : 'Page {{current}} / {{total}}'
      return await buildHeaderFooterLinesNative(config, context, paginationSummary)
    } catch {
      /* fall through */
    }
  }
  return buildHeaderFooterLines(config, context)
}

export function formatExportDate(date = new Date()): string {
  const locale = i18n.language?.startsWith('sk') ? 'sk-SK' : 'en-US'
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export async function formatExportDateAsync(date = new Date()): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await formatExportDateNative(
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate(),
        i18n.language ?? 'en',
      )
    } catch {
      /* fall through */
    }
  }
  return formatExportDate(date)
}

/** px at 96dpi → jsPDF points (72dpi) */
export function pxToPt(px: number): number {
  return Math.round(px * 0.75)
}
