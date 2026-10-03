import { dailyJournalPlugin } from '@/lib/plugins/bundled/daily-journal'
import { flashcardBlockPlugin } from '@/lib/plugins/bundled/flashcard-block'
import { plaintextExportPlugin } from '@/lib/plugins/bundled/plaintext-export'
import type { PluginModule } from '@/lib/plugins/types'

/** Official first-party plugins shipped with the app. */
export const BUNDLED_PLUGINS: PluginModule[] = [
  dailyJournalPlugin,
  flashcardBlockPlugin,
  plaintextExportPlugin,
]
