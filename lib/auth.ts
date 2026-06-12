import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { emailOTP } from "better-auth/plugins/email-otp";
import { count, eq } from "drizzle-orm";

import * as schema from "@/db/schema";
import { db } from "@/lib/db";
import { storeAuthOtp } from "@/lib/dev-auth-otp";

const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

const isProd = process.env.NODE_ENV === "production";

export const auth = betterAuth({
  appName: "Dentist Image Reco",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    camelCase: true,
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
        max: isProd ? 5 : 100,
      },
      "/api/auth/sign-up/email": {
        window: 60,
        max: isProd ? 5 : 100,
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
          const [{ value: usersCount }] = await db
            .select({ value: count() })
            .from(schema.user);
          const data: { role?: string } = {};

          if (usersCount === 1) {
            data.role = "admin";
          }

          if (Object.keys(data).length > 0) {
            await db
              .update(schema.user)
              .set(data)
              .where(eq(schema.user.id, user.id));
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
      resendStrategy: "rotate",
      storeOTP: "encrypted",
      async sendVerificationOTP({ email, otp, type }) {
        storeAuthOtp({
          email,
          otp,
          type,
          expiresInSeconds: 60 * 10,
        });
      },
    }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = AuthSession["user"];
