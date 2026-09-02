import { Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPrimitives'
import { toast } from '@/lib/toast'

const CURSOR_CONFIG_PLACEHOLDER = `{
  "mcpServers": {
    "scribe-memory": {
      "command": "__SCRIBE/target/release/scribe-mcp",
      "args": []
    }
  }
}`

const PROMPT_TEMPLATE =
  'Pred odpoveďou použij Scribe MCP: search alebo search_documents, potom get_document. Pre úlohy extract_document_tasks alebo journal_tasks. Pre prehľad knižnice library_report. Pre denník journal_summary. Preferuj fakty z knižnice pred dohadmi.'

async function copyText(text: string, successKey: string, errorKey: string, t: (key: string) => string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(t(successKey))
  } catch (error) {
    toast.error(t(errorKey), String(error))
  }
}

export function McpSection() {
  const { t } = useTranslation()

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title={t('settings.mcp.title')}
        description={t('settings.mcp.description')}
      />

      <p className="mb-2 max-w-2xl text-[13px] leading-relaxed text-[var(--color-foreground)]">
        {t('settings.mcp.whatIsMcp')}
      </p>
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
        {t('settings.mcp.intro')}
      </p>

      <SettingsGroup className="mb-4">
        <SettingsRow
          title={t('settings.mcp.installTitle')}
          description={t('settings.mcp.installDescription')}
        >
          <code className="rounded-[6px] border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 font-mono text-[11px] text-[var(--color-foreground)]">
            npm run mcp:install
          </code>
        </SettingsRow>
        <SettingsRow
          title={t('settings.mcp.configTitle')}
          description={t('settings.mcp.configDescription')}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              void copyText(
                CURSOR_CONFIG_PLACEHOLDER,
                'settings.mcp.configCopied',
                'settings.mcp.copyError',
                t,
              )
            }
          >
            <Copy className="h-3.5 w-3.5" />
            {t('settings.mcp.copyConfig')}
          </Button>
        </SettingsRow>
        <SettingsRow
          title={t('settings.mcp.promptTitle')}
          description={t('settings.mcp.promptDescription')}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              void copyText(
                PROMPT_TEMPLATE,
                'settings.mcp.promptCopied',
                'settings.mcp.copyError',
                t,
              )
            }
          >
            <Copy className="h-3.5 w-3.5" />
            {t('settings.mcp.copyPrompt')}
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <pre className="mb-3 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-mono text-[11px] leading-relaxed text-[var(--color-foreground)]">
        {CURSOR_CONFIG_PLACEHOLDER}
      </pre>
      <p className="m-0 max-w-2xl text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
        {t('settings.mcp.pathHint')}
      </p>
      <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
        {t('settings.mcp.lockHint')}
      </p>
    </SettingsSection>
  )
}
