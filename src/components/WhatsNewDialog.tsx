import { useEffect } from 'react'
import { APP_VERSION } from '@/lib/app-version'
import { openScribeUiSurface, subscribeScribeUiEvents } from '@/lib/scribe-ui-host'
import { isTauriRuntime } from '@/lib/tauri'
import { persistWhatsNewVersion } from '@/store/persistence'

/** Edition 3.4 release notes — kept for unit tests / fallback IDs. */
export const WHATS_NEW_34_HIGHLIGHTS = [
  'specialistAgents',
  'agentHandoffs',
  'digestsRecipes',
  'spawnAndCalendar',
  'filesIngest',
] as const

export type WhatsNew34HighlightId = (typeof WHATS_NEW_34_HIGHLIGHTS)[number]

/** @deprecated Prefer WHATS_NEW_34_HIGHLIGHTS */
export const WHATS_NEW_27_HIGHLIGHTS = WHATS_NEW_34_HIGHLIGHTS
/** @deprecated Prefer WHATS_NEW_34_HIGHLIGHTS */
export const WHATS_NEW_25_HIGHLIGHTS = WHATS_NEW_34_HIGHLIGHTS

type WhatsNewDialogProps = {
  open: boolean
  onClose: () => void
}

/** Opens the Dioxus `scribe-ui` Whats New surface (Tauri). Falls back to immediate close outside Tauri. */
export function WhatsNewDialog({ open, onClose }: WhatsNewDialogProps) {
  useEffect(() => {
    if (!open) return

    if (!isTauriRuntime()) {
      persistWhatsNewVersion(APP_VERSION)
      onClose()
      return
    }

    void openScribeUiSurface('whats-new')

    return subscribeScribeUiEvents((payload) => {
      if (payload.event === 'whats-new-acked' || payload.event === 'surface-closed') {
        if (payload.event === 'whats-new-acked') {
          persistWhatsNewVersion(APP_VERSION)
        }
        onClose()
      }
    })
  }, [open, onClose])

  return null
}

/** @deprecated Highlights render inside Dioxus surface. */
export function WhatsNew34Highlights() {
  return null
}

/** @deprecated Prefer WhatsNew34Highlights */
export const WhatsNew27Highlights = WhatsNew34Highlights
/** @deprecated Prefer WhatsNew34Highlights */
export const WhatsNew25Highlights = WhatsNew34Highlights
