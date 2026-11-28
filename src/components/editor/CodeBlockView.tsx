import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy } from 'lucide-react'
import { CodeLanguageMenu } from '@/components/editor-toolbar/CodeLanguageMenu'
import { ScribeSyntaxHighlighter } from '@/components/editor/ScribeSyntaxHighlighter'
import { copyCodeBlockToClipboard } from '@/lib/editor/code-block-clipboard'
import { detectCodeLanguage, getCodeLanguageLabel } from '@/lib/editor/code-languages'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { IconTooltip } from '@/components/ui/tooltip'

export function CodeBlockView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const { t } = useTranslation()
  const storedLanguage = (node.attrs.language as string | null) ?? null
  const detectedLanguage =
    !storedLanguage || storedLanguage === 'auto' ? detectCodeLanguage(node.textContent) : null
  const language =
    storedLanguage && storedLanguage !== 'auto' ? storedLanguage : detectedLanguage
  const code = useDeferredValue(node.textContent)
  const [copied, setCopied] = useState(false)
  const editable = editor.isEditable
  const autoLocked = useRef(false)
  const appliedLanguage = useRef<string | null>(null)

  useEffect(() => {
    if (!editable || autoLocked.current) return
    if (storedLanguage && storedLanguage !== 'auto') return
    if (!detectedLanguage || appliedLanguage.current === detectedLanguage) return
    appliedLanguage.current = detectedLanguage
    updateAttributes({ language: detectedLanguage })
  }, [detectedLanguage, editable, storedLanguage, updateAttributes])

  async function copyCode() {
    try {
      await copyCodeBlockToClipboard(node.textContent, language)
      setCopied(true)
      toast.success(t('codeBlock.copiedToast'))
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
      toast.error(t('codeBlock.copyFailed'))
    }
  }

  return (
    <NodeViewWrapper
      className={cn('scribe-code-block', selected && 'is-selected')}
      data-language={language ?? 'auto'}
    >
      <div className="scribe-code-block__bar" contentEditable={false}>
        {editable ? (
          <CodeLanguageMenu
            language={storedLanguage}
            editor={editor}
            triggerClassName="scribe-code-block__lang"
            onSelect={(id) => {
              autoLocked.current = id === 'auto'
              if (id !== 'auto') appliedLanguage.current = id
              updateAttributes({ language: id === 'auto' ? null : id })
            }}
          />
        ) : (
          <span className="scribe-code-block__lang-label">{getCodeLanguageLabel(language)}</span>
        )}
        <IconTooltip label={copied ? t('codeBlock.copied') : t('codeBlock.copy')}>
          <button
            type="button"
            className="scribe-code-block__copy"
            onClick={() => void copyCode()}
            aria-label={copied ? t('codeBlock.copied') : t('codeBlock.copy')}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t('codeBlock.copied') : t('codeBlock.copy')}
          </button>
        </IconTooltip>
      </div>
      <div className="scribe-code-block__body">
        <ScribeSyntaxHighlighter code={code} language={language} overlay />
        <pre className="scribe-code-block__input">
          <NodeViewContent<'code'> as="code" />
        </pre>
      </div>
    </NodeViewWrapper>
  )
}
