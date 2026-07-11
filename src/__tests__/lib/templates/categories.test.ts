import { describe, expect, it } from 'vitest'
import {
  createCustomCategory,
  getCategoryLabel,
  isBuiltInCategory,
  isCustomCategoryId,
  isValidCategoryId,
  parseStoredCustomCategories,
} from '@/lib/templates/categories'

describe('template categories', () => {
  it('creates custom categories with stable id prefix', () => {
    const category = createCustomCategory('Marketing')
    expect(category.name).toBe('Marketing')
    expect(isCustomCategoryId(category.id)).toBe(true)
    expect(isValidCategoryId(category.id)).toBe(true)
  })

  it('resolves built-in and custom labels', () => {
    const custom = createCustomCategory('Škola')
    expect(getCategoryLabel('business', [custom])).toBe('Biznis')
    expect(getCategoryLabel(custom.id, [custom])).toBe('Škola')
  })

  it('parses stored custom categories safely', () => {
    const custom = createCustomCategory('Interné')
    const parsed = parseStoredCustomCategories([custom, { id: 'bad', name: '' }])
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.name).toBe('Interné')
  })

  it('detects built-in categories', () => {
    expect(isBuiltInCategory('general')).toBe(true)
    expect(isBuiltInCategory('cat-123')).toBe(false)
  })
})
