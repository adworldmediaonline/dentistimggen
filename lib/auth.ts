import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { admin } from "better-auth/plugins/admin"
import { emailOTP } from "better-auth/plugins/email-otp"

import { sendAuthOtpEmail } from "@/lib/email"
import { prisma } from "@/lib/prisma"

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
    requireEmailVerification: true,
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

          if (usersCount === 1) {
            await prisma.user.update({
              where: { id: user.id },
              data: { role: "admin" },
            })
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
      sendVerificationOnSignUp: true,
      expiresIn: 60 * 10,
      allowedAttempts: 5,
      resendStrategy: "reuse",
      storeOTP: "encrypted",
      async sendVerificationOTP({ email, otp, type }) {
        await sendAuthOtpEmail({ email, otp, type })
      },
    }),
    nextCookies(),
  ],
})

export type AuthSession = typeof auth.$Infer.Session
export type AuthUser = AuthSession["user"]
