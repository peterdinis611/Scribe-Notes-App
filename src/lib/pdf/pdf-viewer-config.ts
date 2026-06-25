export function base64ToPdfUrl(dataBase64: string): string {
  const bytes = Uint8Array.from(atob(dataBase64), (char) => char.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/pdf' })
  return URL.createObjectURL(blob)
}

function resolveViewerTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function createPdfViewerConfig(src: string) {
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() ||
    '#007aff'

  return {
    src,
    tabBar: 'never' as const,
    theme: {
      preference: resolveViewerTheme(),
      light: {
        accent: { primary: accent, primaryHover: accent },
      },
      dark: {
        accent: { primary: accent, primaryHover: accent },
      },
    },
    disabledCategories: [
      'annotation',
      'redaction',
      'export',
      'document-print',
      'document-open',
    ],
    permissions: {
      overrides: {
        print: false,
        copy: true,
      },
    },
  }
}
