"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"

import {
  EMBEDDING_DIMENSION,
  IMAGE_ASSET_KIND,
  IMAGE_MATCH_CONFIDENCE_THRESHOLD,
  IMAGE_MATCH_STATUS,
  IMAGE_PAIR_STATUS,
} from "@/lib/image-recognition/constants"
import { assertEmbedding, generateImageEmbedding } from "@/lib/image-recognition/embedding-service"
import { parseTags, processImageFile } from "@/lib/image-recognition/image-processing"
import { findClosestAfterImages, findClosestBeforeImages } from "@/lib/image-recognition/match-search"
import { storeImageAsset } from "@/lib/image-recognition/storage-service"
import type { ActionResult, MatchResult, ProcessedImage } from "@/lib/image-recognition/types"
import { requireAdminUserId } from "@/lib/auth"
import { collections, ensureIndexes, type ImageAssetDoc } from "@/lib/mongodb"

function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function getImageFile(formData: FormData, key: string) {
  const value = formData.get(key)

  if (!(value instanceof File)) {
    throw new Error(`${key} is required.`)
  }

  return value
}

async function createImageAsset({
  image,
  kind,
  pairId,
}: {
  image: ProcessedImage
  kind: typeof IMAGE_ASSET_KIND.before | typeof IMAGE_ASSET_KIND.after
  pairId: string
}): Promise<ImageAssetDoc> {
  const storedImage = await storeImageAsset({ image, kind, pairId })
  const { imageAssets } = await collections()
  const now = new Date()

  const doc: ImageAssetDoc = {
    _id: randomUUID(),
    pairId,
    kind,
    storageProvider: storedImage.provider,
    storageKey: storedImage.storageKey,
    url: storedImage.url,
    secureUrl: storedImage.secureUrl ?? null,
    checksum: image.checksum,
    mimeType: image.mimeType,
    byteSize: image.byteSize,
    width: image.width,
    height: image.height,
    createdAt: now,
    updatedAt: now,
  }

  await imageAssets.insertOne(doc)
  return doc
}

async function insertImageEmbedding({
  pairId,
  assetId,
  buffer,
}: {
  pairId: string
  assetId: string
  buffer: Buffer
}) {
  const embedding = await generateImageEmbedding(buffer)
  const vector = assertEmbedding(embedding.vector)
  const { imageEmbeddings } = await collections()
  const now = new Date()

  await imageEmbeddings.insertOne({
    _id: randomUUID(),
    pairId,
    assetId,
    model: embedding.model,
    dimension: EMBEDDING_DIMENSION,
    status: "ready",
    embedding: vector,
    error: null,
    createdAt: now,
    updatedAt: now,
  })
}

async function setPairStatus(pairId: string, status: string) {
  const { imagePairs } = await collections()
  await imagePairs.updateOne({ _id: pairId }, { $set: { status, updatedAt: new Date() } })
}

export async function createImagePair(_previousState: ActionResult, formData: FormData): Promise<ActionResult> {
  let pairId: string | null = null

  try {
    await ensureIndexes()
    const createdById = await requireAdminUserId()
    const title = getStringValue(formData, "title")
    const notes = getStringValue(formData, "notes")
    const tags = parseTags(formData.get("tags"))

    if (title.length < 3) {
      return { ok: false, message: "Add a title with at least 3 characters." }
    }

    const beforeImage = await processImageFile(getImageFile(formData, "beforeImage"), "Before")
    const afterImage = await processImageFile(getImageFile(formData, "afterImage"), "After")

    const { imagePairs, imageAssets } = await collections()

    // Reject duplicate active before images by checksum.
    const dupAssets = await imageAssets
      .find({ kind: IMAGE_ASSET_KIND.before, checksum: beforeImage.checksum })
      .toArray()

    for (const asset of dupAssets) {
      const pair = await imagePairs.findOne({ _id: asset.pairId })
      if (pair && pair.status !== IMAGE_PAIR_STATUS.archived) {
        return { ok: false, message: `This before image already exists in "${pair.title}".` }
      }
    }

    const now = new Date()
    const newPairId = randomUUID()
    await imagePairs.insertOne({
      _id: newPairId,
      title,
      notes: notes.length > 0 ? notes : null,
      tags,
      status: IMAGE_PAIR_STATUS.processing,
      createdById,
      createdAt: now,
      updatedAt: now,
    })
    pairId = newPairId

    const beforeAsset = await createImageAsset({
      image: beforeImage,
      kind: IMAGE_ASSET_KIND.before,
      pairId: newPairId,
    })

    const afterAsset = await createImageAsset({
      image: afterImage,
      kind: IMAGE_ASSET_KIND.after,
      pairId: newPairId,
    })

    await insertImageEmbedding({ pairId: newPairId, assetId: beforeAsset._id, buffer: beforeImage.buffer })
    await insertImageEmbedding({ pairId: newPairId, assetId: afterAsset._id, buffer: afterImage.buffer })

    await setPairStatus(newPairId, IMAGE_PAIR_STATUS.ready)

    revalidatePath("/dashboard")
    revalidatePath("/dashboard/image-pairs")
    revalidatePath("/dashboard/image-match")

    return { ok: true, message: "Before/after image pair uploaded and indexed." }
  } catch (error) {
    if (pairId) {
      await setPairStatus(pairId, IMAGE_PAIR_STATUS.failed)
    }

    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to upload this image pair.",
    }
  }
}

