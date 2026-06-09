import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { admin } from "better-auth/plugins/admin"
import { emailOTP } from "better-auth/plugins/email-otp"

import { prisma } from "@/lib/prisma"

// Local-dev bypass: skip Resend/email verification entirely.
// Set DISABLE_EMAIL_VERIFICATION=true in .env.local to enable.
const disableEmailVerification = process.env.DISABLE_EMAIL_VERIFICATION === "true"

const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET

export const auth = betterAuth({
  appName: "Dentist Image Reco",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: !disableEmailVerification,
    minPasswordLength: 8,
    maxPasswordLength: 256,
    revokeSessionsOnPasswordReset: true,
  },
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {},
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/api/auth/sign-in/email": {
        window: 60,
        max: 5,
      },
      "/api/auth/sign-up/email": {
        window: 60,
        max: 3,
      },
      "/api/auth/email-otp/send-verification-otp": {
        window: 60,
        max: 3,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
      strategy: "jwe",
    },
  },
  account: {
    encryptOAuthTokens: true,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const usersCount = await prisma.user.count()
          const data: { role?: string; emailVerified?: boolean } = {}

          if (usersCount === 1) {
            data.role = "admin"
          }

          // Local-dev bypass: mark every new user verified so the
          // dashboard's emailVerified gate passes without Resend.
          if (disableEmailVerification) {
            data.emailVerified = true
          }

          if (Object.keys(data).length > 0) {
            await prisma.user.update({ where: { id: user.id }, data })
          }
        },
      },
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
    },
  },
  plugins: [
    admin({
      adminRoles: ["admin"],
      defaultRole: "user",
    }),
    emailOTP({
      overrideDefaultEmailVerification: true,
      sendVerificationOnSignUp: !disableEmailVerification,
      expiresIn: 60 * 10,
      allowedAttempts: 5,
      resendStrategy: "reuse",
      storeOTP: "encrypted",
      async sendVerificationOTP({ email, otp, type }) {
        if (disableEmailVerification) {
          // No email service in local-dev mode — print the code to the server log.
          console.log(`[auth-otp] ${type} code for ${email}: ${otp}`)
          return
        }
        const { sendAuthOtpEmail } = await import("@/lib/email")
        await sendAuthOtpEmail({ email, otp, type })
      },
    }),
    nextCookies(),
  ],
})

export type AuthSession = typeof auth.$Infer.Session
export type AuthUser = AuthSession["user"]
