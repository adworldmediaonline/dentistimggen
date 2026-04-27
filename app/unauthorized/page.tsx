import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-2xl">Admin access required</CardTitle>
          <CardDescription>
            Your account is signed in, but it does not have permission to open the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/sign-in">Use another account</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
