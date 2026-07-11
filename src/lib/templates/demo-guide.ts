import type { JSONContent } from '@tiptap/core'
import type { TemplateCategoryId } from '@/lib/templates/categories'

type TextMark = { type: string; attrs?: Record<string, unknown> }

function t(text: string, marks?: TextMark[]): JSONContent {
  return marks?.length ? { type: 'text', text, marks } : { type: 'text', text }
}

function p(...content: JSONContent[]): JSONContent {
  return { type: 'paragraph', content }
}

function h(level: number, text: string): JSONContent {
  return { type: 'heading', attrs: { level }, content: [t(text)] }
}

function li(...content: JSONContent[]): JSONContent {
  return { type: 'listItem', content }
}

function bullet(...items: JSONContent[]): JSONContent {
  return { type: 'bulletList', content: items }
}

function ordered(...items: JSONContent[]): JSONContent {
  return { type: 'orderedList', content: items }
}

function task(checked: boolean, ...content: JSONContent[]): JSONContent {
  return {
    type: 'taskItem',
    attrs: { checked },
    content,
  }
}

function tasks(...items: JSONContent[]): JSONContent {
  return { type: 'taskList', content: items }
}

function callout(variant: 'info' | 'tip' | 'warning' | 'danger', ...blocks: JSONContent[]): JSONContent {
  return { type: 'callout', attrs: { variant }, content: blocks }
}

function codeBlock(language: string, code: string): JSONContent {
  return {
    type: 'codeBlock',
    attrs: { language },
    content: [{ type: 'text', text: code }],
  }
}

function wikiLink(label: string, targetId: string | null = null): JSONContent {
  return { type: 'wikiLink', attrs: { label, targetId } }
}

function footnote(id: string, number: number, content: string): JSONContent {
  return { type: 'footnote', attrs: { id, number, content } }
}

function mathInline(expression: string): JSONContent {
  return { type: 'mathInline', attrs: { expression } }
}

function mathBlock(expression: string): JSONContent {
  return { type: 'mathBlock', attrs: { expression } }
}

function hr(): JSONContent {
  return { type: 'horizontalRule' }
}

function tableOfContents(): JSONContent {
  return { type: 'tableOfContents', attrs: { maxLevel: 3 } }
}

function details(summary: string, ...blocks: JSONContent[]): JSONContent {
  return {
    type: 'details',
    content: [
      { type: 'detailsSummary', content: [t(summary)] },
      { type: 'detailsContent', content: blocks },
    ],
  }
}

function demoTable(): JSONContent {
  return {
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: [
          { type: 'tableHeader', content: [p(t('Funkcia'))] },
          { type: 'tableHeader', content: [p(t('Kde ju nájdete'))] },
          { type: 'tableHeader', content: [p(t('Skratka'))] },
        ],
      },
      {
        type: 'tableRow',
        content: [
          { type: 'tableCell', content: [p(t('Nový dokument'))] },
          { type: 'tableCell', content: [p(t('⌘N alebo tlačidlo +'))] },
          { type: 'tableCell', content: [p(t('⌘N'))] },
        ],
      },
      {
        type: 'tableRow',
        content: [
          { type: 'tableCell', content: [p(t('Príkazová paleta'))] },
          { type: 'tableCell', content: [p(t('⌘K'))] },
          { type: 'tableCell', content: [p(t('⌘K'))] },
        ],
      },
      {
        type: 'tableRow',
        content: [
          { type: 'tableCell', content: [p(t('Hľadať v dokumente'))] },
          { type: 'tableCell', content: [p(t('Lupa v pravom paneli'))] },
          { type: 'tableCell', content: [p(t('⌘F'))] },
        ],
      },
      {
        type: 'tableRow',
        content: [
          { type: 'tableCell', content: [p(t('Režim sústredenia'))] },
          { type: 'tableCell', content: [p(t('Ikona Focus v paneli'))] },
          { type: 'tableCell', content: [p(t('⌘⇧F'))] },
        ],
      },
    ],
  }
}

/** Placeholder replaced pri seedovaní databázy (Rust). */
export const WIKI_TARGET_PLACEHOLDER = '{{WIKI_TARGET_ID}}'

