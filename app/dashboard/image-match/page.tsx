import { connection } from "next/server"

import { ImageMatchForm } from "@/components/image-recognition/image-match-form"

export default async function ImageMatchPage() {
  await connection()

  return (
    <main className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-6 p-4 md:p-6">
        <ImageMatchForm />
      </div>
    </main>
  )
}
