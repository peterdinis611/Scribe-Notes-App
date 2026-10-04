import type { AnyExtension } from '@tiptap/core'
import { Node } from '@tiptap/core'
import type { PluginNodeSpec } from '@/lib/plugins/types'

type OwnedExtension = {
  pluginId: string
  name: string
  extension: AnyExtension
}

const byKey = new Map<string, OwnedExtension>()

const NODE_NAME = /^[a-z][a-zA-Z0-9]{0,63}$/
const TAG_NAME = /^[a-z][a-z0-9-]{0,31}$/

export function sanitizePluginNodeSpec(spec: PluginNodeSpec): PluginNodeSpec {
  const name = spec.name?.trim() ?? ''
  if (!NODE_NAME.test(name)) {
    throw new Error(`Invalid plugin node name: ${spec.name}`)
  }
  const parseTag = (spec.parseTag ?? 'div').trim().toLowerCase()
  const renderTag = (spec.renderTag ?? parseTag).trim().toLowerCase()
  if (!TAG_NAME.test(parseTag) || !TAG_NAME.test(renderTag)) {
    throw new Error('Invalid plugin node HTML tag')
  }
  if (['script', 'iframe', 'object', 'embed', 'link', 'style'].includes(parseTag)) {
    throw new Error('Forbidden plugin node HTML tag')
  }
  if (['script', 'iframe', 'object', 'embed', 'link', 'style'].includes(renderTag)) {
    throw new Error('Forbidden plugin node HTML tag')
  }

  const attrs: PluginNodeSpec['attrs'] = {}
  for (const [key, value] of Object.entries(spec.attrs ?? {})) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,31}$/.test(key)) continue
    const def = value?.default
    if (
      def === undefined ||
      def === null ||
      typeof def === 'string' ||
      typeof def === 'number' ||
      typeof def === 'boolean'
    ) {
      attrs[key] = { default: def ?? null }
    }
  }

  return {
    name,
    group: typeof spec.group === 'string' ? spec.group.slice(0, 64) : 'block',
    inline: Boolean(spec.inline),
    atom: Boolean(spec.atom),
    selectable: spec.selectable !== false,
    draggable: Boolean(spec.draggable),
    defining: Boolean(spec.defining),
    content: typeof spec.content === 'string' ? spec.content.slice(0, 64) : undefined,
    marks: typeof spec.marks === 'string' ? spec.marks.slice(0, 64) : undefined,
    attrs,
    parseTag,
    renderTag,
    renderClass:
      typeof spec.renderClass === 'string'
        ? spec.renderClass.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
        : 'scribe-plugin-node',
    textContent:
      typeof spec.textContent === 'string' ? spec.textContent.slice(0, 200) : undefined,
  }
}

export function nodeSpecToExtension(spec: PluginNodeSpec): AnyExtension {
  const safe = sanitizePluginNodeSpec(spec)
  return Node.create({
    name: safe.name,
    group: safe.group,
    inline: safe.inline,
    atom: safe.atom,
    selectable: safe.selectable,
    draggable: safe.draggable,
    defining: safe.defining,
    content: safe.content,
    marks: safe.marks,
    addAttributes() {
      const attrs: Record<string, { default: unknown }> = {}
      for (const [key, value] of Object.entries(safe.attrs ?? {})) {
        attrs[key] = { default: value.default ?? null }
      }
      return attrs
    },
    parseHTML() {
      return [{ tag: `${safe.parseTag}[data-scribe-plugin-node="${safe.name}"]` }]
    },
    renderHTML({ HTMLAttributes }) {
      return [
        safe.renderTag!,
        {
          ...HTMLAttributes,
          'data-scribe-plugin-node': safe.name,
          class: safe.renderClass,
        },
        safe.textContent ?? safe.name,
      ]
    },
  })
}

function key(pluginId: string, name: string) {
  return `${pluginId}:${name}`
}

export function registerPluginExtension(pluginId: string, extension: AnyExtension) {
  const name = extension.name
  if (!name) throw new Error('Extension name is required')
  byKey.set(key(pluginId, name), { pluginId, name, extension })
}

export function registerPluginNodeSpec(pluginId: string, spec: PluginNodeSpec) {
  const extension = nodeSpecToExtension(spec)
  registerPluginExtension(pluginId, extension)
  return extension.name
}

export function unregisterPluginExtension(pluginId: string, name: string) {
  return byKey.delete(key(pluginId, name))
}

export function unregisterPluginExtensionsFor(pluginId: string) {
  let n = 0
  for (const [k, value] of [...byKey.entries()]) {
    if (value.pluginId === pluginId) {
      byKey.delete(k)
      n += 1
    }
  }
  return n
}

export function listPluginExtensions(): AnyExtension[] {
  return [...byKey.values()].map((entry) => entry.extension)
}

export function resetPluginExtensionsForTests() {
  byKey.clear()
}
