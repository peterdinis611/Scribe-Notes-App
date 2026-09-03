import { listDocuments, listFolders, getStorageSettings } from "@/lib/db/api"
import { mergeLibrarySummaries } from "@/lib/db/library-sync"
import { applyThemeSettings } from "@/lib/themes/apply"
import { updateDocuments } from "@/store/documentsSlice"
import { setFolders } from "@/store/foldersSlice"
import { useAppSelector, useAppDispatch } from "@/store/hooks"
import { persistStorageFolderAccessGranted } from "@/store/persistence"
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
      getStorageSettings()
        .then((settings) => {
          dispatch(setStorageSettings(settings))
          if (settings.folderAccessGranted) {
            persistStorageFolderAccessGranted(true)
          }
        })
        .catch(() => undefined)
    }, [dispatch])
  }