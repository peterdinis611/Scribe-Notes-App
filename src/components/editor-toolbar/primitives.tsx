import type { Editor } from '@tiptap/react'
import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { HEADING_LEVELS, headingLabel } from '@/lib/editor/heading-levels'

export type BlockType = 'paragraph' | 'blockquote' | `h${(typeof HEADING_LEVELS)[number]}`

const BLOCK_TYPES: { id: BlockType; label: string }[] = [
  { id: 'paragraph', label: 'Odsek' },
  ...HEADING_LEVELS.map((level) => ({ id: `h${level}` as BlockType, label: headingLabel(level) })),
  { id: 'blockquote', label: 'Citácia' },
]

function getBlockType(editor: Editor): BlockType {
  for (const level of HEADING_LEVELS) {
    if (editor.isActive('heading', { level })) return `h${level}`
  }
  if (editor.isActive('blockquote')) return 'blockquote'
  return 'paragraph'
}

function setBlockType(editor: Editor, type: BlockType) {
  const chain = editor.chain().focus()

  if (type === 'paragraph') {
    chain.setParagraph().run()
    return
  }

  if (type === 'blockquote') {
    chain.toggleBlockquote().run()
    return
  }

  const level = Number(type.slice(1)) as (typeof HEADING_LEVELS)[number]
  chain.toggleHeading({ level }).run()
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
      <DropdownMenuContent align="start" className="min-w-[160px] max-h-[320px] overflow-y-auto">
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

export function ColorSwatchGrid({
  colors,
  onPick,
  activeValue,
}: {
  colors: readonly { label: string; value: string }[]
  onPick: (value: string) => void
  activeValue?: string
}) {
  return (
    <div className="toolbar-swatch-grid">
      {colors.map(({ label, value }) => (
        <button
          key={label}
          type="button"
          className={cn('toolbar-swatch', activeValue === value && 'is-active')}
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

export function CustomColorPicker({
  label,
  onPick,
}: {
  label: string
  onPick: (value: string) => void
}) {
  return (
    <label className="toolbar-color-picker" title={label}>
      <span className="toolbar-color-picker-label">{label}</span>
      <input
        type="color"
        className="toolbar-color-picker-input"
        defaultValue="#007aff"
        onChange={(event) => onPick(event.target.value)}
      />
    </label>
  )
}
