import type { Editor } from '@tiptap/react'
import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export function ToolbarButton({
  active,
  disabled,
  onClick,
  children,
  label,
  className,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn('toolbar-btn', active && 'is-active', className)}
    >
      {children}
    </button>
  )
}

export function ToolbarGroup({
  children,
  label,
  className,
}: {
  children: React.ReactNode
  label: string
  className?: string
}) {
  return (
    <div className={cn('toolbar-group', className)} aria-label={label}>
      {children}
    </div>
  )
}

export function ToolbarDivider() {
  return <div className="toolbar-divider" aria-hidden="true" />
}

export function ToolbarLabel({ children }: { children: React.ReactNode }) {
  return <span className="toolbar-label">{children}</span>
}

type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'blockquote'

const BLOCK_TYPES: { id: BlockType; label: string }[] = [
  { id: 'paragraph', label: 'Odsek' },
  { id: 'h1', label: 'Nadpis 1' },
  { id: 'h2', label: 'Nadpis 2' },
  { id: 'h3', label: 'Nadpis 3' },
  { id: 'blockquote', label: 'Citácia' },
]

function getBlockType(editor: Editor): BlockType {
  if (editor.isActive('heading', { level: 1 })) return 'h1'
  if (editor.isActive('heading', { level: 2 })) return 'h2'
  if (editor.isActive('heading', { level: 3 })) return 'h3'
  if (editor.isActive('blockquote')) return 'blockquote'
  return 'paragraph'
}

function setBlockType(editor: Editor, type: BlockType) {
  const chain = editor.chain().focus()

  switch (type) {
    case 'paragraph':
      chain.setParagraph().run()
      break
    case 'h1':
      chain.toggleHeading({ level: 1 }).run()
      break
    case 'h2':
      chain.toggleHeading({ level: 2 }).run()
      break
    case 'h3':
      chain.toggleHeading({ level: 3 }).run()
      break
    case 'blockquote':
      chain.toggleBlockquote().run()
      break
  }
}

export function BlockTypeSelect({ editor }: { editor: Editor }) {
  const current = getBlockType(editor)
  const label = BLOCK_TYPES.find((item) => item.id === current)?.label ?? 'Odsek'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="toolbar-select" title="Typ bloku">
          <span>{label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        {BLOCK_TYPES.map(({ id, label: itemLabel }) => (
          <DropdownMenuItem
            key={id}
            className={cn(current === id && 'is-selected')}
            onClick={() => setBlockType(editor, id)}
          >
            {itemLabel}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ColorSwatchGrid({
  colors,
  onPick,
}: {
  colors: readonly { label: string; value: string }[]
  onPick: (value: string) => void
}) {
  return (
    <div className="toolbar-swatch-grid">
      {colors.map(({ label, value }) => (
        <button
          key={label}
          type="button"
          className="toolbar-swatch"
          title={label}
          aria-label={label}
          onClick={() => onPick(value)}
        >
          <span
            className="toolbar-swatch-dot"
            style={{ background: value || 'var(--color-foreground)' }}
          />
        </button>
      ))}
    </div>
  )
}