export function buildScribeDemoContent(wikiTargetId: string | null = null): JSONContent {
  const wikiTarget = wikiTargetId ?? WIKI_TARGET_PLACEHOLDER

  return {
    type: 'doc',
    content: [
      h(1, 'Sprievodca Scribe — interaktívne demo'),
      p(
        t('Tento dokument ukazuje '),
        t('všetky hlavné funkcie', [{ type: 'bold' }]),
        t(' lokálneho editora Scribe. Prejdite sekciami, skúšajte formátovanie a experimentujte s príkladmi nižšie.'),
      ),
      callout(
        'tip',
        p(
          t('Tip: '),
          t('Začnite napísaním '),
          t('/', [{ type: 'code' }]),
          t(' v prázdnom riadku — otvorí sa menu slash príkazov s nadpismi, tabuľkami, calloutmi a ďalšími blokmi.'),
        ),
      ),
      tableOfContents(),
      hr(),

      h(2, '1. Editor a formátovanie textu'),
      p(
        t('Skúste označiť text a použiť toolbar alebo skratky: '),
        t('tučné', [{ type: 'bold' }]),
        t(', '),
        t('kurzíva', [{ type: 'italic' }]),
        t(', '),
        t('podčiarknuté', [{ type: 'underline' }]),
        t(', '),
        t('prečiarknuté', [{ type: 'strike' }]),
        t(', '),
        t('zvýraznené', [{ type: 'highlight' }]),
        t(' a '),
        t('inline kód', [{ type: 'code' }]),
        t('.'),
      ),
      p(
        t('Farby textu a zarovnanie (vľavo, stred, vpravo, do bloku) nájdete v záložke Text. Odstavec môžete tiež označiť ako citáciu alebo callout.'),
      ),

      h(2, '2. Nadpisy a štruktúra'),
      h(3, 'Nadpis úrovne 3'),
      p(t('Pod nadpismi môžete vkladať bežný text, zoznamy aj vnorené bloky. Štruktúru dokumentu zobrazí panel '),
        t('Štruktúra dokumentu', [{ type: 'bold' }]),
        t(' v pravom paneli (ikona stromu).')),
      h(4, 'Nadpis úrovne 4'),
      p(t('Automatický obsah (TOC) na začiatku tohto dokumentu sa aktualizuje podľa nadpisov.')),

      h(2, '3. Zoznamy a úlohy'),
      bullet(
        li(p(t('Odrážkový zoznam — vložte cez / alebo toolbar'))),
        li(p(t('Podpora vnorených položiek'))),
        li(
          p(t('Drag handle vľavo od bloku umožňuje presúvať odsevce')),
        ),
      ),
      ordered(
        li(p(t('Prvý krok'))),
        li(p(t('Druhý krok'))),
        li(p(t('Tretí krok'))),
      ),
      tasks(
        task(false, p(t('Nezaškrtnutá úloha'))),
        task(true, p(t('Hotová ukážková úloha'))),
        task(false, p(t('Skúste prepnúť checkbox kliknutím'))),
      ),

      h(2, '4. Tabuľka'),
      p(t('Tabuľky sú editovateľné, s hlavičkou a zmenou šírky stĺpcov.')),
      demoTable(),

      h(2, '5. Callout bloky'),
      callout('info', p(t('Info callout — vhodný na vysvetlenie alebo kontext.'))),
      callout('tip', p(t('Tip callout — rady a odporúčania.'))),
      callout('warning', p(t('Varovanie — upozornenie na niečo dôležité.'))),
      callout('danger', p(t('Dôležité — kritická informácia alebo obmedzenie.'))),

      h(2, '6. Rozbaľovací blok (Details)'),
      details(
        'Kliknite pre rozbalenie ukážky',
        p(t('Skrytý obsah je užitočný pre FAQ, technické poznámky alebo voliteľné detaily.')),
        bullet(li(p(t('Položka vo vnorenom zozname')))),
      ),

      h(2, '7. Kód'),
      p(t('Inline: '), t('npm run tauri:dev', [{ type: 'code' }])),
      codeBlock(
        'typescript',
        "import { createDocument } from '@/lib/db/api'\n\nconst doc = await createDocument({\n  title: 'Môj dokument',\n})\n",
      ),

      h(2, '8. Matematika (math.js)'),
      p(t('Vložte vzorec v riadku '), mathInline('2 + 2 * 5'), t(' alebo ako blok:')),
      mathBlock('sum = 0\nfor i in 1..10\n  sum = sum + i\nsum'),

      h(2, '9. Wiki odkazy medzi dokumentmi'),
      p(
        t('Odkaz na iný dokument: '),
        wikiLink('Ukážkový cieľ wiki odkazu', wikiTarget),
        t('. Napíšte '),
        t('[[názov]]', [{ type: 'code' }]),
        t(' alebo použite slash príkaz Prepojiť dokument. Pri neexistujúcom cieli Scribe ponúkne vytvorenie nového dokumentu.'),
      ),

      h(2, '10. Poznámka pod čiarou'),
      p(
        t('Text môže obsahovať referenciu'),
        footnote('demo-fn-1', 1, 'Toto je ukážková poznámka pod čiarou. Kliknite na číslo pre úpravu.'),
        t(' ktorá sa zobrazí dole na stránke.'),
      ),

      h(2, '11. Komentáre'),
      p(
        t('Označte text a vložte komentár cez / alebo panel Komentáre. V tomto deme môžete pridať vlastný komentár k ľubovoľnému odseku — vlákna sa zobrazia v bočnom paneli.'),
      ),

      h(2, '12. Obrázky a médiá'),
      p(
        t('Pretiahnite obrázok do editora, vložte cez / Obrázok alebo toolbar. Obrázky sa ukladajú do '),
        t('~/Documents/Scribe/assets/', [{ type: 'code' }]),
        t('. Podporovaný je aj embed YouTube cez URL.'),
      ),

      h(2, '13. Knižnica a organizácia'),
      bullet(
        li(p(t('Priečinky so stromovou štruktúrou a drag & drop'))),
        li(p(t('Fulltextové vyhľadávanie dokumentov (SQLite FTS)'))),
        li(p(t('Obľúbené, kôš a nedávne dokumenty'))),
        li(p(t('Presun dokumentu do priečinka z menu súboru'))),
      ),

      h(2, '14. Šablóny a vlastné šablóny'),
      p(
        t('⌘N otvorí výber šablón: report, list, životopis, faktúra, esej a ďalšie. Vlastnú šablónu uložíte z aktuálneho dokumentu cez menu súboru. Tento sprievodca je dostupný aj ako šablóna '),
        t('Sprievodca Scribe', [{ type: 'bold' }]),
        t('.'),
      ),

      h(2, '15. Ukladanie, verzie a synchronizácia'),
      bullet(
        li(p(t('Auto-save do SQLite (~600 ms po zmene)'))),
        li(p(t('Záloha .scribe súborov na disk (Nastavenia → Úložisko)'))),
        li(p(t('História verzií s porovnaním diff v paneli História'))),
        li(p(t('Ak disk zlyhá, dokument zostane uložený v aplikácii'))),
      ),

      h(2, '16. Export a tlač'),
      p(
        t('Exportujte do PDF, DOCX, Markdown, TXT alebo Pages. Náhľad tlače, rozloženie strán, hlavičky/päty a vodotlač nastavíte v menu dokumentu a dialógu Rozloženie strán.'),
      ),

      h(2, '17. Režimy a panely'),
      bullet(
        li(p(t('Markdown zdroj — prepnite v headeri editora'))),
        li(p(t('Režim sústredenia — skryje rozptyľujúce prvky (⌘⇧F)'))),
        li(p(t('Štatistika — počet slov a znakov'))),
        li(p(t('Odkazy sem — dokumenty, ktoré odkazujú na tento'))),
        li(p(t('Nájsť a nahradiť — lupa v paneli, zatvorte Esc alebo opätovným klikom'))),
      ),

      h(2, '18. Nastavenia aplikácie'),
      bullet(
        li(p(t('Vzhľad — témy, vlastné farby, jazyk SK/EN'))),
        li(p(t('Úložisko — priečinok .scribe, synchronizácia s diskom'))),
        li(p(t('Skratky — kompletný zoznam v nastaveniach'))),
      ),

      callout(
        'info',
        p(
          t('Scribe beží '),
          t('lokálne na Macu', [{ type: 'bold' }]),
          t(' — bez cloudu a účtov. Dokumenty patria vášmu macOS používateľovi. Upravte tento dokument, pridajte vlastné sekcie alebo ho zduplikujte ako výchozí šablónu pre váš tím.'),
        ),
      ),
      hr(),
      p(t('— Koniec sprievodcu. Prajeme príjemné písanie!')),
    ],
  }
}

export function serializeScribeDemoContent(wikiTargetId: string | null = null): string {
  return JSON.stringify(buildScribeDemoContent(wikiTargetId))
}

export const SCRIBE_DEMO_GUIDE_TEMPLATE: {
  id: string
  name: string
  description: string
  category: TemplateCategoryId
  title: string
  content: JSONContent
} = {
  id: 'scribe-demo-guide',
  name: 'Sprievodca Scribe',
  description: 'Kompletné demo všetkých funkcií aplikácie s príkladmi',
  category: 'general',
  title: 'Sprievodca Scribe — demo',
  content: buildScribeDemoContent(),
}
