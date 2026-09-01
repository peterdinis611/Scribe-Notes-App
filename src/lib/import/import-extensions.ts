import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import { ResizableImage } from '@/lib/editor/resizable-image'
import { CustomTableCell, CustomTableHeader } from '@/lib/editor/table-extensions'

let importExtensions: ReturnType<typeof buildImportExtensions> | null = null

function buildImportExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      codeBlock: false,
    }),
    TextStyle.configure({}),
    Color.configure({}),
    Underline.configure({}),
    Subscript.configure({}),
    Superscript.configure({}),
    Highlight.configure({ multicolor: true }),
    Link.configure({
      openOnClick: false,
      autolink: false,
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right', 'justify'],
    }),
    TaskList.configure({}),
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow.configure({}),
    CustomTableHeader.configure({}),
    CustomTableCell.configure({}),
    ResizableImage.configure({
      allowBase64: false,
      inline: false,
    }),
  ]
}

/** Minimal TipTap extensions for Word HTML import — avoids loading the full editor stack. */
export function getImportExtensions() {
  if (!importExtensions) {
    importExtensions = buildImportExtensions()
  }
  return importExtensions
}
