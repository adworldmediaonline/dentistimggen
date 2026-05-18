import { Prisma } from "@/app/generated/prisma/client"
import { IMAGE_PAIR_STATUS } from "@/lib/image-recognition/constants"
import { toPgVector } from "@/lib/image-recognition/embedding-service"
import type { MatchCandidate } from "@/lib/image-recognition/types"
import { prisma } from "@/lib/prisma"

interface MatchRow {
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
  const vectorSql = Prisma.raw(`'${pgVector}'::vector`)

  const rows = await prisma.$queryRaw<MatchRow[]>(Prisma.sql`
    SELECT
      p.id AS "pairId",
      p.title,
      p.notes,
      p.tags,
      1 - (e.embedding <=> ${vectorSql}) AS score,
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
    ORDER BY e.embedding <=> ${vectorSql}
    LIMIT ${limit}
  `)

  return rows.map((row) => ({
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
