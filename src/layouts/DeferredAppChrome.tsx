import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { scheduleIdle } from '@/lib/schedule-idle'
import type { DocumentTemplate } from '@/lib/templates'
import { useAppSelector } from '@/store/hooks'

const CommandPalette = lazy(() =>
  import('@/components/CommandPalette').then((m) => ({ default: m.CommandPalette })),
)
const TemplatePicker = lazy(() =>
  import('@/components/TemplatePicker').then((m) => ({ default: m.TemplatePicker })),
)
const AgentWorkspaceDock = lazy(() =>
  import('@/components/agent/AgentWorkspaceDock').then((m) => ({ default: m.AgentWorkspaceDock })),
)
const MoveToFolderDialog = lazy(() =>
  import('@/components/MoveToFolderMenu').then((m) => ({ default: m.MoveToFolderDialog })),
)
const InputDialogHost = lazy(() =>
  import('@/components/InputDialogHost').then((m) => ({ default: m.InputDialogHost })),
)
const CommentDialogHost = lazy(() =>
  import('@/components/CommentDialogHost').then((m) => ({ default: m.CommentDialogHost })),
)
const LoremIpsumDialogHost = lazy(() =>
  import('@/components/LoremIpsumDialogHost').then((m) => ({ default: m.LoremIpsumDialogHost })),
)
const MathExpressionDialogHost = lazy(() =>
  import('@/components/MathExpressionDialogHost').then((m) => ({
    default: m.MathExpressionDialogHost,
  })),
)
const ChartBuilderDialogHost = lazy(() =>
  import('@/components/ChartBuilderDialogHost').then((m) => ({ default: m.ChartBuilderDialogHost })),
)
const MermaidDialogHost = lazy(() =>
  import('@/components/MermaidDialogHost').then((m) => ({ default: m.MermaidDialogHost })),
)
const InvoiceDialogHost = lazy(() =>
  import('@/components/InvoiceDialogHost').then((m) => ({ default: m.InvoiceDialogHost })),
)
const StorageAccessDialogHost = lazy(() =>
  import('@/components/StorageAccessDialogHost').then((m) => ({
    default: m.StorageAccessDialogHost,
  })),
)
const ConfirmDialogHost = lazy(() =>
  import('@/components/ConfirmDialogHost').then((m) => ({ default: m.ConfirmDialogHost })),
)
const SaveCustomTemplateDialogHost = lazy(() =>
  import('@/components/SaveCustomTemplateDialogHost').then((m) => ({
    default: m.SaveCustomTemplateDialogHost,
  })),
)
const CompileDialog = lazy(() =>
  import('@/components/library/CompileDialog').then((m) => ({ default: m.CompileDialog })),
)
const SyncConflictsDialog = lazy(() =>
  import('@/components/library/SyncConflictsDialog').then((m) => ({
    default: m.SyncConflictsDialog,
  })),
)
const TrashDialog = lazy(() =>
  import('@/components/TrashDialog').then((m) => ({ default: m.TrashDialog })),
)
const LibraryFindReplaceDialog = lazy(() =>
  import('@/components/LibraryFindReplaceDialog').then((m) => ({
    default: m.LibraryFindReplaceDialog,
  })),
)
const SetupWizard = lazy(() =>
  import('@/components/SetupWizard').then((m) => ({ default: m.SetupWizard })),
)
const OnboardingTour = lazy(() =>
  import('@/components/OnboardingTour').then((m) => ({ default: m.OnboardingTour })),
)
const WhatsNewDialog = lazy(() =>
  import('@/components/WhatsNewDialog').then((m) => ({ default: m.WhatsNewDialog })),
)

function IdleGate({ children, delayMs = 0 }: { children: ReactNode; delayMs?: number }) {
  const [ready, setReady] = useState(delayMs === 0)

  useEffect(() => {
    if (delayMs === 0) return
    return scheduleIdle(() => setReady(true), Math.max(800, delayMs))
  }, [delayMs])

  if (!ready) return null
  return <>{children}</>
}

type DeferredAppChromeProps = {
  templatePickerOpen: boolean
  onTemplatePickerClose: () => void
  onSelectTemplate: (template: DocumentTemplate) => Promise<void>
  movePickerOpen: boolean
  moveDocumentId: string | null
  moveDocumentIds: string[]
  moveFolderId: string | null
  onMovePickerOpenChange: (open: boolean) => void
  setupReady: boolean
  onSetupFinished: () => void
  onboardingEnabled: boolean
  onOnboardingFinished: () => void
  whatsNewOpen: boolean
  onWhatsNewClose: () => void
}

/** Mount heavy chrome only after the user opens it (keeps idle shell lean). */
function OpenWhen({
  open,
  children,
}: {
  open: boolean
  children: ReactNode
}) {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) setMounted(true)
  }, [open])
  if (!mounted) return null
  return <>{children}</>
}

/** Heavy overlays/dialogs — deferred so the library shell paints first. */
export function DeferredAppChrome({
  templatePickerOpen,
  onTemplatePickerClose,
  onSelectTemplate,
  movePickerOpen,
  moveDocumentId,
  moveDocumentIds,
  moveFolderId,
  onMovePickerOpenChange,
  setupReady,
  onSetupFinished,
  onboardingEnabled,
  onOnboardingFinished,
  whatsNewOpen,
  onWhatsNewClose,
}: DeferredAppChromeProps) {
  const commandPaletteOpen = useAppSelector((state) => state.folders.commandPaletteOpen)
  const agentPanelOpen = useAppSelector((state) => state.documents.agentPanelOpen)

  return (
    <Suspense fallback={null}>
      <IdleGate delayMs={1}>
        <OpenWhen open={commandPaletteOpen}>
          <CommandPalette />
        </OpenWhen>
        <InputDialogHost />
        <ConfirmDialogHost />
        <StorageAccessDialogHost />
        <OpenWhen open={agentPanelOpen}>
          <AgentWorkspaceDock />
        </OpenWhen>
      </IdleGate>

      <IdleGate delayMs={400}>
        <TemplatePicker
          open={templatePickerOpen}
          onClose={onTemplatePickerClose}
          onSelect={onSelectTemplate}
        />
        <MoveToFolderDialog
          open={movePickerOpen}
          documentId={moveDocumentId}
          documentIds={moveDocumentIds}
          folderId={moveFolderId}
          onOpenChange={onMovePickerOpenChange}
        />
        <CommentDialogHost />
        <LoremIpsumDialogHost />
        <MathExpressionDialogHost />
        <ChartBuilderDialogHost />
        <MermaidDialogHost />
        <InvoiceDialogHost />
        <SaveCustomTemplateDialogHost />
        <CompileDialog />
        <SyncConflictsDialog />
        <TrashDialog />
        <LibraryFindReplaceDialog />
      </IdleGate>

      <IdleGate delayMs={setupReady ? 600 : 0}>
        <SetupWizard onFinished={onSetupFinished} />
        <OnboardingTour enabled={onboardingEnabled} onFinished={onOnboardingFinished} />
        <WhatsNewDialog open={whatsNewOpen} onClose={onWhatsNewClose} />
      </IdleGate>
    </Suspense>
  )
}
