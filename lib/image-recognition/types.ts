import type { ACCEPTED_IMAGE_TYPES, IMAGE_ASSET_KIND } from "@/lib/image-recognition/constants"

export type ImageAssetKind = (typeof IMAGE_ASSET_KIND)[keyof typeof IMAGE_ASSET_KIND]
export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number]

export interface ProcessedImage {
  fileName: string
  buffer: Buffer
  checksum: string
  mimeType: AcceptedImageType
  byteSize: number
  width: number
  height: number
}

export interface StoredImage {
  provider: string
  storageKey: string
  url: string
  secureUrl?: string
}

export interface ActionResult {
  ok: boolean
  message: string
}

export interface MatchCandidate {
  pairId: string
  title: string
  notes: string | null
  tags: string[]
  score: number
  beforeAsset: {
    url: string
    width: number
    height: number
  }
  afterAsset: {
    url: string
    width: number
    height: number
  } | null
}

export interface MatchResult extends ActionResult {
  candidate?: MatchCandidate
  alternatives?: MatchCandidate[]
}
