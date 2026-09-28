import { happy, sad, thinking } from 'blobatar/expression'
import { Blobatar } from '@blobatar/react'
import 'blobatar/motion.css'
import { cn } from '@/lib/utils'

/** Stable seed so the Local Agent always has the same face across the app. */
export const AGENT_BLOBATAR_NAME = 'scribe-local-agent'

export type AgentBlobatarMood = 'idle' | 'thinking' | 'done' | 'error'

type AgentBlobatarProps = {
  name?: string
  size?: number
  className?: string
  /** @deprecated Prefer `mood="thinking"`. */
  talking?: boolean
  mood?: AgentBlobatarMood
  title?: string
}

function expressionFor(mood: AgentBlobatarMood) {
  if (mood === 'thinking') return thinking
  if (mood === 'done') return happy
  if (mood === 'error') return sad
  return undefined
}

/** Deterministic [blobatar](https://blobatar.dev/) face for agent ↔ human chat. */
export function AgentBlobatar({
  name = AGENT_BLOBATAR_NAME,
  size = 28,
  className,
  talking = false,
  mood,
  title,
}: AgentBlobatarProps) {
  const seed = name.trim() || AGENT_BLOBATAR_NAME
  const resolved: AgentBlobatarMood = mood ?? (talking ? 'thinking' : 'idle')
  const expression = expressionFor(resolved)
  return (
    <span
      className={cn(
        'agent-blobatar inline-flex shrink-0 overflow-hidden rounded-full',
        resolved === 'thinking' && 'agent-blobatar--thinking',
        resolved === 'done' && 'agent-blobatar--done',
        resolved === 'error' && 'agent-blobatar--error',
        className,
      )}
      style={{ width: size, height: size }}
      data-mood={resolved}
    >
      <Blobatar
        name={seed}
        size={size}
        title={title ?? seed}
        animate={resolved === 'thinking' ? 'always' : 'hover'}
        expression={expression}
      />
    </span>
  )
}
