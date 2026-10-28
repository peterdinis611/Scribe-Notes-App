import { useCallback } from 'react'
import { Check, ChevronsUpDown, FileStack, Plus } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { createLibrary, listLibraries } from '@/lib/db/libraries-api'
import { activateLibrary } from '@/lib/libraries/switch'
import { promptInput } from '@/lib/input-dialog'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setLibraries } from '@/store/librariesSlice'
import { setCompileDialogOpen } from '@/store/uiSlice'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            id="library-switcher-select"
            className="library-switcher-trigger"
            aria-label={t('libraries.label')}
            disabled={!active}
          >
            <span className="library-switcher-name">{active?.name ?? t('libraries.placeholder')}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-55" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[12rem]">
          {libraries.map((item) => (
            <DropdownMenuItem key={item.id} onSelect={() => void handleSwitch(item.id)}>
              <span className="flex-1 truncate">{item.name}</span>
              {item.id === active?.id && <Check className="h-3.5 w-3.5 text-[var(--color-accent)]" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {missingPresets.map((name) => (
            <DropdownMenuItem key={name} onSelect={() => void handleCreate(name)}>
              <Plus className="h-3.5 w-3.5" />
              {name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => void handleCreate()}>
            <Plus className="h-3.5 w-3.5" />
            {t('libraries.new')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-tour="library-compile"
            onSelect={() => dispatch(setCompileDialogOpen(true))}
          >
            <FileStack className="h-3.5 w-3.5" />
            {t('compile.action')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
