import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Model3d } from '@/lib/editor/model-3d-extension'
import { isModel3dFile } from '@/lib/editor/image-utils'

describe('isModel3dFile', () => {
  it('accepts glb / gltf / usdz by extension', () => {
    expect(isModel3dFile(new File(['x'], 'mesh.glb'))).toBe(true)
    expect(isModel3dFile(new File(['x'], 'mesh.gltf'))).toBe(true)
    expect(isModel3dFile(new File(['x'], 'mesh.usdz'))).toBe(true)
    expect(isModel3dFile(new File(['x'], 'photo.png'))).toBe(false)
  })

  it('accepts model MIME types', () => {
    expect(isModel3dFile(new File(['x'], 'a', { type: 'model/gltf-binary' }))).toBe(true)
  })
})

describe('Model3d TipTap node', () => {
  it('inserts an empty 3D block', () => {
    const editor = new Editor({
      extensions: [StarterKit, Model3d],
      content: '<p></p>',
    })
    editor.commands.insertModel3d({ src: null })
    let found = false
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'model3d') {
        found = true
        expect(node.attrs.src).toBeNull()
        expect(node.attrs.autoRotate).toBe(true)
        expect(node.attrs.cameraControls).toBe(true)
      }
    })
    expect(found).toBe(true)
    editor.destroy()
  })

  it('stores a src path on the node', () => {
    const editor = new Editor({
      extensions: [StarterKit, Model3d],
      content: '<p></p>',
    })
    editor.commands.insertModel3d({
      src: '/tmp/assets/doc/model.glb',
      width: '640px',
      align: 'left',
      autoRotate: false,
    })
    const node = editor.state.doc.content.content.find((n) => n.type.name === 'model3d')
    expect(node?.attrs.src).toBe('/tmp/assets/doc/model.glb')
    expect(node?.attrs.width).toBe('640px')
    expect(node?.attrs.align).toBe('left')
    expect(node?.attrs.autoRotate).toBe(false)
    editor.destroy()
  })
})
