import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Bug, RefreshCw, Focus, Unlock, EyeOff, Type } from 'lucide-react'
import { editorRefs } from '@/store/editorRefs'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setFocusMode, setReadingMode } from '@/store/documentsSlice'
import { setEditorViewMode } from '@/store/settingsSlice'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Snapshot = {
  hasEditor: boolean
  isDestroyed: boolean
  isEditable: boolean
  isFocused: boolean
  contentEditable: string | null
  proseMirrorExists: boolean
  docSize: number
  activeTag: string
  activeClass: string
  lastKey: string
  lastKeyTarget: string
  keyCount: number
  overlayHits: string[]
}

function describeEl(el: Element | null): { tag: string; className: string } {
  if (!el || !(el instanceof HTMLElement)) return { tag: '(none)', className: '' }
  return {
    tag: el.tagName.toLowerCase(),
    className: (el.className || '').toString().slice(0, 80),
  }
}

function collectOverlaysAtCenter(): string[] {
  const x = Math.floor(window.innerWidth / 2)
  const y = Math.floor(window.innerHeight / 2)
  const stack = document.elementsFromPoint(x, y)
  return stack.slice(0, 8).map((el) => {
    const { tag, className } = describeEl(el)
    return `${tag}${className ? '.' + className.split(/\s+/).slice(0, 2).join('.') : ''}`
  })
}

function readSnapshot(editor: Editor | null, lastKey: string, lastKeyTarget: string, keyCount: number): Snapshot {
  let contentEditable: string | null = null
  let proseMirrorExists = false
  let docSize = 0
  try {
    const dom = editor && !editor.isDestroyed ? editor.view.dom : null
    proseMirrorExists = !!dom
    contentEditable = dom?.getAttribute('contenteditable') ?? null
    if (editor && !editor.isDestroyed) docSize = editor.state.doc.content.size
  } catch {
    proseMirrorExists = false
  }

  const active = describeEl(document.activeElement)

  return {
    hasEditor: !!editor,
    isDestroyed: editor?.isDestroyed ?? true,
    isEditable: editor?.isEditable ?? false,
    isFocused: editor?.isFocused ?? false,
    contentEditable,
    proseMirrorExists,
    docSize,
    activeTag: active.tag,
    activeClass: active.className,
    lastKey,
    lastKeyTarget,
    keyCount,
    overlayHits: collectOverlaysAtCenter(),
  }
}

