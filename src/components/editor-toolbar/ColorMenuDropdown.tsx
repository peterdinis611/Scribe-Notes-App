import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ColorSwatchGrid, CustomColorPicker } from '@/components/editor-toolbar/primitives'
import { cn } from '@/lib/utils'

type ColorMenuDropdownProps = {
  label: string
  icon: React.ReactNode
  colors: readonly { label: string; value: string }[]
  activeValue?: string
  onPick: (value: string) => void
  onCustomPick: (value: string) => void
  onClear?: () => void
}

export function ColorMenuDropdown({
  label,
  icon,
  colors,
  activeValue,
  onPick,
  onCustomPick,
  onClear,
}: ColorMenuDropdownProps) {
  const { t } = useTranslation()
  const previewColor = activeValue || 'var(--color-foreground)'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="toolbar-menu-trigger" title={label} aria-label={label}>
          <span className="toolbar-color-trigger-icon">{icon}</span>
          <span className="toolbar-color-trigger-bar" style={{ background: previewColor }} />
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="toolbar-color-menu">
        <p className="toolbar-color-menu-title">{label}</p>
        <ColorSwatchGrid colors={colors} activeValue={activeValue} onPick={onPick} />
        <div className="toolbar-color-menu-footer">
          <CustomColorPicker label={t('toolbar.actions.customColor')} onPick={onCustomPick} />
          {onClear ? (
            <button type="button" className={cn('toolbar-color-clear')} onClick={onClear}>
              {t('common.reset')}
            </button>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
