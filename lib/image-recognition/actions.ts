"use server"

import { randomUUID } from "node:crypto"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"

import { Prisma } from "@/app/generated/prisma/client"
import {
  EMBEDDING_DIMENSION,
  IMAGE_ASSET_KIND,
  IMAGE_MATCH_CONFIDENCE_THRESHOLD,
  IMAGE_MATCH_STATUS,
  IMAGE_PAIR_STATUS,
} from "@/lib/image-recognition/constants"
import { generateImageEmbedding, toPgVector } from "@/lib/image-recognition/embedding-service"
import { parseTags, processImageFile } from "@/lib/image-recognition/image-processing"
import { findClosestBeforeImages } from "@/lib/image-recognition/match-search"
import { storeImageAsset } from "@/lib/image-recognition/storage-service"
import type { ActionResult, MatchResult, ProcessedImage } from "@/lib/image-recognition/types"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

async function requireAdminUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session || session.user.role !== "admin") {
    throw new Error("Only administrators can manage image recognition data.")
  }

  return session.user.id
}

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
}) {
  const storedImage = await storeImageAsset({ image, kind, pairId })

  return prisma.imageAsset.create({
    data: {
      pairId,
      kind,
      storageProvider: storedImage.provider,
      storageKey: storedImage.storageKey,
      url: storedImage.url,
      secureUrl: storedImage.secureUrl,
      checksum: image.checksum,
      mimeType: image.mimeType,
      byteSize: image.byteSize,
      width: image.width,
      height: image.height,
    },
  })
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
  const pgVector = toPgVector(embedding.vector)

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "imageEmbedding" (
      "id",
      "pairId",
      "assetId",
      "model",
      "dimension",
      "status",
      "embedding",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${randomUUID()},
      ${pairId},
      ${assetId},
      ${embedding.model},
      ${EMBEDDING_DIMENSION},
      'ready',
      ${Prisma.raw(`'${pgVector}'::vector`)},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `)
}

export async function createImagePair(_previousState: ActionResult, formData: FormData): Promise<ActionResult> {
  let pairId: string | null = null

  try {
    const createdById = await requireAdminUserId()
    const title = getStringValue(formData, "title")
    const notes = getStringValue(formData, "notes")
    const tags = parseTags(formData.get("tags"))

    if (title.length < 3) {
      return { ok: false, message: "Add a title with at least 3 characters." }
    }

    const beforeImage = await processImageFile(getImageFile(formData, "beforeImage"), "Before")
    const afterImage = await processImageFile(getImageFile(formData, "afterImage"), "After")

    const duplicateBefore = await prisma.imageAsset.findFirst({
      where: {
        kind: IMAGE_ASSET_KIND.before,
        checksum: beforeImage.checksum,
        pair: {
          status: {
            not: IMAGE_PAIR_STATUS.archived,
          },
        },
      },
      select: {
        pair: {
          select: {
            title: true,
          },
        },
      },
    })

    if (duplicateBefore) {
      return { ok: false, message: `This before image already exists in "${duplicateBefore.pair.title}".` }
    }

    const pair = await prisma.imagePair.create({
      data: {
        title,
        notes: notes.length > 0 ? notes : null,
        tags,
        status: IMAGE_PAIR_STATUS.processing,
        createdById,
      },
      select: {
        id: true,
      },
    })

    pairId = pair.id

    const beforeAsset = await createImageAsset({
      image: beforeImage,
      kind: IMAGE_ASSET_KIND.before,
      pairId: pair.id,
    })

    await createImageAsset({
      image: afterImage,
      kind: IMAGE_ASSET_KIND.after,
      pairId: pair.id,
    })

    await insertImageEmbedding({
      pairId: pair.id,
      assetId: beforeAsset.id,
      buffer: beforeImage.buffer,
    })

    await prisma.imagePair.update({
      where: { id: pair.id },
      data: { status: IMAGE_PAIR_STATUS.ready },
    })

    revalidatePath("/dashboard")
    revalidatePath("/dashboard/image-pairs")
    revalidatePath("/dashboard/image-match")

    return { ok: true, message: "Before/after image pair uploaded and indexed." }
  } catch (error) {
    if (pairId) {
      await prisma.imagePair.update({
        where: { id: pairId },
        data: { status: IMAGE_PAIR_STATUS.failed },
      })
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
    await requireAdminUserId()

    const pairs = await prisma.imagePair.findMany({
      where: {
        status: {
          not: IMAGE_PAIR_STATUS.archived,
        },
        embeddings: {
          none: {},
        },
        assets: {
          some: {
            kind: IMAGE_ASSET_KIND.before,
          },
        },
      },
      include: {
        assets: {
          where: {
            kind: IMAGE_ASSET_KIND.before,
          },
          take: 1,
        },
      },
      take: 25,
    })

    let indexedCount = 0

    for (const pair of pairs) {
      const beforeAsset = pair.assets[0]

      if (!beforeAsset) {
        continue
      }

      const response = await fetch(beforeAsset.url)

      if (!response.ok) {
        await prisma.imagePair.update({
          where: { id: pair.id },
          data: { status: IMAGE_PAIR_STATUS.failed },
        })
        continue
      }

      const buffer = Buffer.from(await response.arrayBuffer())

      await insertImageEmbedding({
        pairId: pair.id,
        assetId: beforeAsset.id,
        buffer,
      })

      await prisma.imagePair.update({
        where: { id: pair.id },
        data: { status: IMAGE_PAIR_STATUS.ready },
      })

      indexedCount += 1
    }

    revalidatePath("/dashboard/image-pairs")
    revalidatePath("/dashboard/image-match")

    if (indexedCount === 0) {
      return { ok: true, message: "No missing embeddings found." }
    }

    return { ok: true, message: `Indexed ${indexedCount} before image${indexedCount === 1 ? "" : "s"}.` }
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

  await prisma.imagePair.update({
    where: { id: pairId },
    data: { status: IMAGE_PAIR_STATUS.archived },
  })

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/image-pairs")
  revalidatePath("/dashboard/image-match")
}

export async function findImageMatch(_previousState: MatchResult, formData: FormData): Promise<MatchResult> {
  try {
    const requestedById = await requireAdminUserId()
    const queryImage = await processImageFile(getImageFile(formData, "queryImage"), "Query")
    const embedding = await generateImageEmbedding(queryImage.buffer)
    const candidates = await findClosestBeforeImages(embedding.vector, 1)
    const candidate = candidates[0]
    const isConfidentMatch = Boolean(candidate && candidate.score >= IMAGE_MATCH_CONFIDENCE_THRESHOLD)

    await prisma.imageMatchLog.create({
      data: {
        requestedById,
        matchedPairId: isConfidentMatch ? candidate?.pairId : null,
        queryChecksum: queryImage.checksum,
        queryMimeType: queryImage.mimeType,
        queryByteSize: queryImage.byteSize,
        similarityScore: candidate?.score,
        status: isConfidentMatch ? IMAGE_MATCH_STATUS.matched : IMAGE_MATCH_STATUS.noConfidentMatch,
      },
    })

    if (!candidate) {
      return {
        ok: false,
        message: "No indexed before images are ready to search yet.",
      }
    }

    if (!isConfidentMatch) {
      return {
        ok: false,
        message: "No confident match found. Review the closest result before using an after image.",
        candidate,
      }
    }

    return {
      ok: true,
      message: "Closest before image found.",
      candidate,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to search for a matching image.",
    }
  }
}
