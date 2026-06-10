import { Suspense } from "react"

import { SignInForm } from "@/components/auth/sign-in-form"

interface SignInPageProps {
  searchParams: Promise<{
    callbackUrl?: string
  }>
}

async function SignInPageContent({ searchParams }: SignInPageProps) {
  const { callbackUrl } = await searchParams

  return <SignInForm callbackUrl={callbackUrl ?? "/dashboard"} />
}

export default function SignInPage({ searchParams }: SignInPageProps) {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <Suspense fallback={null}>
          <SignInPageContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  )
}
