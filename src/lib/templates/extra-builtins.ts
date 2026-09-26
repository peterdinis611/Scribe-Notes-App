import type { JSONContent } from '@tiptap/core'
import type { TemplateCategoryId } from '@/lib/templates/categories'

type ExtraTemplate = {
  id: string
  name: string
  description: string
  category: TemplateCategoryId
  title: string
  content: JSONContent
}

type Node = NonNullable<JSONContent['content']>[number]

function h1(text: string): Node {
  return { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text }] }
}

function h2(text: string): Node {
  return { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] }
}

function p(text: string): Node {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

function bullets(...items: string[]): Node {
  return {
    type: 'bulletList',
    content: items.map((text) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })),
  }
}

function numbered(...items: string[]): Node {
  return {
    type: 'orderedList',
    content: items.map((text) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })),
  }
}

function tasks(...items: string[]): Node {
  return {
    type: 'taskList',
    content: items.map((text) => ({
      type: 'taskItem',
      attrs: { checked: false },
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })),
  }
}

function doc(...content: Node[]): JSONContent {
  return { type: 'doc', content }
}

function tpl(
  id: string,
  name: string,
  description: string,
  category: TemplateCategoryId,
  title: string,
  content: JSONContent,
): ExtraTemplate {
  return { id, name, description, category, title, content }
}

