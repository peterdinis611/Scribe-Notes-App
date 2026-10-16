import { describe, expect, it } from 'vitest'
import {
  FILES_AGENT_STARTER_CHIPS,
  FILES_TEACH_PRESETS,
  pinFromFilesPreset,
  teachingFromFilesPreset,
} from '@/lib/library/agent-files-train'
import { getAgentRecipe } from '@/lib/library/agent-recipes'
import { isRecipeAllowedByAgents, DEFAULT_AGENT_ROLES } from '@/lib/library/agent-roles'

describe('agent files train', () => {
  it('exposes teach presets and starter chips', () => {
    expect(FILES_TEACH_PRESETS.length).toBeGreaterThanOrEqual(4)
    expect(FILES_AGENT_STARTER_CHIPS).toContain('agent.starters.learnFiles')
  })

  it('builds librarian teaching and optional pin', () => {
    const teaching = teachingFromFilesPreset('When answering from files/, cite paths.')
    expect(teaching?.agentId).toBe('librarian')
    expect(teaching?.text).toContain('cite')
    const pin = pinFromFilesPreset('Project drop zone: files/inbox')
    expect(pin?.text).toContain('files/inbox')
  })

  it('registers files_learn and files_to_library recipes for librarian', () => {
    const learn = getAgentRecipe('files_learn')
    const toLib = getAgentRecipe('files_to_library')
    expect(learn?.tools).toEqual(['files_answer', 'files_ingest'])
    expect(toLib?.tools).toEqual(['files_ingest', 'brief', 'organize'])
    expect(isRecipeAllowedByAgents('files_learn', DEFAULT_AGENT_ROLES)).toBe(true)
    expect(isRecipeAllowedByAgents('files_to_library', DEFAULT_AGENT_ROLES)).toBe(true)
  })
})
