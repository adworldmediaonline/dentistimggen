"use client"

import Image from "next/image"
import { useActionState } from "react"
import { ScanSearchIcon } from "lucide-react"

import { SubmitButton } from "@/components/image-recognition/submit-button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ACCEPTED_IMAGE_TYPES } from "@/lib/image-recognition/constants"
import { findImageMatch } from "@/lib/image-recognition/actions"
import type { MatchCandidate, MatchResult } from "@/lib/image-recognition/types"

const initialState: MatchResult = {
  ok: false,
  message: "",
  alternatives: [],
}

function formatScore(score: number) {
  return `${Math.round(score * 100)}%`
}

function MatchImage({
  asset,
  label,
}: {
  asset: { url: string; width: number; height: number }
  label: string
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="overflow-hidden rounded-3xl border bg-muted">
        <Image
          src={asset.url}
          alt={label}
          width={asset.width}
          height={asset.height}
          className="aspect-[4/3] w-full object-cover"
        />
      </div>
    </div>
  )
}

function MatchCandidateCard({ candidate }: { candidate: MatchCandidate }) {
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{candidate.title}</CardTitle>
            <CardDescription>Similarity score {formatScore(candidate.score)}</CardDescription>
          </div>
          <Badge>{formatScore(candidate.score)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <MatchImage asset={candidate.beforeAsset} label="Matched before image" />
          {candidate.afterAsset ? (
            <MatchImage asset={candidate.afterAsset} label="Recommended after image" />
          ) : (
            <div className="rounded-3xl border border-dashed p-6 text-sm text-muted-foreground">
              No after image is linked to this pair.
            </div>
          )}
        </div>
        {candidate.notes ? <p className="text-sm text-muted-foreground">{candidate.notes}</p> : null}
        {candidate.tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {candidate.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function ImageMatchForm() {
  const [state, formAction] = useActionState(findImageMatch, initialState)

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-3xl bg-primary text-primary-foreground">
              <ScanSearchIcon className="size-5" />
            </div>
            <div>
              <CardTitle>Find matching case</CardTitle>
              <CardDescription>
                Upload a new before image to find the closest indexed before image and its after result.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form action={formAction}>
            <FieldGroup className="gap-5">
              {state.message ? (
                <div
                  role="alert"
                  className={state.ok ? "rounded-3xl border bg-muted/60 p-3 text-sm" : "rounded-3xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"}
                >
                  {state.message}
                </div>
              ) : null}

              <Field>
                <FieldLabel htmlFor="queryImage">Query before image</FieldLabel>
                <Input id="queryImage" name="queryImage" type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} required />
                <FieldDescription>
                  Use the same kind of before image angle and crop used in your stored cases.
                </FieldDescription>
              </Field>

              <SubmitButton pendingLabel="Searching indexed images...">Search match</SubmitButton>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {state.candidate ? (
          <MatchCandidateCard candidate={state.candidate} />
        ) : (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No search yet</CardTitle>
              <CardDescription>
                Search results will show the closest before image and the linked after image here.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {state.alternatives?.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Closest alternatives</CardTitle>
              <CardDescription>Review these when the top confidence is low.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {state.alternatives.map((candidate) => (
                <div key={candidate.pairId} className="flex items-center justify-between gap-4 rounded-3xl border p-3">
                  <div>
                    <p className="font-medium">{candidate.title}</p>
                    <p className="text-sm text-muted-foreground">Similarity score {formatScore(candidate.score)}</p>
                  </div>
                  <Badge variant="outline">{formatScore(candidate.score)}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
