import CharacterCount from '@tiptap/extension-character-count'
import Color from '@tiptap/extension-color'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import Emoji, { gitHubEmojis } from '@tiptap/extension-emoji'
import FileHandler from '@tiptap/extension-file-handler'
import Focus from '@tiptap/extension-focus'
import Highlight from '@tiptap/extension-highlight'
import InvisibleCharacters from '@tiptap/extension-invisible-characters'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Typography from '@tiptap/extension-typography'
import Underline from '@tiptap/extension-underline'
import Youtube from '@tiptap/extension-youtube'
import { Markdown } from '@tiptap/markdown'
import Dropcursor from '@tiptap/extension-dropcursor'
import Gapcursor from '@tiptap/extension-gapcursor'
import StarterKit from '@tiptap/starter-kit'
import { createEmojiSuggestion } from '@/lib/editor/emoji-suggestion'
import { CommentMark } from '@/lib/editor/comment-mark'
import { FontFamily } from '@/lib/editor/font-family'
import { FontSize } from '@/lib/editor/font-size'
import { ListItemWithBlocks } from '@/lib/editor/list-item'
import { MathJs } from '@/lib/editor/math-js-extension'
import { lowlight } from '@/lib/editor/lowlight'
import { PageBreak } from '@/lib/editor/page-break'
import { ResizableImage } from '@/lib/editor/resizable-image'
import { SlashCommands } from '@/lib/editor/slash-commands'
import { CustomTableCell, CustomTableHeader } from '@/lib/editor/table-extensions'

type EditorExtensionsOptions = {
  onInsertImages?: (files: File[], pos?: number) => void | Promise<void>
}

export function getEditorExtensions(options: EditorExtensionsOptions = {}) {
  const { onInsertImages } = options

  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      horizontalRule: {},
      codeBlock: false,
      listItem: false,
    }),
    ListItemWithBlocks,
    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: null,
      HTMLAttributes: {
        class: 'hljs',
      },
    }),
    TextStyle,
    FontSize,
    FontFamily,
    Color,
    CommentMark,
    Underline,
    Subscript,
    Superscript,
    Highlight.configure({
      multicolor: true,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right', 'justify'],
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    CustomTableHeader,
    CustomTableCell,
    Details.configure({
      persist: true,
      HTMLAttributes: { class: 'details-block' },
    }),
    DetailsContent,
    DetailsSummary,
    Emoji.configure({
      emojis: gitHubEmojis,
      enableEmoticons: true,
      suggestion: createEmojiSuggestion(),
    }),
    MathJs,
    Youtube.configure({
      width: 640,
      height: 360,
      nocookie: true,
    }),
    PageBreak,
    ResizableImage.configure({
      allowBase64: true,
      inline: false,
    }),
    CharacterCount,
    Focus.configure({
      className: 'has-focus',
      mode: 'deepest',
    }),
    InvisibleCharacters.configure({
      visible: false,
    }),
    FileHandler.configure({
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
      onDrop: (_editor, files, pos) => {
        if (files.length) void onInsertImages?.(files, pos)
      },
      onPaste: (_editor, files) => {
        if (files.length) void onInsertImages?.(files)
      },
    }),
    Dropcursor.configure({ color: '#007aff', width: 2 }),
    Gapcursor,
    Typography,
    SlashCommands.configure({
      onInsertImages: (files) => {
        if (files.length) void onInsertImages?.(files)
      },
    }),
    Placeholder.configure({
      placeholder: 'Začnite písať… pretiahnite sem obrázok alebo vložte zo schránky',
    }),
    Markdown.configure({
      indentation: { style: 'space', size: 2 },
    }),
  ]
}
