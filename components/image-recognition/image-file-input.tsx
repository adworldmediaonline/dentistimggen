"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ImageIcon, UploadCloudIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ACCEPTED_IMAGE_TYPES } from "@/lib/image-recognition/constants"

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface ImageFileInputProps {
  /** The `id` and `name` attribute for the underlying <input> */
  id: string
  name: string
  /** Label shown above the input */
  label: string
  /** Helper text shown below the input */
  description?: string
  /** Validation error message — marks the field invalid when truthy */
  error?: string | null
  /** Mirrors a loading state from the parent — disables interactive controls */
  disabled?: boolean
  /** Called when the user picks or clears a file */
  onChange?: (file: File | null) => void
}

export function ImageFileInput({
  id,
  name,
  label,
  description,
  error,
  disabled = false,
  onChange,
}: ImageFileInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const previewUrl = useMemo(() => {
    if (!selectedFile) return null
    return URL.createObjectURL(selectedFile)
  }, [selectedFile])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function handleInputChange(file: File | null) {
    if (!file) {
      setSelectedFile(null)
      onChange?.(null)
      return
    }

    setSelectedFile(file)
    onChange?.(file)
  }

  function handleClear() {
    setSelectedFile(null)
    onChange?.(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        ref={fileInputRef}
        id={id}
        name={name}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="sr-only"
        onChange={(event) => handleInputChange(event.target.files?.[0] ?? null)}
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                >
                  Change image
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  disabled={disabled}
                >
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
            disabled={disabled}
          >
            <span className="flex size-11 items-center justify-center rounded-3xl bg-background text-muted-foreground">
              <UploadCloudIcon className="size-5" />
            </span>
            <span className="text-sm font-medium">Choose {label.toLowerCase()}</span>
            <span className="text-xs text-muted-foreground">JPEG, PNG, or WebP up to 10 MB</span>
          </button>
        )}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  )
}
