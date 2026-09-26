import { Cable, Copy, BookOpen, Sparkles, Terminal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPrimitives'
import { navigateToMcpDemo } from '@/lib/demo/load-mcp-demo'
import { isMcpEnabled, setMcpEnabled } from '@/lib/mcp/prefs'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'

const CURSOR_CONFIG = `{
  "mcpServers": {
    "scribe-memory": {
      "command": "__SCRIBE/target/release/scribe-mcp",
      "args": []
    }
  }
}`

const CLAUDE_CONFIG = `{
  "mcpServers": {
    "scribe-memory": {
      "command": "__SCRIBE/target/release/scribe-mcp",
      "args": []
    }
  }
}`

const SAMPLE_TOOLS = [
  { id: 'scribe_status', hintKey: 'settings.mcp.tools.status' },
  { id: 'search_documents', hintKey: 'settings.mcp.tools.search' },
  { id: 'library_answer', hintKey: 'settings.mcp.tools.libraryAnswer' },
  { id: 'get_document', hintKey: 'settings.mcp.tools.getDocument' },
  { id: 'list_open_tasks', hintKey: 'settings.mcp.tools.tasks' },
  { id: 'document_analysis', hintKey: 'settings.mcp.tools.analysis' },
  { id: 'extract_flashcards', hintKey: 'settings.mcp.tools.flashcards' },
  { id: 'extract_takeaways', hintKey: 'settings.mcp.tools.takeaways' },
  { id: 'writing_coach', hintKey: 'settings.mcp.tools.writingCoach' },
  { id: 'analyze_revision_diff_for_document', hintKey: 'settings.mcp.tools.revisionAi' },
  { id: 'suggest_continuation', hintKey: 'settings.mcp.tools.continuation' },
  { id: 'wiki_health_report', hintKey: 'settings.mcp.tools.wikiHealth' },
] as const

async function copyText(
  text: string,
  successKey: string,
  errorKey: string,
  t: (key: string) => string,
) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(t(successKey))
  } catch (error) {
    toast.error(t(errorKey), String(error))
  }
}

