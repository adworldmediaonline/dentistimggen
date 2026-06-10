"use client"

import { signInAction, signOutAction, signUpAction } from "@/lib/auth-actions"

interface ClientResult {
  error: { message: string } | null
}

/**
 * Minimal client surface that mirrors the parts of the old Better Auth client
 * the UI used (`authClient.signIn.email`, `authClient.signUp.email`,
 * `authClient.signOut`). Backed by server actions over plain email/password.
 */
export const authClient = {
  signUp: {
    async email(input: { name: string; email: string; password: string }): Promise<ClientResult> {
      const result = await signUpAction({
        name: input.name,
        email: input.email,
        password: input.password,
      })
      return { error: result.ok ? null : { message: result.message ?? "Sign up failed." } }
    },
  },
  signIn: {
    async email(input: { email: string; password: string }): Promise<ClientResult> {
      const result = await signInAction({ email: input.email, password: input.password })
      return { error: result.ok ? null : { message: result.message ?? "Sign in failed." } }
    },
  },
  async signOut(): Promise<void> {
    await signOutAction()
  },
}
