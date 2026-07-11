import type { JSONContent } from '@tiptap/core'
import type { DocumentTemplate } from '@/lib/templates'
import { isValidCategoryId } from '@/lib/templates/categories'

export type CustomDocumentTemplate = DocumentTemplate & {
  isCustom: true
  createdAt: number
}

export type CustomTemplateInput = {
  name: string
  description: string
  category: DocumentTemplate['category']
  title: string
  content: JSONContent
}

export function createCustomTemplate(input: CustomTemplateInput): CustomDocumentTemplate {
  return {
    id: `custom-${crypto.randomUUID()}`,
    isCustom: true,
    createdAt: Date.now(),
    ...input,
  }
}

export function isCustomTemplate(
  template: DocumentTemplate,
): template is CustomDocumentTemplate {
  return 'isCustom' in template && template.isCustom === true
}

export function mergeTemplates(
  builtIn: DocumentTemplate[],
  custom: CustomDocumentTemplate[],
): DocumentTemplate[] {
  return [...builtIn, ...custom]
}

export function parseStoredCustomTemplates(raw: unknown): CustomDocumentTemplate[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((item): CustomDocumentTemplate | null => {
      if (!item || typeof item !== 'object') return null
      const record = item as Partial<CustomDocumentTemplate>
      if (
        typeof record.id !== 'string' ||
        typeof record.name !== 'string' ||
        typeof record.title !== 'string' ||
        !record.content ||
        typeof record.content !== 'object'
      ) {
        return null
      }

      return {
        id: record.id,
        name: record.name,
        description: typeof record.description === 'string' ? record.description : '',
        category:
          typeof record.category === 'string' && isValidCategoryId(record.category)
            ? record.category
            : 'general',
        title: record.title,
        content: record.content as JSONContent,
        isCustom: true,
        createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
      }
    })
    .filter((item): item is CustomDocumentTemplate => item !== null)
}
