import { SignUpForm } from "@/components/auth/sign-up-form"

export default function SignUpPage() {
  const hasGoogleAuth = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <SignUpForm hasGoogleAuth={hasGoogleAuth} />
      </div>
    </main>
  )
}