/** Extra built-in templates (kept separate so index.ts stays readable). */
export const EXTRA_DOCUMENT_TEMPLATES: ExtraTemplate[] = [
  tpl(
    'daily-journal',
    'Denný denník',
    'Ranné zámery, poznámky a večerná reflexia',
    'personal',
    'Denník',
    doc(
      h1('Denný denník'),
      p('Dátum · Nálada · Energia'),
      h2('Zámery dňa'),
      bullets('Zámer 1', 'Zámer 2', 'Zámer 3'),
      h2('Poznámky'),
      p('Čo sa dialo, čo som sa naučil/a…'),
      h2('Vďačnosť'),
      bullets('…', '…', '…'),
      h2('Večerná reflexia'),
      p('Čo vyšlo dobre? Čo by som urobil/a inak?'),
      h2('Úlohy na zajtra'),
      tasks('Úloha 1', 'Úloha 2'),
    ),
  ),
  tpl(
    'weekly-review',
    'Týždenný prehľad',
    'Výhry, blokery a plán na ďalší týždeň',
    'personal',
    'Týždenný prehľad',
    doc(
      h1('Týždenný prehľad'),
      p('Týždeň od … do …'),
      h2('Výhry'),
      bullets('…'),
      h2('Čo nevyšlo / blokery'),
      bullets('…'),
      h2('Poučenia'),
      p('Jedna vec, ktorú si odnášam…'),
      h2('Priority na budúci týždeň'),
      numbered('Priorita 1', 'Priorita 2', 'Priorita 3'),
      h2('Checklist'),
      tasks('Vyčistiť inbox', 'Aktualizovať plán', 'Naplánovať 1 deep-work blok'),
    ),
  ),
  tpl(
    'brainstorm',
    'Brainstorm',
    'Voľné nápady, zhluky a ďalšie kroky',
    'creative',
    'Brainstorm',
    doc(
      h1('Brainstorm'),
      p('Téma · Dátum · Cieľ'),
      h2('Prompt / otázka'),
      p('Čo skúšame vyriešiť?'),
      h2('Voľné nápady'),
      bullets('Nápad…', 'Nápad…', 'Nápad…'),
      h2('Zhluky / témy'),
      bullets('Téma A', 'Téma B'),
      h2('Top 3 na rozpracovanie'),
      numbered('…', '…', '…'),
      h2('Ďalšie kroky'),
      tasks('Overiť predpoklad', 'Urobiť rýchly prototyp'),
    ),
  ),
  tpl(
    'book-notes',
    'Poznámky z knihy',
    'Citáty, myšlienky a akčné body z čítania',
    'personal',
    'Poznámky z knihy',
    doc(
      h1('Poznámky z knihy'),
      p('Autor · Názov · Rok'),
      h2('Prečo čítam'),
      p('Čo chcem získať…'),
      h2('Kľúčové myšlienky'),
      bullets('…'),
      h2('Citáty'),
      p('„…“ — s. X'),
      h2('Otázky / pochybnosti'),
      bullets('…'),
      h2('Ako to použijem'),
      tasks('Aplikovať v…', 'Prepojiť s poznámkou [[…]]'),
    ),
  ),
  tpl(
    'decision-log',
    'Rozhodovací denník',
    'Možnosti, kritériá a zvolená cesta',
    'business',
    'Rozhodnutie',
    doc(
      h1('Rozhodnutie'),
      p('Dátum · Kontext · Vlastník'),
      h2('Otázka'),
      p('Čo rozhodujeme?'),
      h2('Možnosti'),
      numbered('Možnosť A', 'Možnosť B', 'Možnosť C'),
      h2('Kritériá'),
      bullets('Náklady', 'Riziko', 'Dopad', 'Čas'),
      h2('Rozhodnutie'),
      p('Volíme … pretože …'),
      h2('Následné kroky'),
      tasks('Komunikovať rozhodnutie', 'Nastaviť review dátum'),
    ),
  ),
  tpl(
    'standup',
    'Stand-up / denný sync',
    'Včera, dnes, blokery',
    'business',
    'Stand-up',
    doc(
      h1('Stand-up'),
      p('Dátum · Tím'),
      h2('Včera'),
      bullets('…'),
      h2('Dnes'),
      bullets('…'),
      h2('Blokery'),
      bullets('Žiadne / …'),
      h2('Pomoc potrebná'),
      p('…'),
    ),
  ),
  tpl(
    'research-notes',
    'Výskumné poznámky',
    'Otázka, zdroje, zistenia a záver',
    'general',
    'Výskum',
    doc(
      h1('Výskumné poznámky'),
      p('Téma · Dátum'),
      h2('Výskumná otázka'),
      p('…'),
      h2('Hypotézy'),
      bullets('…'),
      h2('Zdroje'),
      bullets('Zdroj 1 — URL / kniha', 'Zdroj 2'),
      h2('Zistenia'),
      numbered('…', '…'),
      h2('Otvorené otázky'),
      bullets('…'),
      h2('Záver / ďalší krok'),
      p('…'),
    ),
  ),
  tpl(
    'product-spec',
    'Produktová špecifikácia',
    'Problém, používateľ, požiadavky a míľniky',
    'business',
    'Špecifikácia',
    doc(
      h1('Produktová špecifikácia'),
      p('Produkt · Verzia · Autor · Dátum'),
      h2('Problém'),
      p('Pre koho a prečo…'),
      h2('Cieľový používateľ'),
      bullets('Persona…'),
      h2('Ciele'),
      numbered('Cieľ 1', 'Cieľ 2'),
      h2('Požiadavky'),
      bullets('Musí…', 'Mal by…', 'Nice to have…'),
      h2('Mimo rozsahu'),
      bullets('…'),
      h2('Míľniky'),
      tasks('Návrh', 'MVP', 'Launch'),
      h2('Úspech meriame'),
      bullets('Metrika…'),
    ),
  ),
  tpl(
    'lesson-plan',
    'Plán hodiny',
    'Ciele, aktivity a hodnotenie výučby',
    'general',
    'Plán hodiny',
    doc(
      h1('Plán hodiny'),
      p('Predmet · Trieda · Dátum · Dĺžka'),
      h2('Cieľ hodiny'),
      p('Žiak vie / dokáže…'),
      h2('Pomôcky'),
      bullets('…'),
      h2('Priebeh'),
      numbered('Úvod (5 min)', 'Hlavná aktivita', 'Zhrnutie'),
      h2('Differenciácia'),
      p('Podpora / výzva pre…'),
      h2('Hodnotenie'),
      bullets('…'),
      h2('Domáca úloha'),
      p('…'),
    ),
  ),
  tpl(
    'interview-notes',
    'Poznámky z pohovoru',
    'Kandidát, otázky, hodnotenie a rozhodnutie',
    'business',
    'Pohovor',
    doc(
      h1('Poznámky z pohovoru'),
      p('Kandidát · Rola · Dátum · Interviewer'),
      h2('Kontext'),
      p('Prečo hovoríme…'),
      h2('Otázky a odpovede'),
      numbered('Otázka → odpoveď', '…'),
      h2('Silné stránky'),
      bullets('…'),
      h2('Riziká / medzery'),
      bullets('…'),
      h2('Hodnotenie (1–5)'),
      p('Skúsenosť · Kultúra · Komunikácia · Celkom'),
      h2('Rozhodnutie'),
      p('Áno / Nie / Ďalšie kolo — dôvod…'),
      h2('Ďalšie kroky'),
      tasks('Spätná väzba kandidátovi', 'Zdieľať s tímom'),
    ),
  ),
  tpl(
    'travel-plan',
    'Cestovný plán',
    'Itinerár, ubytovanie a checklist pred odchodom',
    'personal',
    'Cesta',
    doc(
      h1('Cestovný plán'),
      p('Cieľ · Dátumy · Spolucestujúci'),
      h2('Itinerár'),
      numbered('Deň 1 — …', 'Deň 2 — …'),
      h2('Ubytovanie / doprava'),
      bullets('Hotel…', 'Let / vlak…'),
      h2('Rozpočet'),
      p('Odhad…'),
      h2('Pred odchodom'),
      tasks('Doklady', 'Balenie', 'Poistenie', 'Offline mapy'),
      h2('Poznámky'),
      p('…'),
    ),
  ),
  tpl(
    'recipe',
    'Recept',
    'Ingrediencie, postup a tipy',
    'creative',
    'Recept',
    doc(
      h1('Názov receptu'),
      p('Porcie · Čas · Obtížnosť'),
      h2('Ingrediencie'),
      bullets('…'),
      h2('Postup'),
      numbered('Krok 1', 'Krok 2', 'Krok 3'),
      h2('Tipy'),
      bullets('…'),
      h2('Variácie'),
      p('…'),
    ),
  ),
  tpl(
    'bug-report',
    'Bug report',
    'Reprodukcia, očakávanie a prostredie',
    'general',
    'Bug report',
    doc(
      h1('Bug report'),
      p('ID / ticket · Dátum · Reportér'),
      h2('Zhrnutie'),
      p('Jedna veta…'),
      h2('Kroky na reprodukciu'),
      numbered('…', '…', '…'),
      h2('Očakávané správanie'),
      p('…'),
      h2('Skutočné správanie'),
      p('…'),
      h2('Prostredie'),
      bullets('OS / app verzia', 'Účet / dáta'),
      h2('Prílohy'),
      p('Screenshot / log…'),
      h2('Severity'),
      p('Blocker / High / Medium / Low'),
    ),
  ),
  tpl(
    'creative-brief',
    'Kreatívny brief',
    'Cieľ, publikum, tón a deliverables',
    'creative',
    'Brief',
    doc(
      h1('Kreatívny brief'),
      p('Projekt · Klient · Deadline'),
      h2('Cieľ'),
      p('Čo má kampaň / dielo dosiahnuť…'),
      h2('Publikum'),
      bullets('…'),
      h2('Kľúčová správa'),
      p('…'),
      h2('Tón a vizuál'),
      bullets('Tón…', 'Referencie…'),
      h2('Deliverables'),
      numbered('…'),
      h2('Obmedzenia'),
      bullets('Rozpočet', 'Značka', 'Formát'),
      h2('Úspech'),
      p('Ako spoznáme, že to vyšlo…'),
    ),
  ),
  tpl(
    'one-on-one',
    '1:1 poznámky',
    'Agenda, spätná väzba a follow-upy',
    'business',
    '1:1',
    doc(
      h1('1:1'),
      p('S kým · Dátum · Frekvencia'),
      h2('Agenda'),
      bullets('…'),
      h2('Ako sa darí'),
      p('…'),
      h2('Spätná väzba'),
      bullets('Od manažéra…', 'Od člena tímu…'),
      h2('Kariéra / rast'),
      p('…'),
      h2('Follow-upy'),
      tasks('…'),
    ),
  ),
  tpl(
    'changelog',
    'Changelog',
    'Verzia, zmeny a známe problémy',
    'general',
    'Changelog',
    doc(
      h1('Changelog'),
      p('Produkt · Verzia · Dátum'),
      h2('Novinky'),
      bullets('…'),
      h2('Vylepšenia'),
      bullets('…'),
      h2('Opravy'),
      bullets('…'),
      h2('Breaking changes'),
      bullets('Žiadne / …'),
      h2('Známe problémy'),
      bullets('…'),
    ),
  ),
]
