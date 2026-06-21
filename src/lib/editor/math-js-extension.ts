import { Extension, mergeAttributes, Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/core'
import { evaluateMathExpression } from '@/lib/editor/math-js'

type MathNodeOptions = {
  onEdit?: (editor: Editor, node: PMNode, pos: number, expression: string) => void
}

function renderMathNodeContent(container: HTMLElement, expression: string, display: 'inline' | 'block') {
  const evaluation = evaluateMathExpression(expression)
  container.replaceChildren()

  const exprEl = document.createElement('span')
  exprEl.className = 'math-js-expression'
  exprEl.textContent = expression || '…'
  container.appendChild(exprEl)

  if (evaluation.ok) {
    const eqEl = document.createElement('span')
    eqEl.className = 'math-js-equals'
    eqEl.textContent = display === 'block' ? ' =' : ' = '
    container.appendChild(eqEl)

    const resultEl = document.createElement('span')
    resultEl.className = 'math-js-result'
    resultEl.textContent = evaluation.result
    container.appendChild(resultEl)
    container.classList.remove('math-js-node--error')
  } else if (expression.trim()) {
    container.classList.add('math-js-node--error')
    container.title = evaluation.error
  } else {
    container.classList.remove('math-js-node--error')
  }
}

function createMathNodeView(display: 'inline' | 'block', options: MathNodeOptions) {
  return ({
    node,
    getPos,
    editor,
  }: {
    node: PMNode
    getPos: () => number | undefined
    editor: Editor
  }) => {
    const wrapper = document.createElement(display === 'inline' ? 'span' : 'div')
    wrapper.className = `math-js-node math-js-node--${display}`
    if (editor.isEditable) {
      wrapper.classList.add('math-js-node--editable')
    }
    wrapper.dataset.type = display === 'inline' ? 'math-inline' : 'math-block'

    const render = (currentNode: PMNode) => {
      wrapper.setAttribute('data-expression', currentNode.attrs.expression ?? '')
      renderMathNodeContent(wrapper, String(currentNode.attrs.expression ?? ''), display)
    }

    const handleClick = (event: MouseEvent) => {
      if (!editor.isEditable) return
      event.preventDefault()
      event.stopPropagation()
      const pos = getPos()
      if (pos == null) return
      options.onEdit?.(editor, node, pos, String(node.attrs.expression ?? ''))
    }

    wrapper.addEventListener('click', handleClick)
    render(node)

    return {
      dom: wrapper,
      update(updatedNode: PMNode) {
        render(updatedNode)
        return true
      },
      destroy() {
        wrapper.removeEventListener('click', handleClick)
      },
    }
  }
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathInline: {
      insertMathInline: (options: { expression: string; pos?: number }) => ReturnType
      updateMathInline: (options?: { expression?: string; pos?: number }) => ReturnType
      deleteMathInline: (options?: { pos?: number }) => ReturnType
    }
    mathBlock: {
      insertMathBlock: (options: { expression: string; pos?: number }) => ReturnType
      updateMathBlock: (options?: { expression?: string; pos?: number }) => ReturnType
      deleteMathBlock: (options?: { pos?: number }) => ReturnType
    }
  }
}

export const MathInline = Node.create<MathNodeOptions>({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,

  addOptions() {
    return {
      onEdit: undefined,
    }
  },

  addAttributes() {
    return {
      expression: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-expression') ?? '',
        renderHTML: (attributes) => ({
          'data-expression': attributes.expression,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'math-inline' })]
  },

  addCommands() {
    return {
      insertMathInline:
        (options) =>
        ({ editor, tr }) => {
          const expression = options.expression.trim()
          if (!expression) return false
          const from = options.pos ?? editor.state.selection.from
          tr.replaceWith(from, from, this.type.create({ expression }))
          return true
        },
      updateMathInline:
        (options) =>
        ({ editor, tr }) => {
          const pos = options?.pos ?? editor.state.selection.from
          const node = editor.state.doc.nodeAt(pos)
          if (!node || node.type.name !== this.name) return false
          tr.setNodeMarkup(pos, this.type, {
            ...node.attrs,
            expression: options?.expression ?? node.attrs.expression,
          })
          return true
        },
      deleteMathInline:
        (options) =>
        ({ editor, tr }) => {
          const pos = options?.pos ?? editor.state.selection.from
          const node = editor.state.doc.nodeAt(pos)
          if (!node || node.type.name !== this.name) return false
          tr.delete(pos, pos + node.nodeSize)
          return true
        },
    }
  },

  addNodeView() {
    return createMathNodeView('inline', this.options)
  },
})

export const MathBlock = Node.create<MathNodeOptions>({
  name: 'mathBlock',
  group: 'block',
  atom: true,

  addOptions() {
    return {
      onEdit: undefined,
    }
  },

  addAttributes() {
    return {
      expression: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-expression') ?? '',
        renderHTML: (attributes) => ({
          'data-expression': attributes.expression,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'math-block' })]
  },

  addCommands() {
    return {
      insertMathBlock:
        (options) =>
        ({ editor, tr }) => {
          const expression = options.expression.trim()
          if (!expression) return false
          const from = options.pos ?? editor.state.selection.from
          tr.replaceWith(from, from, this.type.create({ expression }))
          return true
        },
      updateMathBlock:
        (options) =>
        ({ editor, tr }) => {
          const pos = options?.pos ?? editor.state.selection.from
          const node = editor.state.doc.nodeAt(pos)
          if (!node || node.type.name !== this.name) return false
          tr.setNodeMarkup(pos, this.type, {
            ...node.attrs,
            expression: options?.expression ?? node.attrs.expression,
          })
          return true
        },
      deleteMathBlock:
        (options) =>
        ({ editor, tr }) => {
          const pos = options?.pos ?? editor.state.selection.from
          const node = editor.state.doc.nodeAt(pos)
          if (!node || node.type.name !== this.name) return false
          tr.delete(pos, pos + node.nodeSize)
          return true
        },
    }
  },

  addNodeView() {
    return createMathNodeView('block', this.options)
  },
})

function createMathEditHandler(type: 'inline' | 'block') {
  return (editor: Editor, _node: PMNode, pos: number, expression: string) => {
    const next = window.prompt(
      type === 'inline' ? 'Math.js výraz (v riadku)' : 'Math.js výraz (blok)',
      expression,
    )
    if (next === null) return
    const trimmed = next.trim()
    if (!trimmed) {
      if (type === 'inline') editor.chain().focus().deleteMathInline({ pos }).run()
      else editor.chain().focus().deleteMathBlock({ pos }).run()
      return
    }
    if (type === 'inline') editor.chain().focus().updateMathInline({ expression: trimmed, pos }).run()
    else editor.chain().focus().updateMathBlock({ expression: trimmed, pos }).run()
  }
}

export const MathJs = Extension.create({
  name: 'mathJs',
  addExtensions() {
    return [
      MathInline.configure({ onEdit: createMathEditHandler('inline') }),
      MathBlock.configure({ onEdit: createMathEditHandler('block') }),
    ]
  },
})
