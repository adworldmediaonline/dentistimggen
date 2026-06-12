export const IMAGE_ASSET_KIND = {
  before: "before",
  after: "after",
} as const

export const IMAGE_PAIR_STATUS = {
  processing: "processing",
  ready: "ready",
  failed: "failed",
  archived: "archived",
} as const

export const IMAGE_MATCH_STATUS = {
  matched: "matched",
  noConfidentMatch: "no_confident_match",
  wrongImageType: "wrong_image_type",
  failed: "failed",
} as const

export const IMAGE_STORAGE_PROVIDER = {
  cloudinary: "cloudinary",
} as const

export const EMBEDDING_MODEL = {
  geminiEmbedding2: "gemini-embedding-2",
} as const

export const EMBEDDING_DIMENSION = 768
export const IMAGE_MATCH_CONFIDENCE_THRESHOLD = 0.72
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
