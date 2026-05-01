"use client"

import { useActionState } from "react"
import { RefreshCwIcon } from "lucide-react"

import { SubmitButton } from "@/components/image-recognition/submit-button"
import { backfillMissingEmbeddings } from "@/lib/image-recognition/actions"
import type { ActionResult } from "@/lib/image-recognition/types"

const initialState: ActionResult = {
  ok: false,
  message: "",
}

export function BackfillEmbeddingsButton() {
  const [state, formAction] = useActionState(backfillMissingEmbeddings, initialState)

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <SubmitButton pendingLabel="Indexing batch...">
          <RefreshCwIcon className="size-4" />
          Backfill missing embeddings
        </SubmitButton>
      </form>
      {state.message ? (
        <p className={state.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{state.message}</p>
      ) : null}
    </div>
  )
}
