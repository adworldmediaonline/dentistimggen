"use client"

import { useActionState, useEffect, useRef } from "react"
import { UploadCloudIcon } from "lucide-react"

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
import { ACCEPTED_IMAGE_TYPES } from "@/lib/image-recognition/constants"
import { createImagePair } from "@/lib/image-recognition/actions"
import type { ActionResult } from "@/lib/image-recognition/types"

const initialState: ActionResult = {
  ok: false,
  message: "",
}

export function ImagePairForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction] = useActionState(createImagePair, initialState)

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset()
    }
  }, [state.ok])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-3xl bg-primary text-primary-foreground">
            <UploadCloudIcon className="size-5" />
          </div>
          <div>
            <CardTitle>Upload image pair</CardTitle>
            <CardDescription>
              Store a before image, its matching after image, and index the before image for matching.
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
              <Field>
                <FieldLabel htmlFor="beforeImage">Before image</FieldLabel>
                <Input id="beforeImage" name="beforeImage" type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} required />
                <FieldDescription>JPEG, PNG, or WebP up to 10 MB.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="afterImage">After image</FieldLabel>
                <Input id="afterImage" name="afterImage" type="file" accept={ACCEPTED_IMAGE_TYPES.join(",")} required />
                <FieldDescription>This image will be shown when its before image matches.</FieldDescription>
              </Field>
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

            <SubmitButton pendingLabel="Uploading and indexing...">Upload pair</SubmitButton>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
