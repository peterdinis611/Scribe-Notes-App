/** Copy-paste setup examples shown in Settings → Plugins. */

export type PluginSetupExample = {
  id: string
  /** i18n: settings.plugins.examples.<id>.title / .hint */
  language: 'javascript' | 'json'
  code: string
}

export const PLUGIN_SETUP_EXAMPLES: PluginSetupExample[] = [
  {
    id: 'minimal',
    language: 'javascript',
    code: `// index.js — export default activate(api)
export default function activate(api) {
  api.commands.register({
    id: 'hello',
    title: api.i18n.t('cmd.hello', 'Say hello'),
    run: () => api.notify.success('Hello from my plugin'),
  })
}
`,
  },
  {
    id: 'manifest',
    language: 'json',
    code: `{
  "id": "example.hello",
  "name": "Hello",
  "version": "1.0.0",
  "scribeApi": 2,
  "permissions": ["commands"],
  "defaultEnabled": true,
  "i18n": {
    "en": { "cmd.hello": "Say hello" },
    "sk": { "cmd.hello": "Pozdrav" }
  }
}
`,
  },
  {
    id: 'slashBlock',
    language: 'javascript',
    code: `export default function activate(api) {
  api.blocks.register({
    id: 'my-note',
    icon: '✦',
    group: 'advanced',
    label: 'My note',
    hint: 'Custom slash block',
    insert: (editor) => {
      editor.chain().focus().insertContent({
        type: 'paragraph',
        content: [{ type: 'text', text: 'Hello block' }],
      }).run()
    },
  })
}
`,
  },
]

export const EXAMPLE_PACKAGE_PATHS = [
  'src/lib/plugins/examples/hello.scribe-ext.json',
  'src/lib/plugins/examples/slash-block.scribe-ext.json',
  'src/lib/plugins/examples/command-notify.scribe-ext.json',
] as const
