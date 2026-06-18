"use client"

import { useEffect, useRef, useState } from "react"
import { GripVertical, ImageIcon, PlusIcon, UploadCloudIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ACCEPTED_IMAGE_TYPES } from "@/lib/image-recognition/constants"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface FileWithPreview {
  id: string
  file: File
  previewUrl: string
}

interface ImageFileInputProps {
  id: string
  name: string
  label: string
  description?: string
  error?: string | null
  disabled?: boolean
  multiple?: boolean
  maxFiles?: number
  onChange?: (files: File[] | File | null) => void
}

export function ImageFileInput({
  id,
  name,
  label,
  description,
  error,
  disabled = false,
  multiple = false,
  maxFiles = 8,
  onChange,
}: ImageFileInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [filesWithPreviews, setFilesWithPreviews] = useState<FileWithPreview[]>([])
  const [activeRemoveId, setActiveRemoveId] = useState<string | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  useEffect(() => {
    if (fileInputRef.current) {
      try {
        const dataTransfer = new DataTransfer()
        filesWithPreviews.forEach((f) => {
          dataTransfer.items.add(f.file)
        })
        fileInputRef.current.files = dataTransfer.files
      } catch (err) {
        console.error("Failed to sync file list using DataTransfer", err)
      }
    }
  }, [filesWithPreviews])

  useEffect(() => {
    return () => {
      filesWithPreviews.forEach((f) => URL.revokeObjectURL(f.previewUrl))
    }
  }, [])

  function addFiles(newFiles: File[]) {
    const currentCount = filesWithPreviews.length
    const spaceLeft = maxFiles - currentCount
    const filesToAdd = newFiles.slice(0, spaceLeft)

    if (filesToAdd.length === 0) return

    const added: FileWithPreview[] = filesToAdd.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }))

    const updated = [...filesWithPreviews, ...added]
    setFilesWithPreviews(updated)

    const rawFiles = updated.map((f) => f.file)
    if (multiple) {
      onChange?.(rawFiles)
    } else {
      onChange?.(rawFiles[0] ?? null)
    }
  }

  function removeFile(targetId: string) {
    const fileToRemove = filesWithPreviews.find((f) => f.id === targetId)
    if (fileToRemove) {
      URL.revokeObjectURL(fileToRemove.previewUrl)
    }

    const updated = filesWithPreviews.filter((f) => f.id !== targetId)
    setFilesWithPreviews(updated)

    const rawFiles = updated.map((f) => f.file)
    if (multiple) {
      onChange?.(rawFiles)
    } else {
      onChange?.(rawFiles[0] ?? null)
    }
  }

  function handleInputChange(fileList: FileList | null) {
    if (!fileList) return
    const newFiles = Array.from(fileList)

    if (multiple) {
      addFiles(newFiles)
    } else {
      filesWithPreviews.forEach((f) => URL.revokeObjectURL(f.previewUrl))
      const file = newFiles[0]
      if (file) {
        const singleFile = {
          id: `${file.name}-${file.size}-${Date.now()}`,
          file,
          previewUrl: URL.createObjectURL(file),
        }
        setFilesWithPreviews([singleFile])
        onChange?.(file)
      } else {
        setFilesWithPreviews([])
        onChange?.(null)
      }
    }
  }

  function handleClearAll() {
    filesWithPreviews.forEach((f) => URL.revokeObjectURL(f.previewUrl))
    setFilesWithPreviews([])
    if (multiple) {
      onChange?.([])
    } else {
      onChange?.(null)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    if (!disabled) {
      setIsDragActive(true)
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setIsDragActive(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragActive(false)
    if (disabled) return

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      handleInputChange(files)
    }
  }

  function handleItemDragStart(index: number, e: React.DragEvent) {
    if (disabled || !multiple) {
      e.preventDefault()
      return
    }
    e.dataTransfer.effectAllowed = "move"
    setDraggedIndex(index)
  }

  function handleItemDragOver(index: number, e: React.DragEvent) {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    setDragOverIndex(index)
  }

  function handleItemDragLeave() {
    setDragOverIndex(null)
  }

  function handleItemDrop(index: number, e: React.DragEvent) {
    e.preventDefault()
    setDragOverIndex(null)
    if (draggedIndex === null || draggedIndex === index) return

    const updated = [...filesWithPreviews]
    const [draggedItem] = updated.splice(draggedIndex, 1)
    updated.splice(index, 0, draggedItem)

    setFilesWithPreviews(updated)
    setDraggedIndex(null)

    const rawFiles = updated.map((f) => f.file)
    onChange?.(rawFiles)
  }

  const showAddButton = !disabled && (!multiple ? filesWithPreviews.length === 0 : filesWithPreviews.length < maxFiles)

  return (
    <Field data-invalid={Boolean(error)}>
      <div className="flex items-center justify-between">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {multiple && filesWithPreviews.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-destructive"
            onClick={handleClearAll}
            disabled={disabled}
          >
            Clear all
          </Button>
        )}
      </div>

      <Input
        ref={fileInputRef}
        id={id}
        name={name}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="sr-only"
        multiple={multiple}
        onChange={(event) => handleInputChange(event.target.files)}
        disabled={disabled}
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "space-y-4 rounded-2xl border border-dashed bg-muted/30 p-4 transition-all duration-200",
          isDragActive && "border-primary bg-primary/5 ring-2 ring-primary/20"
        )}
      >
        {filesWithPreviews.length > 0 && (
          <div className="grid gap-3">
            {filesWithPreviews.map((f, index) => {
              const isDragged = draggedIndex === index
              const isOver = dragOverIndex === index

              return (
                <div
                  key={f.id}
                  draggable={!disabled && multiple}
                  onDragStart={(e) => handleItemDragStart(index, e)}
                  onDragOver={(e) => handleItemDragOver(index, e)}
                  onDragLeave={handleItemDragLeave}
                  onDrop={(e) => handleItemDrop(index, e)}
                  className={cn(
                    "flex gap-4 rounded-xl border bg-background p-3 transition-all duration-200 select-none",
                    multiple && !disabled && "cursor-grab active:cursor-grabbing",
                    isDragged && "opacity-30 border-primary border-dashed",
                    isOver && "border-primary bg-primary/5 translate-y-0.5 scale-[0.99]"
                  )}
                >
                  {multiple && !disabled && (
                    <div className="flex items-center text-muted-foreground/30 hover:text-muted-foreground/60 shrink-0">
                      <GripVertical className="size-4" />
                    </div>
                  )}
                  <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted border">
                    {f.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.previewUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="size-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{f.file.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {f.file.type || "Unknown type"} · {formatFileSize(f.file.size)}
                    </div>
                    <div className="mt-2 flex">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => setActiveRemoveId(f.id)}
                        disabled={disabled}
                      >
                        <XIcon className="mr-1 size-3.5" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {showAddButton ? (
          <button
            type="button"
            className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-muted-foreground/30 px-4 py-8 text-center transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            <span className="flex size-11 items-center justify-center rounded-3xl bg-background text-muted-foreground shadow-sm">
              {multiple && filesWithPreviews.length > 0 ? (
                <PlusIcon className="size-5" />
              ) : (
                <UploadCloudIcon className="size-5" />
              )}
            </span>
            <span className="text-sm font-medium">
              {multiple && filesWithPreviews.length > 0
                ? `Add more images (${filesWithPreviews.length}/${maxFiles})`
                : `Choose ${label.toLowerCase()}`}
            </span>
            <span className="text-xs text-muted-foreground">
              JPEG, PNG, or WebP up to 10 MB. Max {maxFiles} images.
            </span>
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {description ? <FieldDescription>{description}</FieldDescription> : null}

      <AlertDialog open={activeRemoveId !== null} onOpenChange={(open) => { if (!open) setActiveRemoveId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Image</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this image? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (activeRemoveId) {
                  removeFile(activeRemoveId)
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Field>
  )
}
