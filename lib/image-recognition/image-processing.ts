import { createHash } from "node:crypto"
import sharp from "sharp"

import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/image-recognition/constants"
import type { AcceptedImageType, ProcessedImage } from "@/lib/image-recognition/types"

const acceptedImageTypes = new Set<string>(ACCEPTED_IMAGE_TYPES)

export async function processImageFile(file: File, label: string): Promise<ProcessedImage> {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error(`${label} image is required.`)
  }

  if (!acceptedImageTypes.has(file.type)) {
    throw new Error(`${label} image must be a JPEG, PNG, or WebP file.`)
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`${label} image must be smaller than 10 MB.`)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const image = sharp(buffer, { failOn: "error" }).rotate()
  const metadata = await image.metadata()

  if (!metadata.width || !metadata.height) {
    throw new Error(`${label} image dimensions could not be read.`)
  }

  return {
    fileName: file.name,
    buffer,
    checksum: createHash("sha256").update(buffer).digest("hex"),
    mimeType: file.type as AcceptedImageType,
    byteSize: file.size,
    width: metadata.width,
    height: metadata.height,
  }
}

export function parseTags(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") {
    return []
  }

  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag, index, tags) => tag.length > 0 && tags.indexOf(tag) === index)
    .slice(0, 12)
}
