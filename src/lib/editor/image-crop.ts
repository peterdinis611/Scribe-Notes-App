import { centerCrop, makeAspectCrop, type Crop } from 'react-image-crop'

export type CropAspectId = 'free' | 'square' | 'photo' | 'wide'

export const CROP_ASPECTS: Array<{ id: CropAspectId; ratio?: number }> = [
  { id: 'free' },
  { id: 'square', ratio: 1 },
  { id: 'photo', ratio: 4 / 3 },
  { id: 'wide', ratio: 16 / 9 },
]

export function cropAspectRatio(id: CropAspectId): number | undefined {
  return CROP_ASPECTS.find((item) => item.id === id)?.ratio
}

export function initialPercentCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect?: number,
): Crop {
  if (aspect && aspect > 0) {
    return centerCrop(
      makeAspectCrop({ unit: '%', width: 84 }, aspect, mediaWidth, mediaHeight),
      mediaWidth,
      mediaHeight,
    )
  }

  return centerCrop({ unit: '%', width: 84, height: 84 }, mediaWidth, mediaHeight)
}
