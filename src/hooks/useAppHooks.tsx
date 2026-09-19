import { listDocuments, listFolders, getStorageSettings } from "@/lib/db/api"
import { listLibraries, listSyncConflicts } from "@/lib/db/libraries-api"
import { loadLibrarySession } from "@/lib/libraries/session"
import { mergeLibrarySummaries } from "@/lib/db/library-sync"
import { applyThemeSettings } from "@/lib/themes/apply"
import { updateDocuments } from "@/store/documentsSlice"
import { setFolders } from "@/store/foldersSlice"
import { useAppSelector, useAppDispatch } from "@/store/hooks"
import { persistStorageFolderAccessGranted } from "@/store/persistence"
import { setLibraries, setOpenConflictCount } from "@/store/librariesSlice"
import { setStorageSettings } from "@/store/settingsSlice"
import { useEffect } from "react"

export function useThemeSync() {
    const themeSettings = useAppSelector((state) => state.settings.themeSettings)
    const uiSkin = useAppSelector((state) => state.settings.uiSkin)
  
    useEffect(() => {
      applyThemeSettings(themeSettings, uiSkin)
  
      if (themeSettings.themeId !== 'system') return
  
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      const onChange = () => applyThemeSettings(themeSettings, uiSkin)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    }, [themeSettings, uiSkin])
  }
  
export function useDocumentBootstrap() {
    const dispatch = useAppDispatch()
  
    useEffect(() => {
      async function bootstrap() {
        const [docs, folders] = await Promise.all([listDocuments(), listFolders()])
        dispatch(updateDocuments((prev) => mergeLibrarySummaries(prev, docs)))
        dispatch(setFolders(folders))
      }
  
      bootstrap()
    }, [dispatch])
  }
  
export function useStorageBootstrap() {
    const dispatch = useAppDispatch()
  
    useEffect(() => {
      Promise.all([getStorageSettings(), listLibraries(), listSyncConflicts().catch(() => [])])
        .then(([settings, libraries, conflicts]) => {
          dispatch(setStorageSettings(settings))
          dispatch(setLibraries(libraries))
          dispatch(setOpenConflictCount(conflicts.length))
          const active = libraries.find((item) => item.isActive)
          if (active) loadLibrarySession(dispatch, active.id)
          if (settings.folderAccessGranted) {
            persistStorageFolderAccessGranted(true)
          }
        })
        .catch(() => undefined)
    }, [dispatch])
  }