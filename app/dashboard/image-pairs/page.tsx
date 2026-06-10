import { connection } from "next/server"
import Image from "next/image"
import { ImagesIcon } from "lucide-react"

import { ArchiveImagePairButton } from "@/components/image-recognition/archive-image-pair-button"
import { BackfillEmbeddingsButton } from "@/components/image-recognition/backfill-embeddings-button"
import { ImagePairForm } from "@/components/image-recognition/image-pair-form"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { IMAGE_ASSET_KIND, IMAGE_PAIR_STATUS } from "@/lib/image-recognition/constants"
import { collections, type ImageAssetDoc } from "@/lib/mongodb"

function statusVariant(status: string) {
  if (status === IMAGE_PAIR_STATUS.ready) {
    return "default" as const
  }

  if (status === IMAGE_PAIR_STATUS.failed) {
    return "destructive" as const
  }

  return "secondary" as const
}

export default async function ImagePairsPage() {
  await connection()

  const { imagePairs, imageAssets } = await collections()
  const pairDocs = await imagePairs
    .find({ status: { $ne: IMAGE_PAIR_STATUS.archived } })
    .sort({ createdAt: -1 })
    .toArray()

  const assetDocs = await imageAssets
    .find({ pairId: { $in: pairDocs.map((p) => p._id) } })
    .toArray()

  const assetsByPair = new Map<string, ImageAssetDoc[]>()
  for (const asset of assetDocs) {
    const list = assetsByPair.get(asset.pairId) ?? []
    list.push(asset)
    assetsByPair.set(asset.pairId, list)
  }

  const pairs = pairDocs.map((pair) => ({
    id: pair._id,
    title: pair.title,
    notes: pair.notes,
    tags: pair.tags,
    status: pair.status,
    assets: (assetsByPair.get(pair._id) ?? []).map((asset) => ({
      id: asset._id,
      kind: asset.kind,
      url: asset.url,
      width: asset.width,
      height: asset.height,
    })),
  }))

  return (
    <main className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-6 p-4 md:p-6">
        <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <ImagePairForm />

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle>Managed image pairs</CardTitle>
                  <CardDescription>
                    Archive records that should no longer appear in recognition results.
                  </CardDescription>
                </div>
                <BackfillEmbeddingsButton />
              </div>
            </CardHeader>
            <CardContent>
              {pairs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Case</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Images</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pairs.map((pair) => {
                      const beforeAsset = pair.assets.find((asset) => asset.kind === IMAGE_ASSET_KIND.before)
                      const afterAsset = pair.assets.find((asset) => asset.kind === IMAGE_ASSET_KIND.after)

                      return (
                        <TableRow key={pair.id}>
                          <TableCell className="min-w-56 whitespace-normal">
                            <div className="space-y-1">
                              <p className="font-medium">{pair.title}</p>
                              {pair.notes ? (
                                <p className="line-clamp-2 text-sm text-muted-foreground">{pair.notes}</p>
                              ) : null}
                              {pair.tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {pair.tags.map((tag) => (
                                    <Badge key={tag} variant="secondary">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(pair.status)}>{pair.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {[beforeAsset, afterAsset].map((asset) =>
                                asset ? (
                                  <Image
                                    key={asset.id}
                                    src={asset.url}
                                    alt={`${pair.title} ${asset.kind}`}
                                    width={asset.width}
                                    height={asset.height}
                                    className="size-14 rounded-2xl border object-cover"
                                  />
                                ) : null
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <ArchiveImagePairButton pairId={pair.id} />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ImagesIcon />
                    </EmptyMedia>
                    <EmptyTitle>No image pairs yet</EmptyTitle>
                    <EmptyDescription>
                      Upload a before/after pair to create the first searchable dental case.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
