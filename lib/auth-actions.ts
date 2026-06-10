"use server"

import { destroySession, signIn, signUp, type AuthResult } from "@/lib/auth"

export async function signUpAction(input: {
  name: string
  email: string
  password: string
}): Promise<AuthResult> {
  return signUp(input)
}

export async function signInAction(input: {
  email: string
  password: string
}): Promise<AuthResult> {
  return signIn(input)
}

export async function signOutAction(): Promise<void> {
  await destroySession()
}
