import { mergeAttributes, Node } from '@tiptap/core'

export type CalloutVariant = 'info' | 'tip' | 'warning' | 'danger'

type VariantMeta = { id: CalloutVariant; label: string; icon: string }

export const CALLOUT_VARIANTS: VariantMeta[] = [
  { id: 'info', label: 'Info', icon: 'ℹ️' },
  { id: 'tip', label: 'Tip', icon: '💡' },
  { id: 'warning', label: 'Varovanie', icon: '⚠️' },
  { id: 'danger', label: 'Dôležité', icon: '🛑' },
]

function variantIcon(variant: string): string {
  return CALLOUT_VARIANTS.find((item) => item.id === variant)?.icon ?? 'ℹ️'
}

function normalizeVariant(value: unknown): CalloutVariant {
  return CALLOUT_VARIANTS.some((item) => item.id === value) ? (value as CalloutVariant) : 'info'
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** Wrap the current block(s) in a callout. */
      setCallout: (variant?: CalloutVariant) => ReturnType
      /** Toggle a callout wrapper around the current block(s). */
      toggleCallout: (variant?: CalloutVariant) => ReturnType
      /** Remove the surrounding callout. */
      unsetCallout: () => ReturnType
    }
  }
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: 'info',
        parseHTML: (element) => normalizeVariant(element.getAttribute('data-variant')),
        renderHTML: (attributes) => ({ 'data-variant': attributes.variant }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-callout': '',
        class: `callout callout--${normalizeVariant(node.attrs.variant)}`,
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setCallout:
        (variant = 'info') =>
        ({ commands }) =>
          commands.wrapIn(this.name, { variant }),
      toggleCallout:
        (variant = 'info') =>
        ({ commands }) =>
          commands.toggleWrap(this.name, { variant }),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div')
      const setClasses = (variant: string) => {
        dom.className = `callout callout--${variant}`
        dom.dataset.variant = variant
      }
      dom.dataset.callout = ''
      setClasses(normalizeVariant(node.attrs.variant))

      const icon = document.createElement('div')
      icon.className = 'callout-icon'
      icon.contentEditable = 'false'
      icon.textContent = variantIcon(node.attrs.variant)

      const toolbar = document.createElement('div')
      toolbar.className = 'callout-toolbar'
      toolbar.contentEditable = 'false'
      for (const variant of CALLOUT_VARIANTS) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'callout-variant-btn'
        button.dataset.variant = variant.id
        button.title = variant.label
        button.textContent = variant.icon
        button.addEventListener('mousedown', (event) => {
          event.preventDefault()
          event.stopPropagation()
          if (!editor.isEditable) return
          const pos = getPos()
          if (pos == null) return
          editor
            .chain()
            .command(({ tr }) => {
              const current = editor.state.doc.nodeAt(pos)
              if (!current) return false
              tr.setNodeMarkup(pos, undefined, { ...current.attrs, variant: variant.id })
              return true
            })
            .run()
        })
        toolbar.appendChild(button)
      }

      const content = document.createElement('div')
      content.className = 'callout-content'

      dom.append(icon, toolbar, content)

      return {
        dom,
        contentDOM: content,
        update(updated) {
          if (updated.type.name !== 'callout') return false
          const variant = normalizeVariant(updated.attrs.variant)
          setClasses(variant)
          icon.textContent = variantIcon(variant)
          return true
        },
      }
    }
  },
})
