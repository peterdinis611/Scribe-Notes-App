import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { createLibrary, listLibraries } from '@/lib/db/libraries-api'
import { activateLibrary } from '@/lib/libraries/switch'
import { promptInput } from '@/lib/input-dialog'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setLibraries } from '@/store/librariesSlice'
import { setCompileDialogOpen } from '@/store/uiSlice'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const PRESETS = ['Práca', 'Osobné', 'Archív'] as const

const presetClassName =
  'inline-flex max-w-full min-h-[26px] min-w-0 items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-[color-mix(in_srgb,var(--color-border)_85%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_55%,transparent)] px-[0.7rem] py-[0.2rem] text-[10.5px] font-[550] tracking-[0.01em] text-[var(--color-muted-foreground)] transition-[background,border-color,color] duration-120 hover:border-[color-mix(in_srgb,var(--color-accent)_28%,var(--color-border))] hover:text-[var(--color-foreground)] @max-[232px]/library-head:flex-[1_1_calc(50%-5px)]'

const presetPrimaryClassName =
  'border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] font-[650] text-[var(--color-foreground)] hover:border-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_20%,transparent)]'

export function LibrarySwitcher() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const libraries = useAppSelector((state) => state.libraries.libraries)
  const active = libraries.find((item) => item.isActive) ?? libraries[0]

  const refresh = useCallback(async () => {
    dispatch(setLibraries(await listLibraries()))
  }, [dispatch])

  const handleSwitch = useCallback(
    async (id: string) => {
      if (!id || id === active?.id) return
      try {
        await activateLibrary(dispatch, (route) => navigate(route), id)
      } catch (error) {
        toast.error(t('libraries.switchError'), String(error))
      }
    },
    [active?.id, dispatch, navigate, t],
  )

  const handleCreate = useCallback(
    async (preset?: string) => {
      const name =
        preset ??
        (await promptInput({
          title: t('libraries.newTitle'),
          description: t('libraries.newHint'),
          confirmLabel: t('common.create'),
        }))
      if (!name?.trim()) return
      try {
        const created = await createLibrary(name.trim())
        await refresh()
        await activateLibrary(dispatch, (route) => navigate(route), created.id)
      } catch (error) {
        toast.error(t('libraries.createError'), String(error))
      }
    },
    [dispatch, navigate, refresh, t],
  )

  const missingPresets = PRESETS.filter((name) => !libraries.some((item) => item.name === name))

  return (
    <div className="mt-2.5 flex min-w-0 flex-col gap-2 titlebar-no-drag" data-tour="library-switcher">
      <Select value={active?.id} onValueChange={(id) => void handleSwitch(id)} disabled={!active}>
        <SelectTrigger
          size="sm"
          id="library-switcher-select"
          className="h-8 w-full min-w-0 border-[color-mix(in_srgb,var(--color-border)_88%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_72%,transparent)] font-[family-name:var(--font-display)] text-[13px] font-[650] tracking-[-0.02em] hover:border-[color-mix(in_srgb,var(--color-accent)_28%,var(--color-border))] hover:bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)]"
          aria-label={t('libraries.label')}
        >
          <SelectValue placeholder={t('libraries.placeholder')}>{active?.name}</SelectValue>
        </SelectTrigger>
        <SelectContent
          align="start"
          className="min-w-[min(100%,var(--radix-select-trigger-width))]!"
        >
          {libraries.map((item) => (
            <SelectItem key={item.id} value={item.id} textValue={item.name}>
              <span className="truncate">{item.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex min-w-0 flex-wrap gap-[5px]">
        {missingPresets.map((name) => (
          <button
            key={name}
            type="button"
            className={presetClassName}
            onClick={() => void handleCreate(name)}
          >
            {name}
          </button>
        ))}
        <button
          type="button"
          className={cn(presetClassName, presetPrimaryClassName)}
          onClick={() => void handleCreate()}
        >
          {t('libraries.new')}
        </button>
        <button
          type="button"
          className={presetClassName}
          data-tour="library-compile"
          onClick={() => dispatch(setCompileDialogOpen(true))}
        >
          {t('compile.action')}
        </button>
      </div>
    </div>
  )
}
