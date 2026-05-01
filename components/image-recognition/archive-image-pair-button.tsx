import { ArchiveIcon } from "lucide-react"

import { SubmitButton } from "@/components/image-recognition/submit-button"
import { archiveImagePair } from "@/lib/image-recognition/actions"

export function ArchiveImagePairButton({ pairId }: { pairId: string }) {
  return (
    <form action={archiveImagePair}>
      <input type="hidden" name="pairId" value={pairId} />
      <SubmitButton pendingLabel="Archiving...">
        <ArchiveIcon className="size-4" />
        Archive
      </SubmitButton>
    </form>
  )
}
