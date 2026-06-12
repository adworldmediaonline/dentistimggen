"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ImageIcon,
  Loader2Icon,
  ScanSearchIcon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"
import * as z from "zod/v4"

import { BeforeAfterLightbox } from "@/components/image-recognition/before-after-lightbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<MatchResult>(initialState)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const previewUrl = useMemo(() => {
    if (!selectedFile) {
      return null
    }

    return URL.createObjectURL(selectedFile)
  }, [selectedFile])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

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

    if (!file) {
      setSelectedFile(null)
      return
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
      setSelectedFile(null)
      setFileError("Choose a JPEG, PNG, or WebP image.")
      return
    }

    setSelectedFile(file)
  }

  function clearSelectedFile() {
    setSelectedFile(null)
    setFileError(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
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

              <Field data-invalid={Boolean(fileError)}>
                <FieldLabel htmlFor="queryImage">Before image</FieldLabel>
                <Input
                  ref={fileInputRef}
                  id="queryImage"
                  name="queryImage"
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(",")}
                  className="sr-only"
                  onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                />
                <div className="rounded-2xl border border-dashed bg-muted/30 p-4">
                  {selectedFile ? (
                    <div className="flex gap-4">
                      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background">
                        {previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="size-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{selectedFile.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {selectedFile.type} · {formatFileSize(selectedFile.size)}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                            Change image
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={clearSelectedFile} disabled={isUploading}>
                            <XIcon className="size-4" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex w-full flex-col items-center justify-center gap-3 rounded-xl px-4 py-8 text-center transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      <span className="flex size-11 items-center justify-center rounded-3xl bg-background text-muted-foreground">
                        <UploadCloudIcon className="size-5" />
                      </span>
                      <span className="text-sm font-medium">Choose before image</span>
                      <span className="text-xs text-muted-foreground">JPEG, PNG, or WebP up to 10 MB</span>
                    </button>
                  )}
                </div>
                {fileError ? <p className="text-sm text-destructive">{fileError}</p> : null}
                <FieldDescription>
                  Use the same angle, lighting, and crop as your stored before photos for the most reliable match.
                </FieldDescription>
              </Field>

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
