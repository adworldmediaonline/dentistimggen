import { sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { IMAGE_PAIR_STATUS } from "@/lib/image-recognition/constants"
import { toPgVector } from "@/lib/image-recognition/embedding-service"
import type { AfterMatchHit, MatchCandidate } from "@/lib/image-recognition/types"

interface MatchRow extends Record<string, unknown> {
  pairId: string
  title: string
  notes: string | null
  tags: string[]
  score: number
  beforeUrl: string
  beforeWidth: number
  beforeHeight: number
  afterUrl: string | null
  afterWidth: number | null
  afterHeight: number | null
}

export async function findClosestBeforeImages(vector: number[], limit = 3): Promise<MatchCandidate[]> {
  const pgVector = toPgVector(vector)

  const result = await db.execute<MatchRow>(sql`
    SELECT
      p.id AS "pairId",
      p.title,
      p.notes,
      p.tags,
      1 - (e.embedding <=> ${pgVector}::vector) AS score,
      before_asset.url AS "beforeUrl",
      before_asset.width AS "beforeWidth",
      before_asset.height AS "beforeHeight",
      after_asset.url AS "afterUrl",
      after_asset.width AS "afterWidth",
      after_asset.height AS "afterHeight"
    FROM "imageEmbedding" e
    INNER JOIN "imagePair" p ON p.id = e."pairId"
    INNER JOIN "imageAsset" before_asset ON before_asset.id = e."assetId"
    LEFT JOIN "imageAsset" after_asset ON after_asset."pairId" = p.id AND after_asset.kind = 'after'
    WHERE p.status = ${IMAGE_PAIR_STATUS.ready}
      AND e.status = 'ready'
      AND before_asset.kind = 'before'
    ORDER BY e.embedding <=> ${pgVector}::vector
    LIMIT ${limit}
  `)

  return result.rows.map((row) => ({
    pairId: row.pairId,
    title: row.title,
    notes: row.notes,
    tags: row.tags,
    score: Number(row.score),
    beforeAsset: {
      url: row.beforeUrl,
      width: row.beforeWidth,
      height: row.beforeHeight,
    },
    afterAsset: row.afterUrl
      ? {
          url: row.afterUrl,
          width: row.afterWidth ?? 0,
          height: row.afterHeight ?? 0,
        }
      : null,
  }))
}

interface AfterMatchRow extends Record<string, unknown> {
  pairId: string
  title: string
  score: number
}

export async function findClosestAfterImages(vector: number[], limit = 1): Promise<AfterMatchHit[]> {
  const pgVector = toPgVector(vector)

  const result = await db.execute<AfterMatchRow>(sql`
    SELECT
      p.id AS "pairId",
      p.title,
      1 - (e.embedding <=> ${pgVector}::vector) AS score
    FROM "imageEmbedding" e
    INNER JOIN "imagePair" p ON p.id = e."pairId"
    INNER JOIN "imageAsset" after_asset ON after_asset.id = e."assetId"
    WHERE p.status = ${IMAGE_PAIR_STATUS.ready}
      AND e.status = 'ready'
      AND after_asset.kind = 'after'
    ORDER BY e.embedding <=> ${pgVector}::vector
    LIMIT ${limit}
  `)

  return result.rows.map((row) => ({
    pairId: row.pairId,
    title: row.title,
    score: Number(row.score),
  }))
}
