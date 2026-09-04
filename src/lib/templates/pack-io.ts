import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@/lib/db/api'
import type { CustomTemplateCategory } from '@/lib/templates/categories'
import type { CustomDocumentTemplate } from '@/lib/templates/custom'
import {
  TEMPLATE_PACK_EXTENSION,
  buildTemplatePackFromCustoms,
  importTemplatePack,
  parseTemplatePack,
  serializeTemplatePack,
  type ImportTemplatePackResult,
  type TemplatePack,
} from '@/lib/templates/packs'

const PACK_FILTERS = [
  {
    name: 'Scribe template pack',
    extensions: [TEMPLATE_PACK_EXTENSION, 'json'],
  },
]

function sanitizePackFileName(name: string) {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim()
  return `${cleaned || 'scribe-templates'}.${TEMPLATE_PACK_EXTENSION}`
}

export async function pickAndImportTemplatePack(
  categories: CustomTemplateCategory[],
  options?: { title?: string },
): Promise<ImportTemplatePackResult | null> {
  const selected = await open({
    multiple: false,
    title: options?.title ?? 'Import template pack',
    filters: PACK_FILTERS,
    fileAccessMode: 'scoped',
  })

  if (!selected || Array.isArray(selected)) return null

  const raw = await readTextFile(selected)
  const pack = parseTemplatePack(raw)
  return importTemplatePack(pack, categories)
}

export async function exportCustomTemplatesPack(args: {
  name: string
  locale?: string
  templates: CustomDocumentTemplate[]
  dialogTitle?: string
}): Promise<string | null> {
  const pack = buildTemplatePackFromCustoms(args)
  const path = await save({
    title: args.dialogTitle ?? 'Export template pack',
    defaultPath: sanitizePackFileName(pack.name),
    filters: PACK_FILTERS,
  })
  if (!path) return null

  await writeTextFile(path, serializeTemplatePack(pack))
  return path
}

export async function importBundledTemplatePack(
  pack: TemplatePack,
  categories: CustomTemplateCategory[],
): Promise<ImportTemplatePackResult> {
  return importTemplatePack(pack, categories)
}
