import { describe, expect, it } from 'vitest'
import {
  AGENT_RECIPES,
  getAgentRecipe,
  resolveAgentRecipe,
} from '@/lib/library/agent-recipes'
import {
  DEFAULT_AGENT_ROLES,
  getAgentRole,
  isRecipeAllowedByAgents,
  recipeOwnerRole,
} from '@/lib/library/agent-roles'

describe('agent recipes catalog', () => {
  it('includes code_pass with expected tools', () => {
    const recipe = getAgentRecipe('code_pass')
    expect(recipe).toBeDefined()
    expect(recipe?.tools).toEqual(['code_brief', 'explain', 'keywords'])
    expect(recipe?.documentPreferred).toBe(true)
    expect(recipe?.labelKey).toBe('agent.recipes.codePass')
  })

  it('lists code_pass among built-ins', () => {
    expect(AGENT_RECIPES.some((r) => r.id === 'code_pass')).toBe(true)
  })

  it('owns code_pass under developer and allows it by default', () => {
    expect(recipeOwnerRole('code_pass')).toBe('developer')
    expect(getAgentRole('developer').recipeIds).toContain('code_pass')
    expect(isRecipeAllowedByAgents('code_pass', DEFAULT_AGENT_ROLES)).toBe(true)
  })

  it('hides code_pass when developer role is disabled', () => {
    expect(
      isRecipeAllowedByAgents('code_pass', {
        ...DEFAULT_AGENT_ROLES,
        developer: { enabled: false },
      }),
    ).toBe(false)
  })

  it('resolves custom recipes and built-ins', () => {
    expect(resolveAgentRecipe('code_pass')?.labelKey).toBe('agent.recipes.codePass')
    expect(
      resolveAgentRecipe('custom-1', [
        {
          id: 'custom-1',
          label: 'Mine',
          tools: ['summarize'],
          documentPreferred: false,
        },
      ]),
    ).toMatchObject({ id: 'custom-1', label: 'Mine', custom: true })
    expect(resolveAgentRecipe('missing')).toBeUndefined()
  })
})
