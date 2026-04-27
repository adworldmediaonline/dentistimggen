"use client"

import {
  DownloadIcon,
  ImageIcon,
  PlugZapIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  SparklesIcon,
  UploadIcon,
} from "lucide-react"
import Image from "next/image"
import Script from "next/script"
import { useEffect, useId, useRef, useState } from "react"

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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

const MAX_IMAGE_SIZE = 8 * 1024 * 1024
const GENERATION_TIMEOUT_MS = 90_000
const PUTER_MODEL = "gemini-2.5-flash-image-preview"
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

const treatmentGoals = {
  whitening:
    "Whiten teeth naturally, reduce surface stains, and keep enamel texture realistic.",
  alignment:
    "Improve mild alignment and spacing while preserving a believable natural smile and gum line.",
  veneers:
    "Create a subtle porcelain veneer preview with even shape, natural translucency, and realistic proportions.",
  comprehensive:
    "Create a balanced cosmetic dental preview with whitening, mild alignment, and small gap correction.",
} as const

const treatmentLabels: Record<TreatmentGoal, string> = {
  whitening: "Natural whitening",
  alignment: "Mild alignment correction",
  veneers: "Subtle veneer preview",
  comprehensive: "Comprehensive smile enhancement",
}

type TreatmentGoal = keyof typeof treatmentGoals
type GenerationPhase = "idle" | "authorizing" | "uploading" | "generating" | "finalizing"

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }

      reject(new Error("Could not read the selected image."))
    }
    reader.onerror = () => reject(new Error("Could not read the selected image."))
    reader.readAsDataURL(file)
  })
}

function getBase64FromDataUrl(dataUrl: string) {
  return dataUrl.split(",")[1] ?? ""
}

function buildPrompt(goal: TreatmentGoal, notes: string) {
  const trimmedNotes = notes.trim()

  return [
    "Create a photorealistic dental after-treatment visualization from the uploaded before-treatment teeth image.",
    treatmentGoals[goal],
    "Preserve the original crop, lip position, gums, jaw shape, lighting, camera angle, skin tone, and background.",
    "Only modify the visible teeth. Do not alter identity, lips, facial structure, or add unrealistic glow.",
    "Return a clean clinical cosmetic dentistry preview suitable for a before-and-after admin panel.",
    trimmedNotes ? `Additional clinician notes: ${trimmedNotes}` : "",
  ]
    .filter(Boolean)
    .join(" ")
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("Puter is taking too long to respond. Please retry in a moment."))
    }, timeoutMs)

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeout))
  })
}

function getPuter() {
  return window.puter
}

