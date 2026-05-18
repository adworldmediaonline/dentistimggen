"use client"

import Image from "next/image"
import { Maximize2 } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { MatchCandidate } from "@/lib/image-recognition/types"

const PREVIEW_SIZES =
  "(max-width: 768px) 100vw, (max-width: 1200px) 45vw, 520px"

function PreviewTile({
  src,
  alt,
  heightClass,
  className,
}: {
  src: string
  alt: string
  heightClass: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-2xl border bg-muted/80",
        heightClass,
        className
      )}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={PREVIEW_SIZES}
        className="object-contain p-3 sm:p-4"
      />
    </div>
  )
}

function LightboxPane({
  src,
  alt,
  label,
}: {
  src: string
  alt: string
  label: string
}) {
  return (
    <div className="space-y-3 p-5">
      <p className="text-sm font-medium">{label}</p>
      <div className="relative h-[min(72vh,680px)] w-full rounded-2xl bg-muted">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-contain p-4 sm:p-6"
        />
      </div>
    </div>
  )
}

export function BeforeAfterLightbox({ candidate }: { candidate: MatchCandidate }) {
  const after = candidate.afterAsset

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="group w-full rounded-3xl border border-primary/25 bg-card text-left outline-none transition hover:border-primary/45 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="grid gap-4 p-4 md:grid-cols-2 md:gap-5 md:p-5">
            <div className="space-y-2">
              <p className="px-1 text-sm font-medium">Before</p>
              <PreviewTile
                src={candidate.beforeAsset.url}
                alt="Before"
                heightClass="h-52 sm:h-56 md:h-64"
              />
            </div>
            {after ? (
              <div className="space-y-2">
                <p className="px-1 text-sm font-medium">After</p>
                <PreviewTile src={after.url} alt="After" heightClass="h-52 sm:h-56 md:h-64" />
              </div>
            ) : (
              <div className="flex min-h-52 items-center justify-center rounded-2xl border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                No after image is linked to this pair.
              </div>
            )}
          </div>
          <div className="flex items-center justify-center gap-2 border-t border-border/60 py-3 text-xs text-muted-foreground group-hover:text-foreground">
            <Maximize2 className="size-3.5 shrink-0" aria-hidden />
            <span>Click to enlarge</span>
          </div>
        </button>
      </DialogTrigger>

      <DialogContent
        className="max-h-[92vh] gap-0 overflow-hidden border-0 p-0 sm:max-w-6xl"
        showCloseButton
      >
        <div className="border-b bg-popover px-6 py-5 pr-14">
          <DialogHeader>
            <DialogTitle className="text-lg">{candidate.title}</DialogTitle>
            <DialogDescription>
              Full-size comparison. On small screens, switch between Before and After.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="hidden max-h-[calc(92vh-5.5rem)] overflow-y-auto md:grid md:grid-cols-2 md:divide-x md:divide-border">
          <LightboxPane
            src={candidate.beforeAsset.url}
            alt={`${candidate.title} — before, full size`}
            label="Before"
          />
          {after ? (
            <LightboxPane
              src={after.url}
              alt={`${candidate.title} — after, full size`}
              label="After"
            />
          ) : (
            <div className="flex items-center justify-center p-8 text-center text-sm text-muted-foreground">
              No after image for this pair.
            </div>
          )}
        </div>

        <div className="max-h-[calc(92vh-5.5rem)] overflow-y-auto md:hidden">
          {after ? (
            <Tabs defaultValue="before" className="w-full">
              <TabsList className="mx-4 mt-4 w-[calc(100%-2rem)] shrink-0">
                <TabsTrigger value="before" className="flex-1">
                  Before
                </TabsTrigger>
                <TabsTrigger value="after" className="flex-1">
                  After
                </TabsTrigger>
              </TabsList>
              <TabsContent value="before" className="mt-0 px-4 pb-6">
                <div className="relative mt-4 h-[min(65vh,560px)] w-full rounded-2xl bg-muted">
                  <Image
                    src={candidate.beforeAsset.url}
                    alt={`${candidate.title} — before, full size`}
                    fill
                    sizes="100vw"
                    className="object-contain p-4"
                  />
                </div>
              </TabsContent>
              <TabsContent value="after" className="mt-0 px-4 pb-6">
                <div className="relative mt-4 h-[min(65vh,560px)] w-full rounded-2xl bg-muted">
                  <Image
                    src={after.url}
                    alt={`${candidate.title} — after, full size`}
                    fill
                    sizes="100vw"
                    className="object-contain p-4"
                  />
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="p-4 pb-6">
              <div className="relative h-[min(65vh,560px)] w-full rounded-2xl bg-muted">
                <Image
                  src={candidate.beforeAsset.url}
                  alt={`${candidate.title} — before, full size`}
                  fill
                  sizes="100vw"
                  className="object-contain p-4"
                />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
