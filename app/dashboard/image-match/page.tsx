import { connection } from "next/server"
import { SearchCheckIcon } from "lucide-react"

import { ImageMatchForm } from "@/components/image-recognition/image-match-form"
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
import { IMAGE_MATCH_STATUS, IMAGE_PAIR_STATUS } from "@/lib/image-recognition/constants"
import { prisma } from "@/lib/prisma"

const numberFormatter = new Intl.NumberFormat("en")

function formatScore(score: number | null) {
  if (score === null) {
    return "No score"
  }

  return `${Math.round(score * 100)}%`
}

export default async function ImageMatchPage() {
  await connection()

  const [readyPairs, recentMatches] = await Promise.all([
    prisma.imagePair.count({ where: { status: IMAGE_PAIR_STATUS.ready } }),
    prisma.imageMatchLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        matchedPair: {
          select: {
            title: true,
          },
        },
      },
    }),
  ])

  return (
    <main className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-6 p-4 md:p-6">
        <section className="grid gap-4 @xl/main:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Searchable cases</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums">
                {numberFormatter.format(readyPairs)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Ready before images with generated embeddings.
            </CardContent>
          </Card>
          <Card className="@xl/main:col-span-2">
            <CardHeader>
              <CardTitle>Matching guidance</CardTitle>
              <CardDescription>
                Best results come from consistent angles, lighting, crop, and image quality across stored and query photos.
              </CardDescription>
            </CardHeader>
          </Card>
        </section>

        <ImageMatchForm />

        <Card>
          <CardHeader>
            <CardTitle>Recent match attempts</CardTitle>
            <CardDescription>Use this log to tune confidence thresholds and review low-confidence searches.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentMatches.length > 0 ? (
              <div className="divide-y divide-border rounded-3xl border">
                {recentMatches.map((match) => (
                  <div key={match.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{match.matchedPair?.title ?? "No confident match"}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatScore(match.similarityScore)} similarity · {match.createdAt.toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={match.status === IMAGE_MATCH_STATUS.matched ? "default" : "secondary"}>
                      {match.status.replaceAll("_", " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchCheckIcon />
                  </EmptyMedia>
                  <EmptyTitle>No match attempts yet</EmptyTitle>
                  <EmptyDescription>
                    Upload a query before image to record the first recognition result.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
