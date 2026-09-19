import React, { useState } from 'react'
import { FolderKanban, Plus, Sparkles, FolderHeart } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface SmartFolder {
  id: string
  name: string
  queryRule: string
  icon?: string
}

interface SmartFoldersSectionProps {
  smartFolders: SmartFolder[]
  activeSmartFolderId?: string | null
  onSelectSmartFolder: (folder: SmartFolder) => void
  onCreateSmartFolder: (name: string, queryRule: string) => void
}

export const SmartFoldersSection: React.FC<SmartFoldersSectionProps> = ({
  smartFolders,
  activeSmartFolderId,
  onSelectSmartFolder,
  onCreateSmartFolder,
}) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState('')
  const [rule, setRule] = useState('')

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !rule.trim()) return
    onCreateSmartFolder(name.trim(), rule.trim())
    setName('')
    setRule('')
    setIsOpen(false)
  }

  const defaultSmartFolders: SmartFolder[] = [
    { id: 'sf-work', name: t('smartFolders.work', 'Work'), queryRule: 'work' },
    { id: 'sf-recipes', name: t('smartFolders.recipes', 'Recipes'), queryRule: 'recipe' },
    { id: 'sf-finance', name: t('smartFolders.finance', 'Finance'), queryRule: 'finance' },
  ]

  const displayFolders = smartFolders.length > 0 ? smartFolders : defaultSmartFolders

  return (
    <div className="px-2 py-1">
      <div className="flex items-center justify-between px-1 py-1 text-xs font-semibold text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <FolderKanban className="h-3.5 w-3.5 text-primary" />
          <span>{t('smartFolders.title', 'Smart Folders')}</span>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="rounded p-0.5 hover:bg-accent text-muted-foreground hover:text-foreground"
          title={t('smartFolders.add', 'Add Smart Folder')}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {isOpen && (
        <form onSubmit={handleCreate} className="mt-1 flex flex-col gap-1.5 p-2 rounded bg-muted/40 border border-border/50 text-xs">
          <input
            type="text"
            placeholder={t('smartFolders.namePlaceholder', 'Name (e.g. Work)')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-2 py-1 border rounded bg-background"
          />
          <input
            type="text"
            placeholder={t('smartFolders.rulePlaceholder', 'Query rule (e.g. tag:work or recipe)')}
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            className="w-full px-2 py-1 border rounded bg-background"
          />
          <div className="flex justify-end gap-1 mt-1">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2 py-0.5 rounded hover:bg-muted text-muted-foreground"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              className="px-2.5 py-0.5 bg-primary text-primary-foreground rounded font-medium"
            >
              {t('common.create', 'Create')}
            </button>
          </div>
        </form>
      )}

      <div className="mt-0.5 flex flex-col gap-0.5">
        {displayFolders.map((folder) => {
          const isActive = activeSmartFolderId === folder.id
          return (
            <button
              key={folder.id}
              onClick={() => onSelectSmartFolder(folder)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors w-full text-left ${
                isActive ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
              <span className="truncate">{folder.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
