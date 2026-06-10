import "server-only"

import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"
import { cookies, headers } from "next/headers"

import { collections, ensureIndexes, type SessionDoc, type UserDoc } from "@/lib/mongodb"

const scrypt = promisify(scryptCb)

export const SESSION_COOKIE = "dentist_session"
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 256

// ── Public session shape (mirrors what the app reads off Better Auth) ──

export interface AuthUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  role: string
}

export interface AuthSession {
  user: AuthUser
  session: { id: string; expiresAt: Date }
}

function toAuthUser(doc: UserDoc): AuthUser {
  return {
    id: doc._id,
    name: doc.name,
    email: doc.email,
    emailVerified: doc.emailVerified,
    image: doc.image,
    role: doc.role,
  }
}

// ── Password hashing (scrypt, salt-prefixed) ──────────────────────────

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = (await scrypt(password, salt, 64)) as Buffer
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$")
  if (scheme !== "scrypt" || !saltHex || !hashHex) {
    return false
  }
  const salt = Buffer.from(saltHex, "hex")
  const expected = Buffer.from(hashHex, "hex")
  const derived = (await scrypt(password, salt, expected.length)) as Buffer
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}

// ── Session storage ───────────────────────────────────────────────────

async function clientMeta() {
  const h = await headers()
  return {
    ipAddress: h.get("x-forwarded-for") ?? h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
  }
}

async function createSession(userId: string): Promise<SessionDoc> {
  const { sessions } = await collections()
  const meta = await clientMeta()
  const now = new Date()
  const session: SessionDoc = {
    _id: randomBytes(32).toString("hex"),
    userId,
    expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000),
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    createdAt: now,
  }
  await sessions.insertOne(session)

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, session._id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  })

  return session
}

export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) {
    return null
  }

  const { sessions, users } = await collections()
  const session = await sessions.findOne({ _id: token })
  if (!session || session.expiresAt.getTime() < Date.now()) {
    return null
  }

  const user = await users.findOne({ _id: session.userId })
  if (!user) {
    return null
  }

  return {
    user: toAuthUser(user),
    session: { id: session._id, expiresAt: session.expiresAt },
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (token) {
    const { sessions } = await collections()
    await sessions.deleteOne({ _id: token })
  }
  cookieStore.delete(SESSION_COOKIE)
}

// ── Sign up / sign in ─────────────────────────────────────────────────

export interface AuthResult {
  ok: boolean
  message?: string
  user?: AuthUser
}

export async function signUp(input: {
  name: string
  email: string
  password: string
}): Promise<AuthResult> {
  await ensureIndexes()
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  const { password } = input

  if (name.length < 2) {
    return { ok: false, message: "Enter your full name." }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Enter a valid email address." }
  }
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }

  const { users } = await collections()
  const existing = await users.findOne({ email })
  if (existing) {
    return { ok: false, message: "An account with this email already exists." }
  }

  // First registered user becomes admin (preserves original behavior).
  const isFirstUser = (await users.estimatedDocumentCount()) === 0
  const now = new Date()
  const doc: UserDoc = {
    _id: randomUUID(),
    name,
    email,
    emailVerified: true, // no email verification step in this build
    image: null,
    role: isFirstUser ? "admin" : "user",
    passwordHash: await hashPassword(password),
    createdAt: now,
    updatedAt: now,
  }

  try {
    await users.insertOne(doc)
  } catch {
    // Unique-index race: another request created the same email first.
    return { ok: false, message: "An account with this email already exists." }
  }

  await createSession(doc._id)
  return { ok: true, user: toAuthUser(doc) }
}

export async function signIn(input: { email: string; password: string }): Promise<AuthResult> {
  await ensureIndexes()
  const email = input.email.trim().toLowerCase()

  const { users } = await collections()
  const user = await users.findOne({ email })
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    return { ok: false, message: "Invalid email or password." }
  }

  await createSession(user._id)
  return { ok: true, user: toAuthUser(user) }
}

// ── Guards used by server actions ─────────────────────────────────────

export async function requireAdminUserId(): Promise<string> {
  const session = await getSession()
  if (!session || session.user.role !== "admin") {
    throw new Error("Only administrators can perform this action.")
  }
  return session.user.id
}
