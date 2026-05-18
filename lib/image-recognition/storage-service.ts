import { v2 as cloudinary, type UploadApiResponse } from "cloudinary"

import { IMAGE_STORAGE_PROVIDER } from "@/lib/image-recognition/constants"
import type { ImageAssetKind, ProcessedImage, StoredImage } from "@/lib/image-recognition/types"

let isCloudinaryConfigured = false

function configureCloudinary() {
  if (isCloudinaryConfigured) {
    return
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.")
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  })

  isCloudinaryConfigured = true
}

function uploadBuffer(buffer: Buffer, publicId: string): Promise<UploadApiResponse> {
  configureCloudinary()

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: process.env.CLOUDINARY_FOLDER ?? "dentist-image-reco",
        public_id: publicId,
        resource_type: "image",
        overwrite: true,
        unique_filename: false,
        invalidate: true,
      },
      (error, result) => {
        if (error) {
          reject(error)
          return
        }

        if (!result) {
          reject(new Error("Cloudinary upload returned no result."))
          return
        }

        resolve(result)
      }
    )

    stream.end(buffer)
  })
}

export async function storeImageAsset({
  image,
  kind,
  pairId,
}: {
  image: ProcessedImage
  kind: ImageAssetKind
  pairId: string
}): Promise<StoredImage> {
  const result = await uploadBuffer(image.buffer, `${pairId}/${kind}-${image.checksum.slice(0, 16)}`)

  return {
    provider: IMAGE_STORAGE_PROVIDER.cloudinary,
    storageKey: result.public_id,
    url: result.secure_url,
    secureUrl: result.secure_url,
  }
}
