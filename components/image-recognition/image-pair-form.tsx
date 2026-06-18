"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { UploadCloudIcon } from "lucide-react"

import { ImageFileInput } from "@/components/image-recognition/image-file-input"
import { SubmitButton } from "@/components/image-recognition/submit-button"
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
import { Textarea } from "@/components/ui/textarea"
import { createImagePair } from "@/lib/image-recognition/actions"
import type { ActionResult } from "@/lib/image-recognition/types"

const initialState: ActionResult = {
  ok: false,
  message: "",
}

export function ImagePairForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction] = useActionState(createImagePair, initialState)
  const [beforeFiles, setBeforeFiles] = useState<File[]>([])
  const [afterFiles, setAfterFiles] = useState<File[]>([])
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset()
      setBeforeFiles([])
      setAfterFiles([])
      setFormKey((prev) => prev + 1)
    }
  }, [state.ok])

  const fileCountError =
    beforeFiles.length > 0 && afterFiles.length > 0 && beforeFiles.length !== afterFiles.length
      ? `Mismatched counts: you selected ${beforeFiles.length} before images but ${afterFiles.length} after images. They must match exactly.`
      : null

  const isSubmitDisabled =
    beforeFiles.length === 0 ||
    afterFiles.length === 0 ||
    beforeFiles.length !== afterFiles.length ||
    beforeFiles.length > 8

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-3xl bg-primary text-primary-foreground">
            <UploadCloudIcon className="size-5" />
          </div>
          <div>
            <CardTitle>Upload image pairs</CardTitle>
            <CardDescription>
              Store before images, their matching after images, and index the before images for matching.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction}>
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
              <FieldLabel htmlFor="title">Case title</FieldLabel>
              <Input id="title" name="title" placeholder="Upper arch whitening case" required minLength={3} />
              <FieldDescription>Use a short name admins can recognize later.</FieldDescription>
            </Field>

            <div className="grid gap-5 md:grid-cols-2">
              <ImageFileInput
                key={`before-${formKey}`}
                id="beforeImage"
                name="beforeImage"
                label="Before images"
                description="JPEG, PNG, or WebP up to 10 MB. Max 8."
                multiple
                onChange={(files) => setBeforeFiles(Array.isArray(files) ? files : files ? [files] : [])}
              />

              <ImageFileInput
                key={`after-${formKey}`}
                id="afterImage"
                name="afterImage"
                label="After images"
                description="Must have exactly the same number of after images as before images."
                multiple
                error={fileCountError}
                onChange={(files) => setAfterFiles(Array.isArray(files) ? files : files ? [files] : [])}
              />
            </div>

            <Field>
              <FieldLabel htmlFor="tags">Tags</FieldLabel>
              <Input id="tags" name="tags" placeholder="whitening, aligners, upper-arch" />
              <FieldDescription>Optional comma-separated labels for filtering and review.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="notes">Notes</FieldLabel>
              <Textarea id="notes" name="notes" placeholder="Treatment details, camera angle, or case notes." rows={4} />
            </Field>

            <SubmitButton pendingLabel="Uploading and indexing..." disabled={isSubmitDisabled}>
              Upload pairs
            </SubmitButton>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
