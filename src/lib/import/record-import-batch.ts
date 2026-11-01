import type { Document } from '@/lib/db/api'
import type { AppDispatch } from '@/store'
import { openImportBatch } from '@/store/documentsSlice'

/** Push just-imported notes into the right-side Import batch panel. */
export function recordImportBatch(dispatch: AppDispatch, docs: Document[]) {
  if (docs.length === 0) return
  dispatch(
    openImportBatch(
      docs.map((doc) => ({
        id: doc.id,
        title: doc.title?.trim() || doc.id,
      })),
    ),
  )
}
