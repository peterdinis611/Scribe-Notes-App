import type { PluginModule } from '@/lib/plugins/types'

export const meetingWrapPlugin: PluginModule = {
  manifest: {
    id: 'scribe.meeting-wrap',
    name: 'Meeting wrap',
    version: '1.0.0',
    description: 'Slash template for meeting wrap-up notes.',
    author: 'Scribe',
    scribeApi: 2,
    permissions: ['editor.blocks', 'nlp.skills'],
    defaultEnabled: true,
    category: 'writing',
    i18n: {
      en: {
        'manifest.name': 'Meeting wrap',
        'block.label': 'Meeting wrap-up',
        'block.hint': 'Decisions, actions, attendees',
        'skill.title': 'Summarize meeting actions',
      },
      sk: {
        'manifest.name': 'Zápis zo stretnutia',
        'block.label': 'Zhrnutie stretnutia',
        'block.hint': 'Rozhodnutia, úlohy, účastníci',
        'skill.title': 'Zhrnúť úlohy zo stretnutia',
      },
    },
  },
  activate(api) {
    api.blocks.register({
      id: 'meeting-wrap',
      icon: '📋',
      group: 'advanced',
      keywords: ['meeting', 'wrap', 'standup', 'stretnutie'],
      label: api.i18n.t('block.label', 'Meeting wrap-up'),
      hint: api.i18n.t('block.hint', 'Decisions, actions, attendees'),
      insert: (editor) => {
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Meeting wrap-up' }],
            },
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [{ type: 'text', text: 'Attendees' }],
            },
            {
              type: 'bulletList',
              content: [
                { type: 'listItem', content: [{ type: 'paragraph' }] },
              ],
            },
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [{ type: 'text', text: 'Decisions' }],
            },
            {
              type: 'bulletList',
              content: [
                { type: 'listItem', content: [{ type: 'paragraph' }] },
              ],
            },
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [{ type: 'text', text: 'Action items' }],
            },
            {
              type: 'taskList',
              content: [
                {
                  type: 'taskItem',
                  attrs: { checked: false },
                  content: [{ type: 'paragraph' }],
                },
              ],
            },
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [{ type: 'text', text: 'Notes' }],
            },
            { type: 'paragraph' },
          ])
          .run()
      },
    })

    api.nlp.registerSkill({
      id: 'extract-actions',
      title: api.i18n.t('skill.title', 'Summarize meeting actions'),
      description: 'Heuristic action-item extractor from meeting text.',
      run: ({ text }) => {
        const lines = text
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean)
        const actions = lines.filter((line) =>
          /^(?:[-*]\s*)?(?:TODO|ACTION|\[ \]|@|\bwill\b|\budelá\b)/i.test(line),
        )
        return {
          actions: actions.slice(0, 40),
          count: actions.length,
          source: 'scribe.meeting-wrap',
        }
      },
    })
  },
}
