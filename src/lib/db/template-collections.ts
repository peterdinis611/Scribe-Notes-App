import type { JSONContent } from '@tiptap/core'
import { createCollection, type Collection } from '@tanstack/react-db'
import { localOnlyCollectionOptions } from '@tanstack/db'
import {
  createCustomTemplate,
  createCustomTemplateCategory,
  deleteCustomTemplate,
  deleteCustomTemplateCategory,
  listCustomTemplateCategories,
  listCustomTemplates,
} from '@/lib/db/api'
import type { CustomTemplateCategory } from '@/lib/templates/categories'
import { createCustomCategory } from '@/lib/templates/categories'
import type { CustomDocumentTemplate } from '@/lib/templates/custom'
import {
  readCustomTemplateCategories,
  readCustomTemplates,
} from '@/store/persistence'

export type StoredCustomTemplateRow = {
  id: string
  name: string
  description: string
  category: string
  title: string
  contentJson: string
  createdAt: number
}

export type StoredCustomCategoryRow = {
  id: string
  name: string
  createdAt: number
}

let initPromise: Promise<void> | null = null

export let customTemplatesCollection: Collection<StoredCustomTemplateRow, string> | null = null

export let customCategoriesCollection: Collection<StoredCustomCategoryRow, string> | null = null

export function areTemplateCollectionsReady() {
  return customTemplatesCollection !== null && customCategoriesCollection !== null
}

function seedCollection<T extends { id: string }>(
  collection: Collection<T, string>,
  rows: T[],
) {
  for (const row of rows) {
    if (!collection.has(row.id)) {
      collection.insert(row)
    }
  }
}

export async function initTemplateCollections() {
  if (initPromise) return initPromise

  initPromise = (async () => {
    customCategoriesCollection = createCollection(
      localOnlyCollectionOptions<StoredCustomCategoryRow, string>({
        id: 'custom-template-categories',
        getKey: (item) => item.id,
      }),
    )

    customTemplatesCollection = createCollection(
      localOnlyCollectionOptions<StoredCustomTemplateRow, string>({
        id: 'custom-templates',
        getKey: (item) => item.id,
      }),
    )

    await migrateLegacyLocalStorage()

    const [categories, templates] = await Promise.all([
      listCustomTemplateCategories(),
      listCustomTemplates(),
    ])

    seedCollection(
      customCategoriesCollection!,
      categories.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.createdAt,
      })),
    )

    seedCollection(
      customTemplatesCollection!,
      templates.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        title: row.title,
        contentJson: row.contentJson,
        createdAt: row.createdAt,
      })),
    )
  })()

  return initPromise
}

async function migrateLegacyLocalStorage() {
  if (localStorage.getItem('scribe-templates-db-migrated') === '1') return

  const legacyTemplates = readCustomTemplates()
  const legacyCategories = readCustomTemplateCategories()
  if (legacyTemplates.length === 0 && legacyCategories.length === 0) {
    localStorage.setItem('scribe-templates-db-migrated', '1')
    return
  }

  for (const category of legacyCategories) {
    const row = toStoredCategory(category)
    await createCustomTemplateCategory({
      id: row.id,
      name: row.name,
      createdAt: row.createdAt,
    })
  }

  for (const template of legacyTemplates) {
    const row = toStoredTemplate(template)
    await createCustomTemplate({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      title: row.title,
      contentJson: row.contentJson,
      createdAt: row.createdAt,
    })
  }

  localStorage.removeItem('scribe-custom-templates')
  localStorage.removeItem('scribe-custom-template-categories')
  localStorage.setItem('scribe-templates-db-migrated', '1')
}

export function toStoredTemplate(template: CustomDocumentTemplate): StoredCustomTemplateRow {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    title: template.title,
    contentJson: JSON.stringify(template.content),
    createdAt: template.createdAt,
  }
}

export function fromStoredTemplate(row: StoredCustomTemplateRow): CustomDocumentTemplate {
  let content: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }
  try {
    content = JSON.parse(row.contentJson) as JSONContent
  } catch {
    // Keep fallback content for corrupted rows.
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category as CustomDocumentTemplate['category'],
    title: row.title,
    content,
    isCustom: true,
    createdAt: row.createdAt,
  }
}

export function toStoredCategory(category: CustomTemplateCategory): StoredCustomCategoryRow {
  return {
    id: category.id,
    name: category.name,
    createdAt: category.createdAt,
  }
}

export function fromStoredCategory(row: StoredCustomCategoryRow): CustomTemplateCategory {
  return {
    id: row.id as CustomTemplateCategory['id'],
    name: row.name,
    createdAt: row.createdAt,
  }
}

export async function insertStoredCategory(category: CustomTemplateCategory) {
  await initTemplateCollections()
  if (!customCategoriesCollection) {
    throw new Error('Kategórie nie sú pripravené')
  }

  const row = toStoredCategory(category)
  await createCustomTemplateCategory({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
  })
  customCategoriesCollection.insert(row)
}

export async function insertStoredTemplate(template: CustomDocumentTemplate) {
  await initTemplateCollections()
  if (!customTemplatesCollection) {
    throw new Error('Šablóny nie sú pripravené')
  }

  const row = toStoredTemplate(template)
  await createCustomTemplate({
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    title: row.title,
    contentJson: row.contentJson,
    createdAt: row.createdAt,
  })
  customTemplatesCollection.insert(row)
}

export async function deleteStoredCategory(id: string) {
  await initTemplateCollections()
  if (!customCategoriesCollection || !customTemplatesCollection) {
    throw new Error('Kategórie nie sú pripravené')
  }

  await deleteCustomTemplateCategory(id)
  customCategoriesCollection.delete(id)

  const templates = await listCustomTemplates()
  for (const row of templates) {
    if (!customTemplatesCollection.has(row.id)) continue
    customTemplatesCollection.update(row.id, (draft) => {
      draft.category = row.category
    })
  }
}

export async function deleteStoredTemplate(id: string) {
  await initTemplateCollections()
  if (!customTemplatesCollection) {
    throw new Error('Šablóny nie sú pripravené')
  }

  await deleteCustomTemplate(id)
  customTemplatesCollection.delete(id)
}

export function findCategoryByName(name: string, categories: CustomTemplateCategory[]) {
  const normalized = name.trim().toLowerCase()
  return categories.find((item) => item.name.toLowerCase() === normalized) ?? null
}

export async function createAndStoreCategory(name: string, categories: CustomTemplateCategory[]) {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('Zadajte názov kategórie')
  }

  const existing = findCategoryByName(trimmed, categories)
  if (existing) return existing

  const created = createCustomCategory(trimmed)
  await insertStoredCategory(created)
  return created
}
