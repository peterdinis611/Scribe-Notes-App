import i18n from '@/i18n'

export const BUILT_IN_TEMPLATE_CATEGORIES = [
  'general',
  'business',
  'personal',
  'creative',
] as const

export type BuiltInTemplateCategory = (typeof BUILT_IN_TEMPLATE_CATEGORIES)[number]
export type TemplateCategoryId = BuiltInTemplateCategory | `cat-${string}`

export interface CustomTemplateCategory {
  id: `cat-${string}`
  name: string
  createdAt: number
}

/** @deprecated Prefer getBuiltInCategoryLabel() for locale-aware labels. */
export const builtInCategoryLabels: Record<BuiltInTemplateCategory, string> = {
  general: 'Všeobecné',
  business: 'Biznis',
  personal: 'Osobné',
  creative: 'Kreatívne',
}

export const NEW_CATEGORY_SELECT_VALUE = '__new_category__'

export function isBuiltInCategory(id: string): id is BuiltInTemplateCategory {
  return (BUILT_IN_TEMPLATE_CATEGORIES as readonly string[]).includes(id)
}

export function isCustomCategoryId(id: string): id is `cat-${string}` {
  return id.startsWith('cat-')
}

export function isValidCategoryId(id: string): id is TemplateCategoryId {
  return isBuiltInCategory(id) || isCustomCategoryId(id)
}

export function createCustomCategory(name: string): CustomTemplateCategory {
  return {
    id: `cat-${crypto.randomUUID()}`,
    name: name.trim(),
    createdAt: Date.now(),
  }
}

export function getBuiltInCategoryLabel(id: BuiltInTemplateCategory): string {
  return i18n.t(`templates.categories.${id}`, {
    defaultValue: builtInCategoryLabels[id],
  })
}

export function getCategoryLabel(
  id: TemplateCategoryId,
  customCategories: CustomTemplateCategory[],
): string {
  if (isBuiltInCategory(id)) return getBuiltInCategoryLabel(id)
  return (
    customCategories.find((category) => category.id === id)?.name ??
    i18n.t('templates.customCategory', { defaultValue: 'Custom category' })
  )
}

export function parseStoredCustomCategories(raw: unknown): CustomTemplateCategory[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((item): CustomTemplateCategory | null => {
      if (!item || typeof item !== 'object') return null
      const record = item as Partial<CustomTemplateCategory>
      if (typeof record.id !== 'string' || !isCustomCategoryId(record.id)) return null
      if (typeof record.name !== 'string' || !record.name.trim()) return null

      return {
        id: record.id,
        name: record.name.trim(),
        createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
      }
    })
    .filter((item): item is CustomTemplateCategory => item !== null)
}
