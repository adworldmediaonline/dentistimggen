"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  ScanSearchIcon,
} from "lucide-react"
import { toast } from "sonner"
import * as z from "zod/v4"

import { BeforeAfterLightbox } from "@/components/image-recognition/before-after-lightbox"
import { ImageFileInput } from "@/components/image-recognition/image-file-input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import type { MatchCandidate, MatchResult } from "@/lib/image-recognition/types"

const initialState: MatchResult = {
  ok: false,
  message: "",
}

const matchResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  searched: z.boolean().optional(),
  candidate: z.custom<MatchCandidate>().optional(),
})

async function submitImageMatch(formData: FormData): Promise<MatchResult> {
  const response = await fetch("/api/image-recognition/match", {
    method: "POST",
    body: formData,
  })
  const result = matchResultSchema.parse(await response.json())

  if (!response.ok) {
    return result
  }

  return result
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
  const [state, setState] = useState<MatchResult>(initialState)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const matchMutation = useMutation({
    mutationFn: submitImageMatch,
    onMutate: () => {
      setFileError(null)
      setState(initialState)
    },
    onSuccess: (result) => {
      setState(result)

      if (result.ok) {
        toast.success(result.message || "Match found.")
        return
      }

      toast.error(result.message || "No match found.")
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unable to search for a matching image."
      setState({ ok: false, message, searched: true })
      toast.error(message)
    },
  })

  const isUploading = matchMutation.isPending

  function handleFileChange(file: File | null) {
    setState(initialState)
    setFileError(null)
    setSelectedFile(file)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedFile) {
      setFileError("Choose a before image to search.")
      return
    }

    const formData = new FormData()
    formData.set("queryImage", selectedFile)
    matchMutation.mutate(formData)
  }

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
          <form onSubmit={handleSubmit}>
            <FieldGroup className="gap-5">
              {state.message ? (
                <div
                  role="alert"
                  className={
                    state.ok
                      ? "flex items-start gap-2 rounded-3xl border bg-muted/60 p-3 text-sm"
                      : "flex items-start gap-2 rounded-3xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                  }
                >
                  {state.ok ? <CheckCircle2Icon className="mt-0.5 size-4" /> : <AlertCircleIcon className="mt-0.5 size-4" />}
                  {state.message}
                </div>
              ) : null}

              <ImageFileInput
                id="queryImage"
                name="queryImage"
                label="Before image"
                description="Use the same angle, lighting, and crop as your stored before photos for the most reliable match."
                error={fileError}
                disabled={isUploading}
                onChange={handleFileChange}
              />

              <Button type="submit" className="w-full" disabled={isUploading || !selectedFile}>
                {isUploading ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Finding match...
                  </>
                ) : (
                  "Show after image"
                )}
              </Button>
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
