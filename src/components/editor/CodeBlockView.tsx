import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy } from 'lucide-react'
import { CodeLanguageMenu } from '@/components/editor-toolbar/CodeLanguageMenu'
import { ScribeSyntaxHighlighter } from '@/components/editor/ScribeSyntaxHighlighter'
import { getCodeLanguageLabel } from '@/lib/editor/code-languages'
import { cn } from '@/lib/utils'

export function CodeBlockView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const { t } = useTranslation()
  const language = (node.attrs.language as string | null) ?? null
  const code = useDeferredValue(node.textContent)
  const [copied, setCopied] = useState(false)
  const editable = editor.isEditable

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(node.textContent)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
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
            language={language}
            editor={editor}
            triggerClassName="scribe-code-block__lang"
            onSelect={(id) => updateAttributes({ language: id === 'auto' ? null : id })}
          />
        ) : (
          <span className="scribe-code-block__lang-label">{getCodeLanguageLabel(language)}</span>
        )}
        <button
          type="button"
          className="scribe-code-block__copy"
          onClick={() => void copyCode()}
          title={copied ? t('codeBlock.copied') : t('codeBlock.copy')}
          aria-label={copied ? t('codeBlock.copied') : t('codeBlock.copy')}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t('codeBlock.copied') : t('codeBlock.copy')}
        </button>
      </div>
      <div className="scribe-code-block__body">
        <ScribeSyntaxHighlighter code={code} language={language} overlay />
        <pre className="scribe-code-block__input">
          <NodeViewContent as="code" />
        </pre>
      </div>
    </NodeViewWrapper>
  )
}
