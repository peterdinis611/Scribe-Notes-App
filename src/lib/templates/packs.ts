import type { JSONContent } from '@tiptap/core'
import {
  createAndStoreCategory,
  insertStoredTemplate,
} from '@/lib/db/template-collections'
import type { CustomTemplateCategory, TemplateCategoryId } from '@/lib/templates/categories'
import {
  isBuiltInCategory,
  isCustomCategoryId,
  isValidCategoryId,
} from '@/lib/templates/categories'
import {
  createCustomTemplate,
  type CustomDocumentTemplate,
} from '@/lib/templates/custom'

export const TEMPLATE_PACK_VERSION = 1 as const
export const TEMPLATE_PACK_EXTENSION = 'scribe-templates.json'

export type TemplatePackItem = {
  name: string
  title: string
  description?: string
  /** Built-in id, existing custom id, or a category display name to create. */
  categoryId?: string
  content: JSONContent
}

export type TemplatePack = {
  version: typeof TEMPLATE_PACK_VERSION
  name: string
  locale?: string
  templates: TemplatePackItem[]
}

export type BundledTemplatePackMeta = {
  id: string
  /** i18n key under `templates.packs.bundled.<id>` */
  labelKey: string
  pack: TemplatePack
}

export type ImportTemplatePackResult = {
  packName: string
  importedCount: number
  templates: CustomDocumentTemplate[]
}

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

export function isTemplatePack(value: unknown): value is TemplatePack {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<TemplatePack>
  return (
    record.version === TEMPLATE_PACK_VERSION &&
    typeof record.name === 'string' &&
    record.name.trim().length > 0 &&
    Array.isArray(record.templates)
  )
}

export function parseTemplatePack(raw: unknown): TemplatePack {
  if (typeof raw === 'string') {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('Neplatný JSON balíka šablón')
    }
    return parseTemplatePack(parsed)
  }

  if (!isTemplatePack(raw)) {
    throw new Error('Neplatný formát balíka šablón (.scribe-templates.json)')
  }

  const templates = raw.templates
    .map((item): TemplatePackItem | null => {
      if (!item || typeof item !== 'object') return null
      const record = item as Partial<TemplatePackItem>
      if (typeof record.name !== 'string' || !record.name.trim()) return null
      if (typeof record.title !== 'string' || !record.title.trim()) return null
      if (!record.content || typeof record.content !== 'object') return null

      return {
        name: record.name.trim(),
        title: record.title.trim(),
        description:
          typeof record.description === 'string' ? record.description.trim() : undefined,
        categoryId:
          typeof record.categoryId === 'string' && record.categoryId.trim()
            ? record.categoryId.trim()
            : undefined,
        content: record.content as JSONContent,
      }
    })
    .filter((item): item is TemplatePackItem => item !== null)

  if (templates.length === 0) {
    throw new Error('Balík neobsahuje žiadne platné šablóny')
  }

  return {
    version: TEMPLATE_PACK_VERSION,
    name: raw.name.trim(),
    locale: typeof raw.locale === 'string' && raw.locale.trim() ? raw.locale.trim() : undefined,
    templates,
  }
}

export function serializeTemplatePack(pack: TemplatePack): string {
  const normalized: TemplatePack = {
    version: TEMPLATE_PACK_VERSION,
    name: pack.name.trim(),
    ...(pack.locale?.trim() ? { locale: pack.locale.trim() } : {}),
    templates: pack.templates.map((item) => ({
      name: item.name.trim(),
      title: item.title.trim(),
      ...(item.description?.trim() ? { description: item.description.trim() } : {}),
      ...(item.categoryId?.trim() ? { categoryId: item.categoryId.trim() } : {}),
      content: item.content ?? EMPTY_DOC,
    })),
  }
  return `${JSON.stringify(normalized, null, 2)}\n`
}

export function buildTemplatePackFromCustoms(args: {
  name: string
  locale?: string
  templates: CustomDocumentTemplate[]
}): TemplatePack {
  const templates = args.templates.map((template) => ({
    name: template.name,
    title: template.title,
    description: template.description || undefined,
    categoryId: template.category,
    content: structuredClone(template.content),
  }))

  if (templates.length === 0) {
    throw new Error('Žiadne vlastné šablóny na export')
  }

  return {
    version: TEMPLATE_PACK_VERSION,
    name: args.name.trim() || 'Scribe templates',
    locale: args.locale?.trim() || undefined,
    templates,
  }
}

async function resolveCategoryId(
  categoryId: string | undefined,
  packName: string,
  categories: CustomTemplateCategory[],
  ensuredByName: Map<string, TemplateCategoryId>,
): Promise<{ category: TemplateCategoryId; categories: CustomTemplateCategory[] }> {
  let nextCategories = categories

  if (categoryId && isBuiltInCategory(categoryId)) {
    return { category: categoryId, categories: nextCategories }
  }

  if (categoryId && isCustomCategoryId(categoryId)) {
    const existing = nextCategories.find((item) => item.id === categoryId)
    if (existing) return { category: existing.id, categories: nextCategories }
  }

  const nameHint =
    categoryId && !isValidCategoryId(categoryId) ? categoryId : packName
  const normalized = nameHint.trim().toLowerCase()
  const cached = ensuredByName.get(normalized)
  if (cached) return { category: cached, categories: nextCategories }

  const created = await createAndStoreCategory(nameHint, nextCategories)
  nextCategories = nextCategories.some((item) => item.id === created.id)
    ? nextCategories
    : [...nextCategories, created]
  ensuredByName.set(normalized, created.id)
  return { category: created.id, categories: nextCategories }
}

export async function importTemplatePack(
  pack: TemplatePack,
  categories: CustomTemplateCategory[],
): Promise<ImportTemplatePackResult> {
  const ensuredByName = new Map<string, TemplateCategoryId>()
  let nextCategories = categories
  const created: CustomDocumentTemplate[] = []

  for (const item of pack.templates) {
    const resolved = await resolveCategoryId(
      item.categoryId,
      pack.name,
      nextCategories,
      ensuredByName,
    )
    nextCategories = resolved.categories

    const template = createCustomTemplate({
      name: item.name,
      description: item.description ?? '',
      category: resolved.category,
      title: item.title,
      content: structuredClone(item.content),
    })
    await insertStoredTemplate(template)
    created.push(template)
  }

  return {
    packName: pack.name,
    importedCount: created.length,
    templates: created,
  }
}
