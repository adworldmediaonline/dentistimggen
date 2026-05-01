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
import { prisma } from "@/lib/prisma"

const numberFormatter = new Intl.NumberFormat("en")

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

  const [pairs, totalPairs, readyPairs, indexedEmbeddings] = await Promise.all([
    prisma.imagePair.findMany({
      where: {
        status: {
          not: IMAGE_PAIR_STATUS.archived,
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        assets: true,
        embeddings: {
          select: {
            id: true,
          },
        },
      },
    }),
    prisma.imagePair.count({
      where: {
        status: {
          not: IMAGE_PAIR_STATUS.archived,
        },
      },
    }),
    prisma.imagePair.count({ where: { status: IMAGE_PAIR_STATUS.ready } }),
    prisma.imageEmbedding.count({ where: { status: IMAGE_PAIR_STATUS.ready } }),
  ])

  const stats = [
    { label: "Image pairs", value: totalPairs, description: "Active before/after cases" },
    { label: "Ready to match", value: readyPairs, description: "Pairs available for search" },
    { label: "Indexed before images", value: indexedEmbeddings, description: "Embeddings in vector search" },
  ]

  return (
    <main className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-6 p-4 md:p-6">
        <section className="grid gap-4 @xl/main:grid-cols-3">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader>
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums">
                  {numberFormatter.format(stat.value)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{stat.description}</CardContent>
            </Card>
          ))}
        </section>

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
