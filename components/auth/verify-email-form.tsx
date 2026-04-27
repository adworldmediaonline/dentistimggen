"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { KeyRoundIcon } from "lucide-react"
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { authClient } from "@/lib/auth-client"

const verifyEmailSchema = z.object({
  email: z.email("Enter the email you registered with."),
  otp: z.string().length(6, "Enter the 6-digit code."),
})

type VerifyEmailValues = z.infer<typeof verifyEmailSchema>

export function VerifyEmailForm({ email }: { email: string }) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isResending, setIsResending] = useState(false)

  const form = useForm<VerifyEmailValues>({
    resolver: zodResolver(verifyEmailSchema as never),
    defaultValues: {
      email,
      otp: "",
    },
  })

  async function onSubmit(values: VerifyEmailValues) {
    setFormError(null)
    setNotice(null)
    const { error } = await authClient.emailOtp.verifyEmail({
      email: values.email.toLowerCase(),
      otp: values.otp,
    })

    if (error) {
      setFormError(error.message ?? "The verification code is invalid or expired.")
      return
    }

    router.replace("/dashboard")
    router.refresh()
  }

  async function resendCode() {
    setIsResending(true)
    setFormError(null)
    setNotice(null)

    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: form.getValues("email").toLowerCase(),
      type: "email-verification",
    })

    setIsResending(false)

    if (error) {
      setFormError(error.message ?? "We could not send a new code.")
      return
    }

    setNotice("A fresh verification code has been sent.")
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-3xl bg-primary text-primary-foreground">
          <KeyRoundIcon className="size-5" />
        </div>
        <CardTitle className="text-2xl">Verify your email</CardTitle>
        <CardDescription>
          Enter the one-time code sent to your email to unlock the admin dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup className="gap-5">
            {formError ? (
              <div role="alert" className="rounded-3xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {formError}
              </div>
            ) : null}
            {notice ? (
              <div role="status" className="rounded-3xl border bg-muted/60 p-3 text-sm">
                {notice}
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
                  />
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />

            <Controller
              name="otp"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Verification code</FieldLabel>
                  <InputOTP
                    id={field.name}
                    maxLength={6}
                    value={field.value}
                    onChange={field.onChange}
                    aria-invalid={fieldState.invalid}
                    containerClassName="justify-center"
                  >
                    <InputOTPGroup>
                      {Array.from({ length: 6 }).map((_, index) => (
                        <InputOTPSlot key={index} index={index} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                  <FieldDescription>Codes expire after 10 minutes.</FieldDescription>
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />

            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Verifying..." : "Verify and open dashboard"}
            </Button>
            <Button type="button" variant="outline" className="w-full" disabled={isResending} onClick={resendCode}>
              {isResending ? "Sending..." : "Resend code"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Wrong account?{" "}
              <Link href="/sign-in" className="font-medium text-foreground underline-offset-4 hover:underline">
                Back to sign in
              </Link>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
