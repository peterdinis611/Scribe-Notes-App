export type ErrorDetails = {
  name: string
  message: string
  stack: string | null
  componentStack: string | null
}

export function extractErrorDetails(
  error: unknown,
  componentStack?: string | null,
): ErrorDetails {
  const stackExtra = componentStack?.trim() || null

  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message.trim() || 'Unknown error',
      stack: error.stack?.trim() || null,
      componentStack: stackExtra,
    }
  }

  if (typeof error === 'string' && error.trim()) {
    return {
      name: 'Error',
      message: error.trim(),
      stack: null,
      componentStack: stackExtra,
    }
  }

  try {
    return {
      name: 'Error',
      message: JSON.stringify(error),
      stack: null,
      componentStack: stackExtra,
    }
  } catch {
    return {
      name: 'Error',
      message: String(error),
      stack: null,
      componentStack: stackExtra,
    }
  }
}

export function buildDiagnosticReport(input: {
  appVersion: string
  details: ErrorDetails
  route: string
  locale: string
  when: string
}): string {
  const lines = [
    `Scribe ${input.appVersion} — error report`,
    `Time: ${input.when}`,
    `Route: ${input.route}`,
    `Locale: ${input.locale}`,
    `Name: ${input.details.name}`,
    `Message: ${input.details.message}`,
  ]
  if (input.details.stack) {
    lines.push('', '── Stack ──', input.details.stack)
  }
  if (input.details.componentStack) {
    lines.push('', '── Component stack ──', input.details.componentStack)
  }
  return lines.join('\n')
}