export function McpSection() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const documents = useAppSelector((state) => state.documents.documents)
  const [enabled, setEnabled] = useState(() => isMcpEnabled())
  const [openingDemo, setOpeningDemo] = useState(false)

  const howToSteps = useMemo(() => {
    const steps = t('settings.mcp.howToSteps', { returnObjects: true })
    return Array.isArray(steps) ? (steps as string[]) : []
  }, [t, i18n.language])

  const samplePrompts = useMemo(() => {
    const prompts = t('settings.mcp.samplePrompts', { returnObjects: true })
    return Array.isArray(prompts) ? (prompts as string[]) : []
  }, [t, i18n.language])

  const promptTemplate = t('settings.mcp.promptTemplate')

  function toggleEnabled() {
    const next = !enabled
    setMcpEnabled(next)
    setEnabled(next)
    toast.success(next ? t('settings.mcp.enabledToast') : t('settings.mcp.disabledToast'))
  }

  async function openDemo() {
    if (!enabled) {
      setMcpEnabled(true)
      setEnabled(true)
    }
    setOpeningDemo(true)
    try {
      const demoTools = SAMPLE_TOOLS.map((tool) => ({
        name: tool.id,
        hint: t(tool.hintKey),
      }))
      const result = await navigateToMcpDemo(documents, dispatch, (route) => navigate(route), {
        title: t('settings.mcp.demoDocTitle'),
        intro: t('settings.mcp.demoDocIntro'),
        whatTitle: t('settings.mcp.demoDocWhatTitle'),
        whatBody: t('settings.mcp.demoDocWhatBody'),
        setupTitle: t('settings.mcp.howToTitle'),
        setupSteps: howToSteps,
        toolsTitle: t('settings.mcp.sampleToolsTitle'),
        tools: demoTools,
        tryTitle: t('settings.mcp.samplePromptsTitle'),
        tryPrompts: samplePrompts,
        tipTitle: t('settings.mcp.demoDocTipTitle'),
        tipBody: t('settings.mcp.demoDocTipBody'),
      })
      toast.success(
        result.created ? t('settings.mcp.demoCreated') : t('settings.mcp.demoOpened'),
      )
    } catch (error) {
      toast.error(t('settings.mcp.demoError'), String(error))
    } finally {
      setOpeningDemo(false)
    }
  }

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
          title={t('settings.mcp.enableTitle')}
          description={t('settings.mcp.enableDescription')}
        >
          <Button
            type="button"
            variant={enabled ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={toggleEnabled}
          >
            <Cable className="h-3.5 w-3.5" />
            {enabled ? t('settings.mcp.enabled') : t('settings.mcp.enable')}
          </Button>
        </SettingsRow>
        <SettingsRow
          title={t('settings.mcp.demoTitle')}
          description={t('settings.mcp.demoDescription')}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={openingDemo}
            onClick={() => void openDemo()}
          >
            <BookOpen className="h-3.5 w-3.5" />
            {openingDemo ? t('settings.mcp.demoOpening') : t('settings.mcp.openDemo')}
          </Button>
        </SettingsRow>
      </SettingsGroup>

      {!enabled ? (
        <p className="mb-4 max-w-2xl rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
          {t('settings.mcp.enableHint')}
        </p>
      ) : null}

      <div className={enabled ? undefined : 'mcp-showcase mcp-showcase--dimmed'}>
        <h4 className="mcp-showcase-heading">{t('settings.mcp.howToTitle')}</h4>
        <ol className="mcp-howto-list">
          {howToSteps.map((step, index) => (
            <li key={`step-${index}`}>
              <span className="mcp-howto-index">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <h4 className="mcp-showcase-heading">{t('settings.mcp.sampleToolsTitle')}</h4>
        <p className="mb-2 max-w-2xl text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
          {t('settings.mcp.sampleToolsDescription')}
        </p>
        <div className="mcp-tool-grid">
          {SAMPLE_TOOLS.map((tool) => (
            <div key={tool.id} className="mcp-tool-card">
              <code>{tool.id}</code>
              <span>{t(tool.hintKey)}</span>
            </div>
          ))}
        </div>

        <h4 className="mcp-showcase-heading">{t('settings.mcp.samplePromptsTitle')}</h4>
        <p className="mb-2 max-w-2xl text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
          {t('settings.mcp.samplePromptsDescription')}
        </p>
        <div className="mcp-prompt-list">
          {samplePrompts.map((prompt) => (
            <div key={prompt} className="mcp-prompt-row">
              <p>{prompt}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 gap-1 px-2 text-[11px]"
                onClick={() =>
                  void copyText(prompt, 'settings.mcp.promptCopied', 'settings.mcp.copyError', t)
                }
              >
                <Copy className="h-3 w-3" />
                {t('settings.mcp.copyPromptShort')}
              </Button>
            </div>
          ))}
        </div>

        <SettingsGroup className="mb-4 mt-4">
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
                  CURSOR_CONFIG,
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
            title={t('settings.mcp.claudeConfigTitle')}
            description={t('settings.mcp.claudeConfigDescription')}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                void copyText(
                  CLAUDE_CONFIG,
                  'settings.mcp.claudeConfigCopied',
                  'settings.mcp.copyError',
                  t,
                )
              }
            >
              <Terminal className="h-3.5 w-3.5" />
              {t('settings.mcp.copyClaudeConfig')}
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
                  promptTemplate,
                  'settings.mcp.promptCopied',
                  'settings.mcp.copyError',
                  t,
                )
              }
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t('settings.mcp.copyPrompt')}
            </Button>
          </SettingsRow>
        </SettingsGroup>

        <pre className="mb-3 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 font-mono text-[11px] leading-relaxed text-[var(--color-foreground)]">
          {CURSOR_CONFIG}
        </pre>
        <p className="m-0 max-w-2xl text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
          {t('settings.mcp.pathHint')}
        </p>
        <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
          {t('settings.mcp.lockHint')}
        </p>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-4 h-auto px-0 text-[12px] text-[var(--color-accent)]"
        onClick={() => void navigate(ROUTES.settingsSection('nlp'))}
      >
        {t('settings.mcp.localAiLink')}
      </Button>
    </SettingsSection>
  )
}
