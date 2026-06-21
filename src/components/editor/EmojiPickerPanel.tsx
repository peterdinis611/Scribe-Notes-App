import EmojiPicker, { Theme } from 'emoji-picker-react'
import type { Editor } from '@tiptap/react'
import { insertEmojiCharacter } from '@/lib/editor/emoji-suggestion'

type EmojiPickerPanelProps = {
  editor: Editor
  onClose?: () => void
}

export function EmojiPickerPanel({ editor, onClose }: EmojiPickerPanelProps) {
  return (
    <div className="emoji-picker-panel titlebar-no-drag">
      <EmojiPicker
        onEmojiClick={(emojiData) => {
          insertEmojiCharacter(editor, emojiData.emoji)
          onClose?.()
        }}
        theme={Theme.AUTO}
        width={320}
        height={360}
        searchPlaceholder="Hľadať emoji…"
        previewConfig={{ showPreview: false }}
        lazyLoadEmojis
      />
    </div>
  )
}
