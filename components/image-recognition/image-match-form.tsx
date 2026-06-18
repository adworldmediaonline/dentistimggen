"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertCircleIcon, Loader2Icon, ScanSearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import * as z from "zod/v4";

import { BeforeAfterLightbox } from "@/components/image-recognition/before-after-lightbox";
import { ImageFileInput } from "@/components/image-recognition/image-file-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import type {
  MatchCandidate,
  MatchResult,
} from "@/lib/image-recognition/types";

const matchResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  searched: z.boolean().optional(),
  candidate: z.custom<MatchCandidate>().optional(),
});

interface FileMatchState {
  id: string;
  file: File;
  previewUrl: string;
  status: "idle" | "uploading" | "success" | "error";
  progress: number;
  result?: MatchResult;
  error?: string;
}

function submitImageMatchWithProgress(
  file: File,
  onProgress: (percent: number) => void,
): Promise<MatchResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/image-recognition/match");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(matchResultSchema.parse(res));
        } catch {
          reject(new Error("Failed to parse response"));
        }
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(matchResultSchema.parse(res));
        } catch {
          reject(new Error(`Request failed with status ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error occurred during upload"));
    };

    const formData = new FormData();
    formData.append("queryImage", file);
    xhr.send(formData);
  });
}

function MatchCandidateCard({ candidate }: { candidate: MatchCandidate }) {
  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold">
            {candidate.title}
          </CardTitle>
          <Badge
            variant="secondary"
            className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 dark:bg-emerald-500/20 border-emerald-500/20 text-xs font-semibold"
          >
            {Math.round(candidate.score * 100)}% similarity
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <BeforeAfterLightbox candidate={candidate} />
        {candidate.notes ? (
          <p className="text-sm text-muted-foreground">{candidate.notes}</p>
        ) : null}
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
  );
}

export function ImageMatchForm() {
  const [matchFiles, setMatchFiles] = useState<FileMatchState[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      matchFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
  }, []);

  const matchMutation = useMutation({
    mutationFn: ({
      file,
      onProgress,
    }: {
      file: File;
      onProgress: (pct: number) => void;
    }) => submitImageMatchWithProgress(file, onProgress),
  });

  function handleFilesChange(files: File[] | File | null) {
    const selectedFiles = Array.isArray(files) ? files : files ? [files] : [];

    matchFiles.forEach((f) => {
      if (
        !selectedFiles.find(
          (sf) => sf.name === f.file.name && sf.size === f.file.size,
        )
      ) {
        URL.revokeObjectURL(f.previewUrl);
      }
    });

    const updated = selectedFiles.map((file) => {
      const existing = matchFiles.find(
        (f) => f.file.name === file.name && f.file.size === file.size,
      );
      if (existing) {
        return existing;
      }
      return {
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: "idle" as const,
        progress: 0,
      };
    });

    setMatchFiles(updated);
    setFileError(null);
  }

  const isAnyMatching = matchFiles.some((f) => f.status === "uploading");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (matchFiles.length === 0) {
      setFileError("Choose at least one before image to search.");
      return;
    }

    matchFiles.forEach((item) => {
      if (item.status === "uploading") return;

      setMatchFiles((prev) =>
        prev.map((f) =>
          f.id === item.id
            ? {
                ...f,
                status: "uploading",
                progress: 0,
                result: undefined,
                error: undefined,
              }
            : f,
        ),
      );

      matchMutation.mutate(
        {
          file: item.file,
          onProgress: (progress) => {
            setMatchFiles((prev) =>
              prev.map((f) => (f.id === item.id ? { ...f, progress } : f)),
            );
          },
        },
        {
          onSuccess: (result) => {
            setMatchFiles((prev) =>
              prev.map((f) =>
                f.id === item.id
                  ? {
                      ...f,
                      status: result.ok ? "success" : "error",
                      progress: 100,
                      result,
                      error: result.ok ? undefined : result.message,
                    }
                  : f,
              ),
            );
            if (result.ok) {
              toast.success(`Match found for ${item.file.name}`);
            } else {
              toast.error(
                result.message || `No match found for ${item.file.name}`,
              );
            }
          },
          onError: (error) => {
            const message =
              error instanceof Error
                ? error.message
                : "Unable to search for a matching image.";
            setMatchFiles((prev) =>
              prev.map((f) =>
                f.id === item.id
                  ? {
                      ...f,
                      status: "error",
                      progress: 100,
                      error: message,
                    }
                  : f,
              ),
            );
            toast.error(`Error matching ${item.file.name}: ${message}`);
          },
        },
      );
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <Card className="h-fit">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-3xl bg-primary text-primary-foreground">
              <ScanSearchIcon className="size-5" />
            </div>
            <div>
              <CardTitle>Find the after images</CardTitle>
              <CardDescription>
                Upload one or more before images to see corresponding after
                images from your saved cases.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup className="gap-5">
              <ImageFileInput
                id="queryImage"
                name="queryImage"
                label="Before images"
                description="Use the same angle, lighting, and crop as your stored before photos for the most reliable match. Max 8."
                error={fileError}
                disabled={isAnyMatching}
                multiple
                onChange={handleFilesChange}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={isAnyMatching || matchFiles.length === 0}
              >
                {isAnyMatching ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin animate-duration-1000" />
                    Finding matches...
                  </>
                ) : (
                  "Show after images"
                )}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {matchFiles.length > 0 ? (
          matchFiles.map((item) => {
            return (
              <div key={item.id} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-muted-foreground truncate max-w-[70%]">
                    Query: {item.file.name}
                  </span>
                  {item.status === "uploading" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] animate-pulse"
                    >
                      Matching... {item.progress}%
                    </Badge>
                  )}
                  {item.status === "success" && (
                    <Badge
                      variant="default"
                      className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 dark:bg-emerald-500/20 border-emerald-500/20 text-[10px]"
                    >
                      Match Complete
                    </Badge>
                  )}
                  {item.status === "error" && (
                    <Badge variant="destructive" className="text-[10px]">
                      No Confident Match
                    </Badge>
                  )}
                  {item.status === "idle" && (
                    <Badge variant="secondary" className="text-[10px]">
                      Pending
                    </Badge>
                  )}
                </div>

                {item.status === "uploading" && (
                  <Card className="p-4 border-dashed">
                    <div className="space-y-4">
                      <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-primary h-full transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>

                      <div className="space-y-3 pt-2">
                        <div className="h-48 w-full rounded-2xl animate-pulse bg-muted flex items-center justify-center">
                          <Loader2Icon className="size-8 animate-spin text-muted-foreground/50" />
                        </div>
                        <div className="h-4 w-3/4 rounded bg-muted/60 animate-pulse" />
                        <div className="h-4 w-1/2 rounded bg-muted/60 animate-pulse" />
                      </div>
                    </div>
                  </Card>
                )}

                {item.status === "success" && item.result?.candidate && (
                  <MatchCandidateCard candidate={item.result.candidate} />
                )}

                {item.status === "error" && (
                  <Card className="border-destructive/20 bg-destructive/5 dark:bg-destructive/10">
                    <CardHeader className="p-4">
                      <div className="flex items-start gap-2 text-destructive">
                        <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                        <div>
                          <CardTitle className="text-sm font-semibold">
                            No confident match
                          </CardTitle>
                          <CardDescription className="text-xs text-destructive/80 mt-1">
                            {item.error ||
                              "The uploaded image did not match any stored dentist cases."}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                )}

                {item.status === "idle" && (
                  <Card className="border-dashed">
                    <CardHeader className="p-4">
                      <CardTitle className="text-sm">Ready to match</CardTitle>
                      <CardDescription className="text-xs">
                        Click &quot;Show after images&quot; to search.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                )}
              </div>
            );
          })
        ) : (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No results yet</CardTitle>
              <CardDescription>
                Upload one or more before images on the left to see the paired
                before and after images here.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
