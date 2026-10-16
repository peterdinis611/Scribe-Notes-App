import type { AgentPinnedFact, AgentTeaching } from '@/lib/library/agent-prefs'
import { createPinnedFact, createTeaching } from '@/lib/library/agent-prefs'

/** Standing-instruction presets for training the agent on files/ sandbox data. */
export type FilesTeachPresetId =
  | 'cite_paths'
  | 'prefer_sandbox'
  | 'ingest_then_answer'
  | 'slovak_files'
  | 'project_inbox'

export type FilesTeachPreset = {
  id: FilesTeachPresetId
  /** i18n key under settings.agent.filesTrain.presets.* */
  labelKey: string
  /** i18n key for the teaching text itself */
  textKey: string
  /** Optional pinned-fact companion (project/path hint). */
  pinTextKey?: string
}

export const FILES_TEACH_PRESETS: FilesTeachPreset[] = [
  {
    id: 'cite_paths',
    labelKey: 'settings.agent.filesTrain.presets.citePaths.label',
    textKey: 'settings.agent.filesTrain.presets.citePaths.text',
  },
  {
    id: 'prefer_sandbox',
    labelKey: 'settings.agent.filesTrain.presets.preferSandbox.label',
    textKey: 'settings.agent.filesTrain.presets.preferSandbox.text',
  },
  {
    id: 'ingest_then_answer',
    labelKey: 'settings.agent.filesTrain.presets.ingestThenAnswer.label',
    textKey: 'settings.agent.filesTrain.presets.ingestThenAnswer.text',
  },
  {
    id: 'slovak_files',
    labelKey: 'settings.agent.filesTrain.presets.slovakFiles.label',
    textKey: 'settings.agent.filesTrain.presets.slovakFiles.text',
  },
  {
    id: 'project_inbox',
    labelKey: 'settings.agent.filesTrain.presets.projectInbox.label',
    textKey: 'settings.agent.filesTrain.presets.projectInbox.text',
    pinTextKey: 'settings.agent.filesTrain.presets.projectInbox.pin',
  },
]

export function teachingFromFilesPreset(
  text: string,
  opts?: { agentId?: 'librarian' | 'general' },
): AgentTeaching | null {
  return createTeaching(text, {
    topic: 'general',
    agentId: opts?.agentId ?? 'librarian',
  })
}

export function pinFromFilesPreset(text: string): AgentPinnedFact | null {
  return createPinnedFact(text)
}

/** Library-scope starter chip i18n keys for files training. */
export const FILES_AGENT_STARTER_CHIPS = [
  'agent.starters.askFiles',
  'agent.starters.ingestFiles',
  'agent.starters.learnFiles',
] as const
