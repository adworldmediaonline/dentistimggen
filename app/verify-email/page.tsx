import { Suspense } from "react"

import { VerifyEmailForm } from "@/components/auth/verify-email-form"

interface VerifyEmailPageProps {
  searchParams: Promise<{
    email?: string
  }>
}

async function VerifyEmailPageContent({ searchParams }: VerifyEmailPageProps) {
  const { email } = await searchParams

  return <VerifyEmailForm email={email ?? ""} />
}

export default function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <Suspense fallback={null}>
          <VerifyEmailPageContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  )
}
