"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ShieldCheckIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import * as z from "zod/v4"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"

const signInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
})

type SignInValues = z.infer<typeof signInSchema>

interface SignInFormProps {
  callbackUrl: string
  hasGoogleAuth: boolean
}

export function SignInForm({ callbackUrl, hasGoogleAuth }: SignInFormProps) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const [isGooglePending, setIsGooglePending] = useState(false)
  const safeCallbackUrl = callbackUrl.startsWith("/") ? callbackUrl : "/dashboard"

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema as never),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  async function onSubmit(values: SignInValues) {
    setFormError(null)
    const email = values.email.toLowerCase()
    const { error } = await authClient.signIn.email({
      email,
      password: values.password,
      callbackURL: `${window.location.origin}${safeCallbackUrl}`,
    })

    if (error) {
      setFormError(error.message ?? "Invalid email or password.")
      return
    }

    router.replace(safeCallbackUrl)
    router.refresh()
  }

  async function continueWithGoogle() {
    setIsGooglePending(true)
    await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}${safeCallbackUrl}`,
    })
    setIsGooglePending(false)
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-3xl bg-primary text-primary-foreground">
          <ShieldCheckIcon className="size-5" />
        </div>
        <CardTitle className="text-2xl">Admin sign in</CardTitle>
        <CardDescription>
          Sign in with a verified administrator account to continue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup className="gap-5">
            {formError ? (
              <div role="alert" className="rounded-3xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {formError}{" "}
                <Link href={`/verify-email?email=${encodeURIComponent(form.getValues("email"))}`} className="font-medium underline-offset-4 hover:underline">
                  Verify email
                </Link>
              </div>
            ) : null}

            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="email"
                    autoComplete="email"
                    aria-invalid={fieldState.invalid}
                    placeholder="admin@example.com"
                  />
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />

            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="password"
                    autoComplete="current-password"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />

            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Signing in..." : "Sign in"}
            </Button>

            {hasGoogleAuth ? (
              <>
                <FieldSeparator>Or</FieldSeparator>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={isGooglePending}
                  onClick={continueWithGoogle}
                >
                  {isGooglePending ? "Opening Google..." : "Continue with Google"}
                </Button>
              </>
            ) : null}

            <p className="text-center text-sm text-muted-foreground">
              Need the first admin account?{" "}
              <Link href="/sign-up" className="font-medium text-foreground underline-offset-4 hover:underline">
                Create it
              </Link>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
