import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { keepEditorSelectionFocus } from '@/lib/editor/view-ready'
import { cn } from '@/lib/utils'
import { HEADING_LEVELS, type HeadingLevel } from '@/lib/editor/heading-levels'
import { IconTooltip } from '@/components/ui/tooltip'

export type BlockType = 'paragraph' | 'blockquote' | `h${HeadingLevel}`

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

  const level = Number(type.slice(1)) as HeadingLevel
  chain.toggleHeading({ level }).run()
}

export function BlockTypeSelect({ editor }: { editor: Editor }) {
  const { t } = useTranslation()
  const current = getBlockType(editor)

  const blockTypes: { id: BlockType; label: string }[] = [
    { id: 'paragraph', label: t('toolbar.blockTypes.paragraph') },
    ...HEADING_LEVELS.map((level) => ({
      id: `h${level}` as BlockType,
      label: t('toolbar.blockTypes.heading', { level }),
    })),
    { id: 'blockquote', label: t('toolbar.blockTypes.blockquote') },
  ]

  const label =
    blockTypes.find((item) => item.id === current)?.label ?? t('toolbar.blockTypes.paragraph')

  return (
    <DropdownMenu>
      <IconTooltip label={t('toolbar.blockTypes.title')}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="toolbar-select" aria-label={t('toolbar.blockTypes.title')}>
            <span>{label}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>
        </DropdownMenuTrigger>
      </IconTooltip>
      <DropdownMenuContent
        align="start"
        className="min-w-[160px] max-h-[320px] overflow-y-auto"
        onCloseAutoFocus={keepEditorSelectionFocus(editor)}
      >
        {blockTypes.map(({ id, label: itemLabel }) => (
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
  children: ReactNode
  label: string
  className?: string
}) {
  return (
    <IconTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={cn('toolbar-btn', active && 'is-active', className)}
      >
        {children}
      </button>
    </IconTooltip>
  )
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
        <IconTooltip key={label} label={label}>
          <button
            type="button"
            className={cn('toolbar-swatch', activeValue === value && 'is-active')}
            aria-label={label}
            onClick={() => onPick(value)}
          >
            <span
              className="toolbar-swatch-dot"
              style={{ background: value || 'var(--color-foreground)' }}
            />
          </button>
        </IconTooltip>
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
    <IconTooltip label={label}>
      <label className="toolbar-color-picker">
        <span className="toolbar-color-picker-label">{label}</span>
        <input
          type="color"
          className="toolbar-color-picker-input"
          aria-label={label}
          defaultValue="#007aff"
          onChange={(event) => onPick(event.target.value)}
        />
      </label>
    </IconTooltip>
  )
}
