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
    expect(recipe?.tools).toEqual(['code_brief', 'explain', 'outline', 'keywords'])
    expect(recipe?.documentPreferred).toBe(true)
    expect(recipe?.labelKey).toBe('agent.recipes.codePass')
  })

  it('lists code_pass among built-ins', () => {
    expect(AGENT_RECIPES.some((r) => r.id === 'code_pass')).toBe(true)
  })

  it('includes code_audit for secrets + glossary pass', () => {
    const recipe = getAgentRecipe('code_audit')
    expect(recipe?.tools).toEqual(['code_brief', 'pii', 'glossary'])
    expect(recipeOwnerRole('code_audit')).toBe('developer')
    expect(getAgentRole('developer').recipeIds).toContain('code_audit')
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

  it('includes morning_brief, polish_and_apply, and research recipes', () => {
    expect(getAgentRecipe('morning_brief')?.tools).toEqual([
      'dates',
      'open_loops',
      'forward_plan',
    ])
    expect(getAgentRecipe('polish_and_apply')?.tools).toEqual([
      'grammar',
      'spellcheck',
      'rewrite',
    ])
    expect(getAgentRecipe('research_pass')?.tools).toEqual(['research_pack', 'timeline'])
    expect(getAgentRecipe('deep_research')?.tools).toEqual([
      'research_pack',
      'citations',
      'similar',
      'timeline',
    ])
    expect(recipeOwnerRole('deep_research')).toBe('researcher')
    expect(isRecipeAllowedByAgents('research_pass', DEFAULT_AGENT_ROLES)).toBe(true)
  })
})
