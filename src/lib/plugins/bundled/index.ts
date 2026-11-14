import { citationPackPlugin } from '@/lib/plugins/bundled/citation-pack'
import { cornellNotesPlugin } from '@/lib/plugins/bundled/cornell-notes'
import { dailyJournalPlugin } from '@/lib/plugins/bundled/daily-journal'
import { decisionLogPlugin } from '@/lib/plugins/bundled/decision-log'
import { flashcardBlockPlugin } from '@/lib/plugins/bundled/flashcard-block'
import { meetingWrapPlugin } from '@/lib/plugins/bundled/meeting-wrap'
import { outlineChecklistPlugin } from '@/lib/plugins/bundled/outline-checklist'
import { plaintextExportPlugin } from '@/lib/plugins/bundled/plaintext-export'
import { readingTimePlugin } from '@/lib/plugins/bundled/reading-time'
import { statusMetaPlugin } from '@/lib/plugins/bundled/status-meta'
import { standupPlugin } from '@/lib/plugins/bundled/standup'
import { themePackPlugin } from '@/lib/plugins/bundled/theme-pack'
import { weeklyReviewPlugin } from '@/lib/plugins/bundled/weekly-review'
import { zettelStubPlugin } from '@/lib/plugins/bundled/zettel-stub'
import type { PluginModule } from '@/lib/plugins/types'

/** Official first-party plugins shipped with the app. */
export const BUNDLED_PLUGINS: PluginModule[] = [
  dailyJournalPlugin,
  weeklyReviewPlugin,
  decisionLogPlugin,
  flashcardBlockPlugin,
  cornellNotesPlugin,
  zettelStubPlugin,
  citationPackPlugin,
  meetingWrapPlugin,
  plaintextExportPlugin,
  readingTimePlugin,
  statusMetaPlugin,
  outlineChecklistPlugin,
  themePackPlugin,
  standupPlugin,
]
