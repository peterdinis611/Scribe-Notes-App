import skSkolaAZmluvy from '@/assets/template-packs/sk-skola-a-zmluvy.scribe-templates.json'
import skZapisnice from '@/assets/template-packs/sk-zapisnice.scribe-templates.json'
import {
  parseTemplatePack,
  type BundledTemplatePackMeta,
} from '@/lib/templates/packs'

export const BUNDLED_TEMPLATE_PACKS: BundledTemplatePackMeta[] = [
  {
    id: 'sk-zapisnice',
    labelKey: 'templates.packs.bundled.skZapisnice',
    pack: parseTemplatePack(skZapisnice),
  },
  {
    id: 'sk-skola-a-zmluvy',
    labelKey: 'templates.packs.bundled.skSkolaAZmluvy',
    pack: parseTemplatePack(skSkolaAZmluvy),
  },
]

export function getBundledTemplatePack(id: string): BundledTemplatePackMeta | undefined {
  return BUNDLED_TEMPLATE_PACKS.find((item) => item.id === id)
}
