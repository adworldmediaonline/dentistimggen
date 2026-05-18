import sharp from "sharp"

import { EMBEDDING_DIMENSION, EMBEDDING_MODEL } from "@/lib/image-recognition/constants"

export interface ImageEmbedding {
  model: string
  dimension: number
  vector: number[]
}

export async function generateImageEmbedding(buffer: Buffer): Promise<ImageEmbedding> {
  const pixels = await sharp(buffer)
    .rotate()
    .resize(8, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer()

  const values = Array.from(pixels, (value) => value / 255)
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  const centered = values.map((value) => value - mean)
  const magnitude = Math.sqrt(centered.reduce((total, value) => total + value * value, 0)) || 1
  const vector = centered.map((value) => value / magnitude)

  return {
    model: EMBEDDING_MODEL.localPerceptual,
    dimension: EMBEDDING_DIMENSION,
    vector,
  }
}

export function toPgVector(vector: number[]): string {
  if (vector.length !== EMBEDDING_DIMENSION) {
    throw new Error(`Expected ${EMBEDDING_DIMENSION} embedding values, received ${vector.length}.`)
  }

  return `[${vector.map((value) => value.toFixed(8)).join(",")}]`
}
