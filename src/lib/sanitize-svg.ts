/**
 * Strip executable / active content from SVG before assigning to innerHTML.
 * Mermaid and chart renderers already use strict mode; this is defense in depth.
 */
export function sanitizeSvg(svg: string): string {
  if (!svg || typeof svg !== 'string') return ''
  if (typeof DOMParser === 'undefined') {
    return svg
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript:/gi, '')
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(svg, 'image/svg+xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    return ''
  }

  const forbidden = new Set([
    'script',
    'foreignobject',
    'iframe',
    'object',
    'embed',
    'link',
    'meta',
  ])

  const walk = (node: Element) => {
    const tag = node.tagName.toLowerCase()
    if (forbidden.has(tag)) {
      node.remove()
      return
    }

    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase()
      const value = attr.value
      if (name.startsWith('on')) {
        node.removeAttribute(attr.name)
        continue
      }
      if (
        (name === 'href' || name === 'xlink:href' || name === 'src') &&
        /^\s*javascript:/i.test(value)
      ) {
        node.removeAttribute(attr.name)
      }
    }

    for (const child of Array.from(node.children)) {
      walk(child)
    }
  }

  const root = doc.documentElement
  if (!root || root.tagName.toLowerCase() !== 'svg') {
    return ''
  }
  walk(root)
  return new XMLSerializer().serializeToString(root)
}
