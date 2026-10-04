import { citationPackPlugin } from '@/lib/plugins/bundled/citation-pack'
import { dailyJournalPlugin } from '@/lib/plugins/bundled/daily-journal'
import { flashcardBlockPlugin } from '@/lib/plugins/bundled/flashcard-block'
import { meetingWrapPlugin } from '@/lib/plugins/bundled/meeting-wrap'
import { plaintextExportPlugin } from '@/lib/plugins/bundled/plaintext-export'
import { statusMetaPlugin } from '@/lib/plugins/bundled/status-meta'
import { standupPlugin } from '@/lib/plugins/bundled/standup'
import { themePackPlugin } from '@/lib/plugins/bundled/theme-pack'
import type { PluginModule } from '@/lib/plugins/types'

/** Official first-party plugins shipped with the app. */
export const BUNDLED_PLUGINS: PluginModule[] = [
  dailyJournalPlugin,
  flashcardBlockPlugin,
  plaintextExportPlugin,
  citationPackPlugin,
  meetingWrapPlugin,
  statusMetaPlugin,
  themePackPlugin,
  standupPlugin,
]
