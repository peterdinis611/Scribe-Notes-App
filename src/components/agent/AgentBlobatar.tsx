import { Blobatar } from '@blobatar/react'
import { thinking } from 'blobatar/expression'
import 'blobatar/motion.css'
import { cn } from '@/lib/utils'

/** Stable seed so the Local Agent always has the same face across the app. */
export const AGENT_BLOBATAR_NAME = 'scribe-local-agent'

type AgentBlobatarProps = {
  name?: string
  size?: number
  className?: string
  /** Animate + thinking pose while the agent is running tools. */
  talking?: boolean
  title?: string
}

/** Deterministic [blobatar](https://blobatar.dev/) face for agent ↔ human chat. */
export function AgentBlobatar({
  name = AGENT_BLOBATAR_NAME,
  size = 28,
  className,
  talking = false,
  title,
}: AgentBlobatarProps) {
  const seed = name.trim() || AGENT_BLOBATAR_NAME
  return (
    <span
      className={cn('agent-blobatar inline-flex shrink-0 overflow-hidden rounded-full', className)}
      style={{ width: size, height: size }}
    >
      <Blobatar
        name={seed}
        size={size}
        title={title ?? seed}
        animate={talking ? 'always' : 'hover'}
        expression={talking ? thinking : undefined}
      />
    </span>
  )
}