export function EditorDebugPanel() {
  const dispatch = useAppDispatch()
  const readingMode = useAppSelector((state) => state.documents.readingMode)
  const focusMode = useAppSelector((state) => state.documents.focusMode)
  const saveStatus = useAppSelector((state) => state.documents.saveStatus)
  const viewMode = useAppSelector((state) => state.settings.editorViewMode)
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const [open, setOpen] = useState(true)
  const [lastKey, setLastKey] = useState('—')
  const [lastKeyTarget, setLastKeyTarget] = useState('—')
  const [keyCount, setKeyCount] = useState(0)
  const [testValue, setTestValue] = useState('')
  const [snap, setSnap] = useState<Snapshot>(() => readSnapshot(null, '—', '—', 0))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = describeEl(event.target as Element | null)
      setLastKey(
        [
          event.key,
          event.shiftKey ? '⇧' : '',
          event.altKey ? '⌥' : '',
          event.metaKey ? '⌘' : '',
          event.ctrlKey ? '⌃' : '',
          event.defaultPrevented ? '(prevented)' : '',
        ]
          .filter(Boolean)
          .join('+'),
      )
      setLastKeyTarget(`${target.tag} ${target.className}`.trim())
      setKeyCount((n) => n + 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => {
    const tick = () => {
      setSnap(readSnapshot(editorRefs.editor, lastKey, lastKeyTarget, keyCount))
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [lastKey, lastKeyTarget, keyCount, readingMode, focusMode, viewMode, saveStatus, activeId])

  function forceEditable() {
    const editor = editorRefs.editor
    if (!editor || editor.isDestroyed) return
    editor.setEditable(true)
    try {
      editor.view.dom.setAttribute('contenteditable', 'true')
    } catch {
      // view not ready
    }
    editor.commands.focus('end')
  }

  function forceFocus() {
    const editor = editorRefs.editor
    if (!editor || editor.isDestroyed) return
    editor.commands.focus('end')
  }

  function insertProbe() {
    const editor = editorRefs.editor
    if (!editor || editor.isDestroyed) return
    editor.setEditable(true)
    editor.chain().focus('end').insertContent(' [probe] ').run()
  }

  const problem =
    !snap.hasEditor
      ? 'Editor neexistuje'
      : snap.isDestroyed
        ? 'Editor je destroyed'
        : !snap.proseMirrorExists
          ? 'ProseMirror DOM chýba'
          : snap.contentEditable === 'false'
            ? 'contenteditable=false'
            : !snap.isEditable
              ? 'editor.isEditable=false'
              : readingMode
                ? 'Reading mode zapnutý'
                : viewMode !== 'rich'
                  ? 'Markdown režim'
                  : !snap.isFocused
                    ? 'Editor nemá fokus (klikni do textu)'
                    : snap.keyCount === 0
                      ? 'Zatiaľ neprišiel žiadny keydown'
                      : null

  if (!open) {
    return (
      <button
        type="button"
        className="fixed bottom-3 right-3 z-[100] inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2.5 py-1.5 text-[11px] font-semibold shadow-lg titlebar-no-drag"
        onClick={() => setOpen(true)}
      >
        <Bug className="h-3.5 w-3.5" />
        Debug
      </button>
    )
  }

  return (
    <div className="fixed bottom-3 right-3 z-[100] w-[min(380px,calc(100vw-24px))] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.2)] titlebar-no-drag">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="m-0 inline-flex items-center gap-1.5 text-[12px] font-semibold">
          <Bug className="h-3.5 w-3.5" />
          Editor debug
        </p>
        <button
          type="button"
          className="border-none bg-transparent text-[11px] text-[var(--color-muted-foreground)]"
          onClick={() => setOpen(false)}
        >
          Skryť
        </button>
      </div>

      <div
        className={cn(
          'mb-2 rounded-lg px-2.5 py-2 text-[12px] font-medium',
          problem
            ? 'bg-[color-mix(in_srgb,var(--color-destructive)_14%,transparent)] text-[var(--color-destructive)]'
            : 'bg-[color-mix(in_srgb,#34c759_16%,transparent)] text-[#1b7f37]',
        )}
      >
        {problem ? `Problém: ${problem}` : 'Stav vyzerá OK — skús písať'}
      </div>

      <label className="mb-2 block text-[11px] text-[var(--color-muted-foreground)]">
        Test vstup (obyčajný input — ak sem vieš písať, webview OK):
        <input
          type="text"
          value={testValue}
          onChange={(event) => setTestValue(event.target.value)}
          placeholder="Napíš sem test…"
          className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-[13px] text-[var(--color-foreground)] outline-none focus:border-[var(--color-accent)]"
        />
      </label>
      <p className="m-0 mb-2 text-[10px] text-[var(--color-muted-foreground)]">
        Test hodnota: <span className="font-mono">{testValue || '(prázdne)'}</span>
      </p>

      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px] leading-snug">
        <dt className="text-[var(--color-muted-foreground)]">activeId</dt>
        <dd className="m-0 truncate font-mono">{activeId ?? 'null'}</dd>
        <dt className="text-[var(--color-muted-foreground)]">viewMode</dt>
        <dd className="m-0 font-mono">{viewMode}</dd>
        <dt className="text-[var(--color-muted-foreground)]">reading</dt>
        <dd className="m-0 font-mono">{String(readingMode)}</dd>
        <dt className="text-[var(--color-muted-foreground)]">focusMode</dt>
        <dd className="m-0 font-mono">{String(focusMode)}</dd>
        <dt className="text-[var(--color-muted-foreground)]">saveStatus</dt>
        <dd className="m-0 font-mono">{saveStatus}</dd>
        <dt className="text-[var(--color-muted-foreground)]">hasEditor</dt>
        <dd className="m-0 font-mono">{String(snap.hasEditor)}</dd>
        <dt className="text-[var(--color-muted-foreground)]">isEditable</dt>
        <dd className="m-0 font-mono">{String(snap.isEditable)}</dd>
        <dt className="text-[var(--color-muted-foreground)]">contentEditable</dt>
        <dd className="m-0 font-mono">{snap.contentEditable ?? 'null'}</dd>
        <dt className="text-[var(--color-muted-foreground)]">isFocused</dt>
        <dd className="m-0 font-mono">{String(snap.isFocused)}</dd>
        <dt className="text-[var(--color-muted-foreground)]">docSize</dt>
        <dd className="m-0 font-mono">{snap.docSize}</dd>
        <dt className="text-[var(--color-muted-foreground)]">activeEl</dt>
        <dd className="m-0 truncate font-mono">
          {snap.activeTag} {snap.activeClass}
        </dd>
        <dt className="text-[var(--color-muted-foreground)]">lastKey</dt>
        <dd className="m-0 truncate font-mono">
          {snap.lastKey} → {snap.lastKeyTarget} ({snap.keyCount})
        </dd>
        <dt className="text-[var(--color-muted-foreground)]">hitTest</dt>
        <dd className="m-0 break-all font-mono text-[10px]">{snap.overlayHits.join(' › ')}</dd>
      </dl>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={forceEditable}>
          <Unlock className="h-3 w-3" />
          Editable
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={forceFocus}>
          <Focus className="h-3 w-3" />
          Focus
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={insertProbe}>
          <Type className="h-3 w-3" />
          Vlož [probe]
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={() => {
            dispatch(setReadingMode(false))
            dispatch(setFocusMode(false))
            dispatch(setEditorViewMode('rich'))
            forceEditable()
          }}
        >
          <EyeOff className="h-3 w-3" />
          Reset režimy
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={() => setSnap(readSnapshot(editorRefs.editor, lastKey, lastKeyTarget, keyCount))}
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </Button>
      </div>
    </div>
  )
}
