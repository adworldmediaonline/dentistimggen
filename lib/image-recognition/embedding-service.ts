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

export function assertEmbedding(vector: number[]): number[] {
  if (vector.length !== EMBEDDING_DIMENSION) {
    throw new Error(`Expected ${EMBEDDING_DIMENSION} embedding values, received ${vector.length}.`)
  }
  return vector
}

/**
 * Cosine similarity for two equal-length vectors. The stored embeddings are
 * already L2-normalized in generateImageEmbedding(), so this is effectively a
 * dot product, but we normalize defensively to stay correct for any input.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}
