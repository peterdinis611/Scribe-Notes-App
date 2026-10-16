import {
  createCanvasObject,
  emptyCanvasDocument,
  type CanvasDocument,
  type CanvasObject,
} from '@/lib/canvas/types'

export type CanvasTemplateId = 'blank' | 'brainstorm' | 'roadmap'

export const CANVAS_TEMPLATE_IDS: CanvasTemplateId[] = ['blank', 'brainstorm', 'roadmap']

function note(text: string, x: number, y: number, z: number): CanvasObject {
  const obj = createCanvasObject('note', { x: x + 100, y: y + 60 }, z)
  obj.x = x
  obj.y = y
  obj.text = text
  return obj
}

function frame(label: string, x: number, y: number, w: number, h: number, z: number): CanvasObject {
  const obj = createCanvasObject('frame', { x: x + w / 2, y: y + h / 2 }, z, { x, y, w, h })
  obj.label = label
  return obj
}

function title(text: string, x: number, y: number, z: number): CanvasObject {
  const obj = createCanvasObject('text', { x: x + 90, y: y + 24 }, z)
  obj.x = x
  obj.y = y
  obj.text = text
  obj.fontSize = 22
  return obj
}

export function buildCanvasTemplate(id: CanvasTemplateId): CanvasDocument {
  if (id === 'blank') return emptyCanvasDocument()

  if (id === 'brainstorm') {
    const objects: CanvasObject[] = [
      title('Brainstorm', 40, 24, 0),
      frame('Ideas', 40, 80, 420, 320, 1),
      note('Idea 1', 60, 120, 2),
      note('Idea 2', 280, 120, 3),
      note('Idea 3', 60, 260, 4),
      frame('Decide', 500, 80, 280, 320, 5),
      note('Next step…', 520, 140, 6),
    ]
    // Nest notes into Ideas frame via parentId (relative coords)
    const ideas = objects[1]!
    for (const child of [objects[2]!, objects[3]!, objects[4]!]) {
      child.parentId = ideas.id
      child.x = child.x - ideas.x
      child.y = child.y - ideas.y
    }
    const decide = objects[5]!
    objects[6]!.parentId = decide.id
    objects[6]!.x -= decide.x
    objects[6]!.y -= decide.y

    return {
      ...emptyCanvasDocument(),
      objects,
      cards: objects.filter((o) => o.kind === 'note').map((o) => ({
        id: o.id,
        x: o.x,
        y: o.y,
        w: o.w,
        h: o.h,
        text: o.text,
      })),
    }
  }

  // roadmap
  const objects: CanvasObject[] = [
    title('Roadmap', 40, 20, 0),
    frame('Now', 40, 80, 240, 280, 1),
    frame('Next', 320, 80, 240, 280, 2),
    frame('Later', 600, 80, 240, 280, 3),
    note('Ship…', 60, 130, 4),
    note('Explore…', 340, 130, 5),
    note('Dream…', 620, 130, 6),
  ]
  for (let i = 0; i < 3; i++) {
    const fr = objects[1 + i]!
    const n = objects[4 + i]!
    n.parentId = fr.id
    n.x -= fr.x
    n.y -= fr.y
  }

  return {
    ...emptyCanvasDocument(),
    objects,
    cards: objects
      .filter((o) => o.kind === 'note')
      .map((o) => ({
        id: o.id,
        x: o.x,
        y: o.y,
        w: o.w,
        h: o.h,
        text: o.text,
      })),
  }
}
