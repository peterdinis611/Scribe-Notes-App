import type { JSONContent } from '@tiptap/core'
import type { TemplateCategoryId } from '@/lib/templates/categories'

import { SCRIBE_DEMO_GUIDE_TEMPLATE } from '@/lib/templates/demo-guide'

export interface DocumentTemplate {
  id: string
  name: string
  description: string
  category: TemplateCategoryId
  title: string
  content: JSONContent
}

export type { TemplateCategoryId, BuiltInTemplateCategory, CustomTemplateCategory } from '@/lib/templates/categories'
export {
  BUILT_IN_TEMPLATE_CATEGORIES,
  builtInCategoryLabels,
  createCustomCategory,
  getCategoryLabel,
  isBuiltInCategory,
  isCustomCategoryId,
  isValidCategoryId,
  NEW_CATEGORY_SELECT_VALUE,
} from '@/lib/templates/categories'

const blank: DocumentTemplate = {
  id: 'blank',
  name: 'Prázdna stránka',
  description: 'Prázdny dokument bez predformátovania',
  category: 'general',
  title: 'Nový dokument',
  content: {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  },
}

const modernReport: DocumentTemplate = {
  id: 'modern-report',
  name: 'Moderný report',
  description: 'Titulná strana, obsah a štruktúrované sekcie',
  category: 'business',
  title: 'Report',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'Názov reportu' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Autor · Dátum · Verzia 1.0' }],
      },
      { type: 'horizontalRule' },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Obsah' }],
      },
      {
        type: 'orderedList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Zhrnutie' }] }],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Úvod' }] }],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hlavná časť' }] }],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Záver' }] }],
          },
        ],
      },
      { type: 'horizontalRule' },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Zhrnutie' }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Stručné zhrnutie kľúčových zistení a odporúčaní pre čitateľa.',
          },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Úvod' }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Kontext, cieľ dokumentu a rozsah spracovanej témy.',
          },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Hlavná časť' }],
      },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Sekcia 1' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Obsah prvej sekcie.' }],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Záver' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Zhrnutie a ďalšie kroky.' }],
      },
    ],
  },
}

const businessLetter: DocumentTemplate = {
  id: 'business-letter',
  name: 'Obchodný list',
  description: 'Formálny list s hlavičkou a podpisom',
  category: 'business',
  title: 'Obchodný list',
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Vaše meno' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Adresa · Mesto · PSČ' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'email@example.com · +421 000 000 000' }],
      },
      { type: 'paragraph', content: [{ type: 'text', text: '' }] },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Dátum' }],
      },
      { type: 'paragraph', content: [{ type: 'text', text: '' }] },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Meno príjemcu' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Názov spoločnosti' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Adresa príjemcu' }],
      },
      { type: 'paragraph', content: [{ type: 'text', text: '' }] },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Vážený/á [Meno],' }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Úvodný odsek listu — stručne uveďte dôvod písania a kontext.',
          },
        ],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Hlavná časť — podrobnejšie vysvetlite požiadavku, ponuku alebo informáciu.',
          },
        ],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Záverečný odsek — poďakovanie a výzva k ďalšiemu kroku.',
          },
        ],
      },
      { type: 'paragraph', content: [{ type: 'text', text: '' }] },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'S pozdravom,' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Vaše meno' }],
      },
    ],
  },
}

const resume: DocumentTemplate = {
  id: 'resume',
  name: 'Životopis',
  description: 'Profesionálny CV s prehľadnými sekciami',
  category: 'personal',
  title: 'Životopis',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'Meno Priezvisko' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Pozícia · Mesto · email@example.com · +421 000 000 000' }],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Profil' }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Krátky profesionálny profil — 2–3 vety o vašich silných stránkach a cieľoch.',
          },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Skúsenosti' }],
      },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Názov pozície · Spoločnosť' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '2022 – súčasnosť' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Kľúčová zodpovednosť alebo úspech' }] }],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ďalší relevantný bod' }] }],
          },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Vzdelanie' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Titul · Univerzita · Rok' }],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Zručnosti' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Zručnosť 1' }] }],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Zručnosť 2' }] }],
          },
        ],
      },
    ],
  },
}

const newsletter: DocumentTemplate = {
  id: 'newsletter',
  name: 'Newsletter',
  description: 'Krátke spravodajstvo s nadpismi a citátom',
  category: 'creative',
  title: 'Newsletter',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'Názov vydania' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Mesiac Rok · Číslo 1' }],
      },
      { type: 'horizontalRule' },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Hlavná správa' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Úvodný text k hlavnej téme tohto vydania.' }],
      },
      {
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Výrazný citát alebo highlight z článku.' }],
          },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Novinky' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Novinka 1' }] }],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Novinka 2' }] }],
          },
        ],
      },
    ],
  },
}

