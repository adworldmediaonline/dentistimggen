"use server";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";

import {
  imageAsset,
  imageEmbedding,
  imageMatchLog,
  imagePair,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  EMBEDDING_DIMENSION,
  IMAGE_ASSET_KIND,
  IMAGE_MATCH_CONFIDENCE_THRESHOLD,
  IMAGE_MATCH_STATUS,
  IMAGE_PAIR_STATUS,
} from "@/lib/image-recognition/constants";
import {
  generateImageEmbedding,
  toPgVector,
} from "@/lib/image-recognition/embedding-service";
import {
  parseTags,
  processImageFile,
} from "@/lib/image-recognition/image-processing";
import {
  findClosestAfterImages,
  findClosestBeforeImages,
} from "@/lib/image-recognition/match-search";
import { storeImageAsset } from "@/lib/image-recognition/storage-service";
import type {
  ActionResult,
  MatchResult,
  ProcessedImage,
} from "@/lib/image-recognition/types";

async function requireAdminUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== "admin") {
    throw new Error("Only administrators can manage image recognition data.");
  }

  return session.user.id;
}

function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getImageFile(formData: FormData, key: string) {
  const value = formData.get(key);

  if (!(value instanceof File)) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

async function createImageAsset({
  image,
  kind,
  pairId,
}: {
  image: ProcessedImage;
  kind: typeof IMAGE_ASSET_KIND.before | typeof IMAGE_ASSET_KIND.after;
  pairId: string;
}) {
  const storedImage = await storeImageAsset({ image, kind, pairId });
  const now = new Date();

  const [asset] = await db
    .insert(imageAsset)
    .values({
      id: randomUUID(),
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
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return asset;
}

async function insertImageEmbedding({
  pairId,
  assetId,
  buffer,
  mimeType,
}: {
  pairId: string;
  assetId: string;
  buffer: Buffer;
  mimeType: string;
}) {
  const embedding = await generateImageEmbedding(buffer, mimeType);
  const pgVector = toPgVector(embedding.vector);
  const now = new Date();

  await db.execute(sql`
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
      ${pgVector}::vector,
      ${now},
      ${now}
    )
  `);
}

export async function createImagePair(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const createdPairs: string[] = [];

  try {
    const createdById = await requireAdminUserId();
    const title = getStringValue(formData, "title");
    const notes = getStringValue(formData, "notes");
    const tags = parseTags(formData.get("tags"));

    // console.log("[createImagePair] FormData keys:", Array.from(formData.keys()))
    // console.log("[createImagePair] beforeImage raw values:", formData.getAll("beforeImage"))
    // console.log("[createImagePair] afterImage raw values:", formData.getAll("afterImage"))

    if (title.length < 3) {
      return { ok: false, message: "Add a title with at least 3 characters." };
    }

    const beforeFiles = formData
      .getAll("beforeImage")
      .filter((f) => f instanceof File && f.size > 0) as File[];
    const afterFiles = formData
      .getAll("afterImage")
      .filter((f) => f instanceof File && f.size > 0) as File[];

    if (beforeFiles.length === 0) {
      return { ok: false, message: "At least one before image is required." };
    }

    if (beforeFiles.length > 8) {
      return { ok: false, message: "You can upload a maximum of 8 images." };
    }

    if (beforeFiles.length !== afterFiles.length) {
      return {
        ok: false,
        message: `The number of after images (${afterFiles.length}) must match the number of before images (${beforeFiles.length}).`,
      };
    }

    const beforeImages = await Promise.all(
      beforeFiles.map((file, idx) =>
        processImageFile(file, `Before Image ${idx + 1}`),
      ),
    );
    const afterImages = await Promise.all(
      afterFiles.map((file, idx) =>
        processImageFile(file, `After Image ${idx + 1}`),
      ),
    );

    for (let i = 0; i < beforeImages.length; i++) {
      const beforeImage = beforeImages[i];
      const [duplicateBefore] = await db
        .select({
          title: imagePair.title,
        })
        .from(imageAsset)
        .innerJoin(imagePair, eq(imagePair.id, imageAsset.pairId))
        .where(
          and(
            eq(imageAsset.kind, IMAGE_ASSET_KIND.before),
            eq(imageAsset.checksum, beforeImage.checksum),
            ne(imagePair.status, IMAGE_PAIR_STATUS.archived),
          ),
        )
        .limit(1);

      if (duplicateBefore) {
        return {
          ok: false,
          message: `The before image at position ${i + 1} ("${beforeFiles[i].name}") already exists in "${duplicateBefore.title}".`,
        };
      }
    }

    for (let i = 0; i < beforeImages.length; i++) {
      const [pair] = await db
        .insert(imagePair)
        .values({
          id: randomUUID(),
          title:
            beforeFiles.length > 1
              ? `${title} (${i + 1}/${beforeFiles.length})`
              : title,
          notes: notes.length > 0 ? notes : null,
          tags,
          status: IMAGE_PAIR_STATUS.processing,
          createdById,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: imagePair.id });

      createdPairs.push(pair.id);

      const beforeAsset = await createImageAsset({
        image: beforeImages[i],
        kind: IMAGE_ASSET_KIND.before,
        pairId: pair.id,
      });

      const afterAsset = await createImageAsset({
        image: afterImages[i],
        kind: IMAGE_ASSET_KIND.after,
        pairId: pair.id,
      });

      await insertImageEmbedding({
        pairId: pair.id,
        assetId: beforeAsset.id,
        buffer: beforeImages[i].buffer,
        mimeType: beforeImages[i].mimeType,
      });

      await insertImageEmbedding({
        pairId: pair.id,
        assetId: afterAsset.id,
        buffer: afterImages[i].buffer,
        mimeType: afterImages[i].mimeType,
      });

      await db
        .update(imagePair)
        .set({ status: IMAGE_PAIR_STATUS.ready, updatedAt: new Date() })
        .where(eq(imagePair.id, pair.id));
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/image-pairs");
    revalidatePath("/dashboard/image-match");

    return {
      ok: true,
      message: `${beforeFiles.length} before/after image pair(s) uploaded and indexed.`,
    };
  } catch (error) {
    for (const id of createdPairs) {
      try {
        const [p] = await db
          .select({ status: imagePair.status })
          .from(imagePair)
          .where(eq(imagePair.id, id));
        if (p && p.status === IMAGE_PAIR_STATUS.processing) {
          await db
            .update(imagePair)
            .set({ status: IMAGE_PAIR_STATUS.failed, updatedAt: new Date() })
            .where(eq(imagePair.id, id));
        }
      } catch (dbErr) {
        console.error(`Failed to mark pair ${id} as failed:`, dbErr);
      }
    }

    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to upload this image pair.",
    };
  }
}

export async function backfillMissingEmbeddings(
  previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  void previousState;
  void formData;

  try {
    await requireAdminUserId();

    const assets = await db
      .select({
        id: imageAsset.id,
        pairId: imageAsset.pairId,
        url: imageAsset.url,
        mimeType: imageAsset.mimeType,
      })
      .from(imageAsset)
      .innerJoin(imagePair, eq(imagePair.id, imageAsset.pairId))
      .leftJoin(imageEmbedding, eq(imageEmbedding.assetId, imageAsset.id))
      .where(
        and(
          inArray(imageAsset.kind, [
            IMAGE_ASSET_KIND.before,
            IMAGE_ASSET_KIND.after,
          ]),
          isNull(imageEmbedding.id),
          ne(imagePair.status, IMAGE_PAIR_STATUS.archived),
        ),
      )
      .limit(50);

    let indexedCount = 0;

    for (const asset of assets) {
      const response = await fetch(asset.url);

      if (!response.ok) {
        await db
          .update(imagePair)
          .set({ status: IMAGE_PAIR_STATUS.failed, updatedAt: new Date() })
          .where(eq(imagePair.id, asset.pairId));
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      await insertImageEmbedding({
        pairId: asset.pairId,
        assetId: asset.id,
        buffer,
        mimeType: asset.mimeType,
      });

      await db
        .update(imagePair)
        .set({ status: IMAGE_PAIR_STATUS.ready, updatedAt: new Date() })
        .where(eq(imagePair.id, asset.pairId));

      indexedCount += 1;
    }

    revalidatePath("/dashboard/image-pairs");
    revalidatePath("/dashboard/image-match");

    if (indexedCount === 0) {
      return { ok: true, message: "No missing embeddings found." };
    }

    return {
      ok: true,
      message: `Indexed ${indexedCount} image${indexedCount === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to backfill embeddings.",
    };
  }
}

export async function archiveImagePair(formData: FormData): Promise<void> {
  await requireAdminUserId();
  const pairId = getStringValue(formData, "pairId");

  if (!pairId) {
    return;
  }

  await db
    .update(imagePair)
    .set({ status: IMAGE_PAIR_STATUS.archived, updatedAt: new Date() })
    .where(eq(imagePair.id, pairId));

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/image-pairs");
  revalidatePath("/dashboard/image-match");
}

export async function findImageMatch(
  _previousState: MatchResult,
  formData: FormData,
): Promise<MatchResult> {
  try {
    const requestedById = await requireAdminUserId();
    const queryImage = await processImageFile(
      getImageFile(formData, "queryImage"),
      "Query",
    );
    const embedding = await generateImageEmbedding(
      queryImage.buffer,
      queryImage.mimeType,
    );

    const [beforeCandidates, afterCandidates] = await Promise.all([
      findClosestBeforeImages(embedding.vector, 1),
      findClosestAfterImages(embedding.vector, 1),
    ]);

    const candidate = beforeCandidates[0];
    const afterHit = afterCandidates[0];

    const matchesAfterImage = Boolean(
      afterHit &&
      afterHit.score >= IMAGE_MATCH_CONFIDENCE_THRESHOLD &&
      (!candidate || afterHit.score >= candidate.score),
    );

    if (matchesAfterImage) {
      await db.insert(imageMatchLog).values({
        id: randomUUID(),
        requestedById,
        matchedPairId: null,
        queryChecksum: queryImage.checksum,
        queryMimeType: queryImage.mimeType,
        queryByteSize: queryImage.byteSize,
        similarityScore: afterHit?.score,
        status: IMAGE_MATCH_STATUS.wrongImageType,
        createdAt: new Date(),
      });

      return {
        ok: false,
        message: "No match found. Upload a before image, not an after image.",
        searched: true,
      };
    }

    const isConfidentMatch = Boolean(
      candidate && candidate.score >= IMAGE_MATCH_CONFIDENCE_THRESHOLD,
    );

    await db.insert(imageMatchLog).values({
      id: randomUUID(),
      requestedById,
      matchedPairId: isConfidentMatch ? candidate?.pairId : null,
      queryChecksum: queryImage.checksum,
      queryMimeType: queryImage.mimeType,
      queryByteSize: queryImage.byteSize,
      similarityScore: candidate?.score,
      status: isConfidentMatch
        ? IMAGE_MATCH_STATUS.matched
        : IMAGE_MATCH_STATUS.noConfidentMatch,
      createdAt: new Date(),
    });

    if (!candidate) {
      return {
        ok: false,
        message: "No indexed before images are ready to search yet.",
        searched: true,
      };
    }

    if (!isConfidentMatch) {
      return {
        ok: false,
        message: "No match found.",
        searched: true,
      };
    }

    return {
      ok: true,
      message: "Match found.",
      candidate,
      searched: true,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to search for a matching image.",
      searched: true,
    };
  }
}
