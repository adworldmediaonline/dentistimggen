import { GoogleGenAI } from "@google/genai"
import * as z from "zod/v4"

import { EMBEDDING_DIMENSION, EMBEDDING_MODEL } from "@/lib/image-recognition/constants"

const geminiEmbeddingResponseSchema = z
  .object({
    embedding: z
      .object({
        values: z.array(z.number()),
      })
      .optional(),
    embeddings: z
      .array(
        z.object({
          values: z.array(z.number()),
        })
      )
      .optional(),
  })
  .transform((value) => value.embedding?.values ?? value.embeddings?.[0]?.values)
  .pipe(z.array(z.number()).length(EMBEDDING_DIMENSION))

let geminiClient: GoogleGenAI | null = null

export interface ImageEmbedding {
  model: string
  dimension: number
  vector: number[]
}

function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required to generate image embeddings.")
  }

  return apiKey
}

function getGeminiClient() {
  geminiClient ??= new GoogleGenAI({ apiKey: getGeminiApiKey() })
  return geminiClient
}

export async function generateImageEmbedding(buffer: Buffer, mimeType = "image/jpeg"): Promise<ImageEmbedding> {
  const response = await getGeminiClient().models.embedContent({
    model: EMBEDDING_MODEL.geminiEmbedding2,
    contents: [
      {
        inlineData: {
          mimeType,
          data: buffer.toString("base64"),
        },
      },
    ],
    config: {
      outputDimensionality: EMBEDDING_DIMENSION,
    },
  })

  const vector = geminiEmbeddingResponseSchema.parse(response)

  return {
    model: EMBEDDING_MODEL.geminiEmbedding2,
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
