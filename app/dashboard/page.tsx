import { connection } from "next/server"
import { ImagesIcon, SearchCheckIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function Page() {
  await connection()

  return (
    <main className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage dental image pairs and run before-to-after matching.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <ImagesIcon className="mb-2 size-8 text-primary" aria-hidden />
              <CardTitle>Image pairs</CardTitle>
              <CardDescription>Upload and manage before and after cases.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href="/dashboard/image-pairs">Open</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <SearchCheckIcon className="mb-2 size-8 text-primary" aria-hidden />
              <CardTitle>Find match</CardTitle>
              <CardDescription>Upload a before image to see the corresponding after image.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href="/dashboard/image-match">Open</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