const meetingNotes: DocumentTemplate = {
  id: 'meeting-notes',
  name: 'Zápisnica zo stretnutia',
  description: 'Účastníci, agenda a úlohy',
  category: 'business',
  title: 'Zápisnica',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'Zápisnica zo stretnutia' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Dátum · Čas · Miesto' }],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Účastníci' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Meno 1' }] }],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Meno 2' }] }],
          },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Agenda' }],
      },
      {
        type: 'orderedList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bod 1' }] }],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bod 2' }] }],
          },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Poznámky' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Záznam diskusie a rozhodnutí.' }],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Úlohy' }],
      },
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Úloha — zodpovedný · termín' }] }],
          },
        ],
      },
    ],
  },
}

const essay: DocumentTemplate = {
  id: 'essay',
  name: 'Esej',
  description: 'Akademická esej s úvodom, argumentmi a záverom',
  category: 'personal',
  title: 'Esej',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'Názov eseje' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Autor · Predmet · Dátum' }],
      },
      { type: 'tableOfContents', attrs: { maxLevel: 2 } },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Úvod' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Predstavte tému a hlavnú tézu eseje.' }],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Argument 1' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Rozviňte prvý hlavný argument s príkladmi.' }],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Záver' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Zhrňte myšlienky a otvorte ďalšie otázky.' }],
      },
    ],
  },
}

const projectProposal: DocumentTemplate = {
  id: 'project-proposal',
  name: 'Návrh projektu',
  description: 'Ciele, rozsah, harmonogram a rozpočet',
  category: 'business',
  title: 'Návrh projektu',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'Názov projektu' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Zodpovedná osoba · Oddelenie · Termín' }],
      },
      { type: 'tableOfContents', attrs: { maxLevel: 2 } },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Cieľ projektu' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Stručne popíšte, čo projekt dosiahne.' }],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Rozsah' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Súčasť projektu 1' }] }],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Súčasť projektu 2' }] }],
          },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Harmonogram' }],
      },
      {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fáza 1 — termín' }] }],
          },
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fáza 2 — termín' }] }],
          },
        ],
      },
    ],
  },
}

const invoice: DocumentTemplate = {
  id: 'invoice',
  name: 'Faktúra',
  description: 'Jednoduchá faktúra s položkami a sumou',
  category: 'business',
  title: 'Faktúra',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'FAKTÚRA' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Číslo faktúry: 2026-001 · Dátum vystavenia · Splatnosť' }],
      },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Dodávateľ' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Názov firmy · IČO · DIČ · Adresa' }],
      },
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Odberateľ' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Meno / firma · Adresa' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '' }],
      },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Položka' }] }] },
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Množstvo' }] }] },
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cena' }] }] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Služba / produkt' }] }] },
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '0,00 €' }] }] },
            ],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Spolu: 0,00 €' }],
      },
    ],
  },
}

const academicPaper: DocumentTemplate = {
  id: 'academic-paper',
  name: 'Akademická práca',
  description: 'Abstrakt, obsah a štruktúrované kapitoly',
  category: 'general',
  title: 'Akademická práca',
  content: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'Názov práce' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Autor · Inštitúcia · Rok' }],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Abstrakt' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Stručné zhrnutie práce v 150–250 slovách.' }],
      },
      { type: 'tableOfContents', attrs: { maxLevel: 3 } },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: '1. Úvod' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Motivácia, ciele a štruktúra práce.' }],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: '2. Teoretická časť' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Prehľad existujúcej literatúry a pojmov.' }],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: '3. Záver' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Zhrnutie výsledkov a odporúčania.' }],
      },
    ],
  },
}

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  blank,
  SCRIBE_DEMO_GUIDE_TEMPLATE,
  modernReport,
  businessLetter,
  resume,
  newsletter,
  meetingNotes,
  essay,
  projectProposal,
  invoice,
  academicPaper,
]

export function getTemplateById(id: string): DocumentTemplate | undefined {
  return DOCUMENT_TEMPLATES.find((t) => t.id === id)
}

export { mergeTemplates, isCustomTemplate, createCustomTemplate } from '@/lib/templates/custom'
export type { CustomDocumentTemplate, CustomTemplateInput } from '@/lib/templates/custom'
