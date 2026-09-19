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
    <div className="library-switcher titlebar-no-drag" data-tour="library-switcher">
      <Select value={active?.id} onValueChange={(id) => void handleSwitch(id)} disabled={!active}>
        <SelectTrigger
          size="sm"
          id="library-switcher-select"
          className="library-switcher-trigger"
          aria-label={t('libraries.label')}
        >
          <SelectValue placeholder={t('libraries.placeholder')}>{active?.name}</SelectValue>
        </SelectTrigger>
        <SelectContent align="start" className="library-switcher-content">
          {libraries.map((item) => (
            <SelectItem key={item.id} value={item.id} textValue={item.name}>
              <span className="truncate">{item.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="library-switcher-actions">
        {missingPresets.map((name) => (
          <button
            key={name}
            type="button"
            className="library-switcher-preset"
            onClick={() => void handleCreate(name)}
          >
            {name}
          </button>
        ))}
        <button
          type="button"
          className={cn('library-switcher-preset', 'is-primary')}
          onClick={() => void handleCreate()}
        >
          {t('libraries.new')}
        </button>
        <button
          type="button"
          className="library-switcher-preset"
          data-tour="library-compile"
          onClick={() => dispatch(setCompileDialogOpen(true))}
        >
          {t('compile.action')}
        </button>
      </div>
    </div>
  )
}
