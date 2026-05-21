"use client"

import { useActionState } from "react"
import { ScanSearchIcon } from "lucide-react"

import { SubmitButton } from "@/components/image-recognition/submit-button"
import { BeforeAfterLightbox } from "@/components/image-recognition/before-after-lightbox"
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
}

function MatchCandidateCard({ candidate }: { candidate: MatchCandidate }) {
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle>{candidate.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <BeforeAfterLightbox candidate={candidate} />
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
              <CardTitle>Find the after image</CardTitle>
              <CardDescription>
                Upload a before image to see the corresponding after image from your saved cases.
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
                <FieldLabel htmlFor="queryImage">Before image</FieldLabel>
                <Input id="queryImage" name="queryImage" type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} required />
                <FieldDescription>
                  Use the same angle, lighting, and crop as your stored before photos for the most reliable match.
                </FieldDescription>
              </Field>

              <SubmitButton pendingLabel="Finding match…">Show after image</SubmitButton>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {state.candidate ? (
          <MatchCandidateCard candidate={state.candidate} />
        ) : state.searched ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No match found</CardTitle>
              <CardDescription>
                {state.message || "Upload a before image that matches a stored case."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No results yet</CardTitle>
              <CardDescription>
                Upload a before image on the left to see the paired before and after images here.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  )
}
