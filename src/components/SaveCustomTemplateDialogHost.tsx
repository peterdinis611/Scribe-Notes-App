import { CustomTemplateDialog } from '@/components/CustomTemplateDialog'
import { insertStoredTemplate } from '@/lib/db/template-collections'
import { createCustomTemplate } from '@/lib/templates'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setSaveCustomTemplateDialog } from '@/store/templatesSlice'

export function SaveCustomTemplateDialogHost() {
  const dialog = useAppSelector((state) => state.templates.saveCustomTemplateDialog)
  const dispatch = useAppDispatch()

  if (!dialog.open) return null

  return (
    <CustomTemplateDialog
      open={dialog.open}
      onOpenChange={(open) => {
        if (!open) dispatch(setSaveCustomTemplateDialog({ open: false }))
      }}
      content={dialog.content}
      initialValues={{
        name: dialog.suggestedName,
        title: dialog.suggestedTitle,
      }}
      onSave={(values) => {
        void (async () => {
          try {
            const created = createCustomTemplate({
              ...values,
              content: dialog.content,
            })
            await insertStoredTemplate(created)
            toast.success('Šablóna uložená', values.name)
          } catch (error) {
            toast.error('Nepodarilo sa uložiť šablónu', String(error))
          }
        })()
      }}
    />
  )
}