export async function backfillMissingEmbeddings(
  previousState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  void previousState
  void formData

  try {
    await ensureIndexes()
    await requireAdminUserId()

    const { imageAssets, imageEmbeddings, imagePairs } = await collections()

    // Candidate assets: before/after kind, on a non-archived pair.
    const activePairIds = (
      await imagePairs
        .find({ status: { $ne: IMAGE_PAIR_STATUS.archived } }, { projection: { _id: 1 } })
        .toArray()
    ).map((p) => p._id)

    const candidateAssets = await imageAssets
      .find({
        kind: { $in: [IMAGE_ASSET_KIND.before, IMAGE_ASSET_KIND.after] },
        pairId: { $in: activePairIds },
      })
      .limit(200)
      .toArray()

    const embeddedAssetIds = new Set(
      (
        await imageEmbeddings
          .find({ assetId: { $in: candidateAssets.map((a) => a._id) } }, { projection: { assetId: 1 } })
          .toArray()
      ).map((e) => e.assetId)
    )

    const missing = candidateAssets.filter((a) => !embeddedAssetIds.has(a._id)).slice(0, 50)

    let indexedCount = 0

    for (const asset of missing) {
      const response = await fetch(asset.url)

      if (!response.ok) {
        await setPairStatus(asset.pairId, IMAGE_PAIR_STATUS.failed)
        continue
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      await insertImageEmbedding({ pairId: asset.pairId, assetId: asset._id, buffer })
      await setPairStatus(asset.pairId, IMAGE_PAIR_STATUS.ready)
      indexedCount += 1
    }

    revalidatePath("/dashboard/image-pairs")
    revalidatePath("/dashboard/image-match")

    if (indexedCount === 0) {
      return { ok: true, message: "No missing embeddings found." }
    }

    return { ok: true, message: `Indexed ${indexedCount} image${indexedCount === 1 ? "" : "s"}.` }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to backfill embeddings.",
    }
  }
}

export async function archiveImagePair(formData: FormData): Promise<void> {
  await requireAdminUserId()
  const pairId = getStringValue(formData, "pairId")

  if (!pairId) {
    return
  }

  await setPairStatus(pairId, IMAGE_PAIR_STATUS.archived)

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/image-pairs")
  revalidatePath("/dashboard/image-match")
}

export async function findImageMatch(_previousState: MatchResult, formData: FormData): Promise<MatchResult> {
  try {
    await ensureIndexes()
    const requestedById = await requireAdminUserId()
    const queryImage = await processImageFile(getImageFile(formData, "queryImage"), "Query")
    const embedding = await generateImageEmbedding(queryImage.buffer)

    const [beforeCandidates, afterCandidates] = await Promise.all([
      findClosestBeforeImages(embedding.vector, 1),
      findClosestAfterImages(embedding.vector, 1),
    ])

    const candidate = beforeCandidates[0]
    const afterHit = afterCandidates[0]

    const { imageMatchLogs } = await collections()

    async function logMatch(input: {
      matchedPairId: string | null
      similarityScore: number | null
      status: string
    }) {
      await imageMatchLogs.insertOne({
        _id: randomUUID(),
        requestedById,
        matchedPairId: input.matchedPairId,
        queryChecksum: queryImage.checksum,
        queryMimeType: queryImage.mimeType,
        queryByteSize: queryImage.byteSize,
        similarityScore: input.similarityScore,
        status: input.status,
        createdAt: new Date(),
      })
    }

    const matchesAfterImage = Boolean(
      afterHit &&
        afterHit.score >= IMAGE_MATCH_CONFIDENCE_THRESHOLD &&
        (!candidate || afterHit.score >= candidate.score)
    )

    if (matchesAfterImage) {
      await logMatch({
        matchedPairId: null,
        similarityScore: afterHit?.score ?? null,
        status: IMAGE_MATCH_STATUS.wrongImageType,
      })

      return {
        ok: false,
        message: "No match found. Upload a before image, not an after image.",
        searched: true,
      }
    }

    const isConfidentMatch = Boolean(candidate && candidate.score >= IMAGE_MATCH_CONFIDENCE_THRESHOLD)

    await logMatch({
      matchedPairId: isConfidentMatch ? candidate?.pairId ?? null : null,
      similarityScore: candidate?.score ?? null,
      status: isConfidentMatch ? IMAGE_MATCH_STATUS.matched : IMAGE_MATCH_STATUS.noConfidentMatch,
    })

    if (!candidate) {
      return {
        ok: false,
        message: "No indexed before images are ready to search yet.",
        searched: true,
      }
    }

    if (!isConfidentMatch) {
      return {
        ok: false,
        message: "No match found.",
        searched: true,
      }
    }

    return {
      ok: true,
      message: "Match found.",
      candidate,
      searched: true,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to search for a matching image.",
      searched: true,
    }
  }
}
