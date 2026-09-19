import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { createLibrary, listLibraries } from '@/lib/db/libraries-api'
import { activateLibrary } from '@/lib/libraries/switch'
import { promptInput } from '@/lib/input-dialog'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setLibraries } from '@/store/librariesSlice'
import { setCompileDialogOpen } from '@/store/uiSlice'

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

  return (
    <div className="library-switcher">
      <label className="sr-only" htmlFor="library-switcher-select">
        {t('libraries.label')}
      </label>
      <select
        id="library-switcher-select"
        className="library-switcher-select"
        value={active?.id ?? ''}
        onChange={(event) => void handleSwitch(event.target.value)}
      >
        {libraries.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <div className="library-switcher-actions">
        {PRESETS.filter((name) => !libraries.some((item) => item.name === name)).map((name) => (
          <button
            key={name}
            type="button"
            className="library-switcher-preset"
            onClick={() => void handleCreate(name)}
          >
            {name}
          </button>
        ))}
        <button type="button" className="library-switcher-preset" onClick={() => void handleCreate()}>
          {t('libraries.new')}
        </button>
        <button
          type="button"
          className="library-switcher-preset"
          onClick={() => dispatch(setCompileDialogOpen(true))}
        >
          {t('compile.action')}
        </button>
      </div>
    </div>
  )
}
