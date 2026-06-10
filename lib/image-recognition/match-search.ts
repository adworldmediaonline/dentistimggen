import { IMAGE_ASSET_KIND, IMAGE_PAIR_STATUS } from "@/lib/image-recognition/constants"
import { cosineSimilarity } from "@/lib/image-recognition/embedding-service"
import type { AfterMatchHit, MatchCandidate } from "@/lib/image-recognition/types"
import { collections, type ImageAssetDoc } from "@/lib/mongodb"

interface ScoredEmbedding {
  pairId: string
  assetId: string
  score: number
}

/**
 * Fetch ready embeddings for the given asset kind on non-archived/ready pairs,
 * score them against the query vector with cosine similarity, and return the
 * top `limit` (highest score first). The dataset is small (admin-curated
 * before/after pairs) and embeddings are only 64-dim, so ranking in app code is
 * fast and avoids needing Atlas $vectorSearch.
 */
async function scoreEmbeddings(
  vector: number[],
  kind: typeof IMAGE_ASSET_KIND.before | typeof IMAGE_ASSET_KIND.after,
  limit: number
): Promise<ScoredEmbedding[]> {
  const { imageEmbeddings, imageAssets, imagePairs } = await collections()

  // Only consider embeddings whose asset is of the requested kind and whose
  // pair is ready.
  const readyPairIds = (
    await imagePairs.find({ status: IMAGE_PAIR_STATUS.ready }, { projection: { _id: 1 } }).toArray()
  ).map((p) => p._id)

  if (readyPairIds.length === 0) {
    return []
  }

  const kindAssetIds = (
    await imageAssets
      .find({ kind, pairId: { $in: readyPairIds } }, { projection: { _id: 1 } })
      .toArray()
  ).map((a) => a._id)

  if (kindAssetIds.length === 0) {
    return []
  }

  const embeddings = await imageEmbeddings
    .find({ status: "ready", assetId: { $in: kindAssetIds } })
    .toArray()

  return embeddings
    .map((e) => ({
      pairId: e.pairId,
      assetId: e.assetId,
      score: cosineSimilarity(vector, e.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function assetView(asset: ImageAssetDoc | undefined) {
  if (!asset) {
    return null
  }
  return { url: asset.url, width: asset.width, height: asset.height }
}

export async function findClosestBeforeImages(vector: number[], limit = 3): Promise<MatchCandidate[]> {
  const scored = await scoreEmbeddings(vector, IMAGE_ASSET_KIND.before, limit)
  if (scored.length === 0) {
    return []
  }

  const { imagePairs, imageAssets } = await collections()
  const pairIds = scored.map((s) => s.pairId)

  const pairs = await imagePairs.find({ _id: { $in: pairIds } }).toArray()
  const assets = await imageAssets.find({ pairId: { $in: pairIds } }).toArray()

  const pairById = new Map(pairs.map((p) => [p._id, p]))
  const beforeByPair = new Map(
    assets.filter((a) => a.kind === IMAGE_ASSET_KIND.before).map((a) => [a.pairId, a])
  )
  const afterByPair = new Map(
    assets.filter((a) => a.kind === IMAGE_ASSET_KIND.after).map((a) => [a.pairId, a])
  )

  const candidates: MatchCandidate[] = []
  for (const hit of scored) {
    const pair = pairById.get(hit.pairId)
    const before = assetView(beforeByPair.get(hit.pairId))
    if (!pair || !before) {
      continue
    }
    candidates.push({
      pairId: pair._id,
      title: pair.title,
      notes: pair.notes,
      tags: pair.tags,
      score: hit.score,
      beforeAsset: before,
      afterAsset: assetView(afterByPair.get(hit.pairId)),
    })
  }

  return candidates
}

export async function findClosestAfterImages(vector: number[], limit = 1): Promise<AfterMatchHit[]> {
  const scored = await scoreEmbeddings(vector, IMAGE_ASSET_KIND.after, limit)
  if (scored.length === 0) {
    return []
  }

  const { imagePairs } = await collections()
  const pairs = await imagePairs.find({ _id: { $in: scored.map((s) => s.pairId) } }).toArray()
  const pairById = new Map(pairs.map((p) => [p._id, p]))

  return scored
    .map((hit) => {
      const pair = pairById.get(hit.pairId)
      return pair ? { pairId: pair._id, title: pair.title, score: hit.score } : null
    })
    .filter((hit): hit is AfterMatchHit => hit !== null)
}
