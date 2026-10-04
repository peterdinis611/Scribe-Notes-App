import type { PluginModule } from '@/lib/plugins/types'
import { editorRefs } from '@/store/editorRefs'
import { toast } from '@/lib/toast'

export const citationPackPlugin: PluginModule = {
  manifest: {
    id: 'scribe.citation-pack',
    name: 'Citation pack',
    version: '1.0.0',
    description: 'Insert citation stubs and copy a bibliography from [[wiki]] links.',
    author: 'Scribe',
    scribeApi: 2,
    permissions: ['editor.blocks', 'commands', 'export'],
    defaultEnabled: true,
    category: 'study',
    i18n: {
      en: {
        'manifest.name': 'Citation pack',
        'manifest.description': 'Citation stubs and bibliography helpers.',
        'block.label': 'Citation',
        'block.hint': 'Author / year citation stub',
        'cmd.copyBib': 'Copy wiki-link bibliography',
      },
      sk: {
        'manifest.name': 'Citačný balík',
        'manifest.description': 'Citácie a bibliografia z wiki odkazov.',
        'block.label': 'Citácia',
        'block.hint': 'Šablóna citácie autor / rok',
        'cmd.copyBib': 'Kopírovať bibliografiu z wiki odkazov',
      },
    },
  },
  activate(api) {
    api.blocks.register({
      id: 'citation',
      icon: '§',
      group: 'advanced',
      keywords: ['citation', 'cite', 'bib', 'zdroj'],
      label: api.i18n.t('block.label', 'Citation'),
      hint: api.i18n.t('block.hint', 'Author / year citation stub'),
      insert: (editor) => {
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'paragraph',
            content: [
              { type: 'text', text: '(' },
              { type: 'text', marks: [{ type: 'italic' }], text: 'Author' },
              { type: 'text', text: ', YYYY). ' },
              { type: 'text', text: 'Title. Source.' },
            ],
          })
          .run()
      },
    })

    api.commands.register({
      id: 'copy-bibliography',
      title: api.i18n.t('cmd.copyBib', 'Copy wiki-link bibliography'),
      hint: api.i18n.t('manifest.name'),
      keywords: ['citation', 'bibliography', 'wiki'],
      run: async () => {
        const editor = editorRefs.editor
        if (!editor || editor.isDestroyed) {
          toast.error('Open a note first')
          return
        }
        const text = editor.getText()
        const links = [...text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/g)].map(
          (m) => m[1].trim(),
        )
        const unique = [...new Set(links.filter(Boolean))]
        if (unique.length === 0) {
          toast.error('No [[wiki links]] found')
          return
        }
        const bib = unique.map((title, i) => `${i + 1}. ${title}`).join('\n')
        await navigator.clipboard.writeText(bib)
        toast.success('Bibliography copied', `${unique.length} sources`)
        api.log(`Copied ${unique.length} citations`)
      },
    })

    api.export.register({
      id: 'bibliography-txt',
      label: 'Bibliography (.txt)',
      extensions: ['txt'],
      export: async ({ title, contentJson }) => {
        let plain = contentJson
        try {
          const parsed = JSON.parse(contentJson) as { content?: unknown }
          plain = JSON.stringify(parsed)
        } catch {
          // keep raw
        }
        const text = plain
        const links = [...text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/g)].map(
          (m) => m[1].trim(),
        )
        const unique = [...new Set(links.filter(Boolean))]
        const body =
          `# ${title}\n\n` +
          (unique.length ? unique.map((item, i) => `${i + 1}. ${item}`).join('\n') : '(no wiki links)')
        await navigator.clipboard.writeText(body)
        toast.success('Bibliography copied')
      },
    })
  },
}
