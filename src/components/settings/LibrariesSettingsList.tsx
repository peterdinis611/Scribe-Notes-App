import { FolderOpen } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPrimitives'
import { revealInFinder } from '@/lib/db/api'
import { listLibraries } from '@/lib/db/libraries-api'
import { activateLibrary } from '@/lib/libraries/switch'
import { toast } from '@/lib/toast'
import { formatRelativeTime } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setLibraries } from '@/store/librariesSlice'

function shortHomePath(path: string) {
  return path.replace(/^\/Users\/[^/]+/, '~')
}

export function LibrariesSettingsList() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const libraries = useAppSelector((state) => state.libraries.libraries)

  useEffect(() => {
    void listLibraries()
      .then((next) => dispatch(setLibraries(next)))
      .catch(() => undefined)
  }, [dispatch])

  async function handleSwitch(id: string) {
    try {
      await activateLibrary(dispatch, (route) => navigate(route), id)
    } catch (error) {
      toast.error(t('libraries.switchError'), String(error))
    }
  }

  return (
    <>
      <SettingsSectionHeader
        title={t('settings.storage.librariesTitle')}
        description={t('settings.storage.librariesDescription')}
      />
      <SettingsGroup className="mb-5">
        {libraries.length === 0 ? (
          <SettingsRow title={t('settings.storage.librariesEmpty')} />
        ) : (
          libraries.map((library) => {
            const pathLabel = library.rootPath.trim()
              ? shortHomePath(library.rootPath)
              : t('settings.storage.librariesNoPath')
            return (
              <SettingsRow
                key={library.id}
                title={library.name}
                description={
                  <>
                    <p className="m-0 font-mono text-[11px] text-[var(--color-foreground)]" title={library.rootPath}>
                      {pathLabel}
                    </p>
                    {library.lastOpenedAt > 0 ? (
                      <p className="m-0 mt-1">
                        {t('settings.storage.librariesOpened', {
                          time: formatRelativeTime(library.lastOpenedAt),
                        })}
                      </p>
                    ) : null}
                  </>
                }
              >
                {library.isActive ? (
                  <span className="settings-library-active">{t('settings.storage.librariesActive')}</span>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => void handleSwitch(library.id)}>
                    {t('settings.storage.librariesSwitch')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!library.rootPath.trim()}
                  onClick={() => void revealInFinder(library.rootPath)}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  {t('settings.storage.openInFinder')}
                </Button>
              </SettingsRow>
            )
          })
        )}
      </SettingsGroup>
    </>
  )
}