export function BeforeAfterGenerator() {
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isPuterReady, setIsPuterReady] = useState(false)
  const [isPuterSignedIn, setIsPuterSignedIn] = useState(false)
  const [beforeImageUrl, setBeforeImageUrl] = useState<string | null>(null)
  const [beforeImageBase64, setBeforeImageBase64] = useState<string | null>(null)
  const [beforeImageMimeType, setBeforeImageMimeType] = useState<string | null>(null)
  const [afterImageUrl, setAfterImageUrl] = useState<string | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [treatmentGoal, setTreatmentGoal] = useState<TreatmentGoal>("comprehensive")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [generationPhase, setGenerationPhase] = useState<GenerationPhase>("idle")

  const isGenerating = generationPhase !== "idle"
  const canConnect = isPuterReady && !isGenerating
  const canGenerate = Boolean(
    isPuterReady && isPuterSignedIn && beforeImageBase64 && beforeImageMimeType
  )
  const progressValue =
    generationPhase === "authorizing"
      ? 20
      : generationPhase === "uploading"
        ? 42
        : generationPhase === "generating"
          ? 72
          : generationPhase === "finalizing"
            ? 92
            : 0

  useEffect(() => {
    return () => {
      if (beforeImageUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(beforeImageUrl)
      }
    }
  }, [beforeImageUrl])

  function syncPuterStatus() {
    const puter = getPuter()

    setIsPuterReady(Boolean(puter?.ai?.txt2img && puter?.auth))
    setIsPuterSignedIn(Boolean(puter?.auth?.isSignedIn?.()))
  }

  async function connectPuter() {
    const puter = getPuter()

    if (!puter?.auth?.signIn) {
      setError("Puter is still loading. Please try again in a moment.")
      return
    }

    setError(null)
    setGenerationPhase("authorizing")

    try {
      await puter.auth.signIn()
      syncPuterStatus()
    } catch (connectError) {
      const message =
        connectError instanceof Error
          ? connectError.message
          : "Puter authorization was cancelled or failed."

      setError(message)
    } finally {
      setGenerationPhase("idle")
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    setError(null)
    setAfterImageUrl(null)

    if (!file) {
      return
    }

    if (!SUPPORTED_IMAGE_TYPES.includes(file.type as (typeof SUPPORTED_IMAGE_TYPES)[number])) {
      setError("Upload a JPG, PNG, or WebP image.")
      event.target.value = ""
      return
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setError("Use an image smaller than 8 MB.")
      event.target.value = ""
      return
    }

    const dataUrl = await fileToDataUrl(file)

    if (beforeImageUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(beforeImageUrl)
    }

    setBeforeImageUrl(URL.createObjectURL(file))
    setBeforeImageBase64(getBase64FromDataUrl(dataUrl))
    setBeforeImageMimeType(file.type)
    setSelectedFileName(file.name)
  }

  async function generateAfterImage() {
    const puter = getPuter()

    if (!beforeImageBase64 || !beforeImageMimeType) {
      setError("Upload a before-treatment teeth image first.")
      return
    }

    if (!puter?.ai?.txt2img || !puter.auth) {
      setError("Puter is still loading. Please try again in a moment.")
      return
    }

    if (!puter.auth.isSignedIn?.()) {
      setError("Connect Puter first, then generate the after image.")
      setIsPuterSignedIn(false)
      return
    }

    setError(null)
    setAfterImageUrl(null)
    setGenerationPhase("uploading")

    try {
      setGenerationPhase("generating")
      const image = await withTimeout(
        puter.ai.txt2img(buildPrompt(treatmentGoal, notes), {
          model: PUTER_MODEL,
          input_image: beforeImageBase64,
          input_image_mime_type: beforeImageMimeType,
        }),
        GENERATION_TIMEOUT_MS
      )

      setGenerationPhase("finalizing")
      setAfterImageUrl(image.src)
    } catch (generationError) {
      const message =
        generationError instanceof Error
          ? generationError.message
          : "The Puter image generation request failed."

      setError(message)
    } finally {
      setGenerationPhase("idle")
    }
  }

  function resetWorkflow() {
    if (beforeImageUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(beforeImageUrl)
    }

    setBeforeImageUrl(null)
    setBeforeImageBase64(null)
    setBeforeImageMimeType(null)
    setAfterImageUrl(null)
    setSelectedFileName(null)
    setError(null)
    setGenerationPhase("idle")

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <>
      <Script
        src="https://js.puter.com/v2/"
        strategy="afterInteractive"
        onReady={syncPuterStatus}
        onError={() => setError("Could not load Puter.js. Check the network and try again.")}
      />

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Generate after-treatment image</CardTitle>
                <CardDescription>
                  Use Puter AI to generate the after image from the uploaded before image.
                </CardDescription>
              </div>
              <Badge variant={isPuterSignedIn ? "secondary" : "outline"}>
                {isPuterSignedIn ? "Puter connected" : isPuterReady ? "Connect Puter" : "Loading Puter"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel>Puter authorization</FieldLabel>
                <div className="rounded-3xl border bg-muted/40 p-3 text-sm">
                  <p className="text-muted-foreground">
                    Puter’s free image generation uses a user-paid authorization flow. Connect
                    once here so the Generate button can stay focused on the in-page result.
                  </p>
                  <Button
                    type="button"
                    variant={isPuterSignedIn ? "secondary" : "default"}
                    className="mt-3 w-full"
                    disabled={!canConnect || isPuterSignedIn}
                    onClick={connectPuter}
                  >
                    {generationPhase === "authorizing" ? (
                      <>
                        <Spinner />
                        Waiting for Puter...
                      </>
                    ) : (
                      <>
                        <PlugZapIcon />
                        {isPuterSignedIn ? "Puter connected" : "Connect Puter"}
                      </>
                    )}
                  </Button>
                </div>
              </Field>

              <Field>
                <FieldLabel htmlFor={fileInputId}>Before-treatment image</FieldLabel>
                <input
                  ref={fileInputRef}
                  id={fileInputId}
                  type="file"
                  accept={SUPPORTED_IMAGE_TYPES.join(",")}
                  className="sr-only"
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-28 w-full flex-col gap-2 rounded-4xl border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadIcon className="size-5" />
                  <span>{selectedFileName ?? "Upload JPG, PNG, or WebP"}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Max 8 MB. The image is sent to Puter only when you generate.
                  </span>
                </Button>
              </Field>

              <Field>
                <FieldLabel>Treatment style</FieldLabel>
                <Select
                  value={treatmentGoal}
                  onValueChange={(value) => setTreatmentGoal(value as TreatmentGoal)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select treatment style" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comprehensive">{treatmentLabels.comprehensive}</SelectItem>
                    <SelectItem value="whitening">{treatmentLabels.whitening}</SelectItem>
                    <SelectItem value="alignment">{treatmentLabels.alignment}</SelectItem>
                    <SelectItem value="veneers">{treatmentLabels.veneers}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="treatment-notes">Optional clinician notes</FieldLabel>
                <Textarea
                  id="treatment-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Example: keep canine shape natural, brighten by two shades, close small central gap."
                  className="min-h-28"
                />
                <FieldDescription>
                  Keep notes clinical and avoid adding personal or identifying information.
                </FieldDescription>
              </Field>

              {error ? (
                <div className="space-y-3 rounded-3xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <p role="alert">{error}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canGenerate || isGenerating}
                    onClick={generateAfterImage}
                  >
                    Retry Puter generation
                  </Button>
                </div>
              ) : null}

              {isGenerating ? (
                <div role="status" className="space-y-2 rounded-3xl border bg-muted/40 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      {generationPhase === "authorizing"
                        ? "Waiting for Puter authorization..."
                        : generationPhase === "uploading"
                          ? "Preparing image for Puter..."
                          : generationPhase === "generating"
                            ? "Puter is generating the after image..."
                            : "Finalizing preview..."}
                    </span>
                    <span className="text-muted-foreground">{progressValue}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${progressValue}%` }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" disabled={!canGenerate || isGenerating} onClick={generateAfterImage}>
                  {isGenerating ? (
                    <>
                      <Spinner />
                      Generating with Puter...
                    </>
                  ) : (
                    <>
                      <SparklesIcon />
                      Generate with Puter
                    </>
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={resetWorkflow}>
                  <RotateCcwIcon />
                  Reset
                </Button>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <ImagePreviewCard
            title="Before"
            description="Original uploaded image"
            imageUrl={beforeImageUrl}
            emptyTitle="Upload a before image"
            emptyDescription="The selected image appears here before generation."
          />
          <ImagePreviewCard
            title="After"
            description="Puter-generated treatment visualization"
            imageUrl={afterImageUrl}
            isLoading={isGenerating && generationPhase !== "authorizing"}
            emptyTitle="Generate an after image"
            emptyDescription="The Puter-generated after-treatment image appears here once ready."
            downloadName="after-treatment-preview.png"
          />
        </div>
      </div>

      <Card className="mt-6 border-dashed shadow-none">
        <CardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
          <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-foreground" />
          <p>
            This feature creates a visual simulation for admin review only. It is not a
            diagnosis, treatment plan, or guaranteed clinical outcome. Puter generation runs
            through Puter’s browser service and may require the admin to authorize Puter first.
          </p>
        </CardContent>
      </Card>
    </>
  )
}

interface ImagePreviewCardProps {
  title: string
  description: string
  imageUrl: string | null
  emptyTitle: string
  emptyDescription: string
  isLoading?: boolean
  downloadName?: string
}

function ImagePreviewCard({
  title,
  description,
  imageUrl,
  emptyTitle,
  emptyDescription,
  isLoading = false,
  downloadName,
}: ImagePreviewCardProps) {
  return (
    <Card className="min-h-[420px]">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {imageUrl && downloadName ? (
            <Button asChild variant="outline" size="sm">
              <a href={imageUrl} download={downloadName}>
                <DownloadIcon />
                Download
              </a>
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1">
        {isLoading ? (
          <div className="flex min-h-72 flex-1 flex-col gap-4 rounded-4xl border bg-muted/40 p-4">
            <Skeleton className="flex-1 rounded-4xl" />
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Waiting for Puter...
            </div>
          </div>
        ) : imageUrl ? (
          <div className="relative min-h-72 flex-1 overflow-hidden rounded-4xl border bg-muted">
            <Image
              src={imageUrl}
              alt={`${title} treatment image`}
              fill
              sizes="(min-width: 1280px) 33vw, (min-width: 1024px) 50vw, 100vw"
              className="object-contain"
              unoptimized
            />
          </div>
        ) : (
          <Empty className="min-h-72 flex-1 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ImageIcon />
              </EmptyMedia>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
              <EmptyDescription>{emptyDescription}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <p>Use clear, well-lit intraoral or smile photos for best results.</p>
            </EmptyContent>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}
