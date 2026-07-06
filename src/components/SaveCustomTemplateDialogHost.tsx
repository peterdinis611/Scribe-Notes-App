import { CustomTemplateDialog } from '@/components/CustomTemplateDialog'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { addCustomTemplate, setSaveCustomTemplateDialog } from '@/store/templatesSlice'

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
        dispatch(
          addCustomTemplate({
            ...values,
            content: dialog.content,
          }),
        )
        toast.success('Šablóna uložená', values.name)
      }}
    />
  )
}
