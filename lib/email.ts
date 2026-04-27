import { Resend } from "resend"

type AuthEmailType = "sign-in" | "email-verification" | "forget-password" | "change-email"

interface SendAuthOtpEmailInput {
  email: string
  otp: string
  type: AuthEmailType
}

const authEmailCopy: Record<AuthEmailType, { subject: string; heading: string; body: string }> = {
  "sign-in": {
    subject: "Your sign-in code",
    heading: "Sign in to Dentist Image Reco",
    body: "Use this one-time code to finish signing in.",
  },
  "email-verification": {
    subject: "Verify your email",
    heading: "Verify your admin account",
    body: "Use this code to verify your email and continue to the dashboard.",
  },
  "forget-password": {
    subject: "Reset your password",
    heading: "Reset your password",
    body: "Use this one-time code to reset your password.",
  },
  "change-email": {
    subject: "Confirm your email change",
    heading: "Confirm your new email",
    body: "Use this one-time code to confirm your email change.",
  },
}

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendAuthOtpEmail({ email, otp, type }: SendAuthOtpEmailInput) {
  const from = process.env.RESEND_FROM_EMAIL

  if (!process.env.RESEND_API_KEY || !from) {
    throw new Error("Resend is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.")
  }

  const copy = authEmailCopy[type]
  const { error } = await resend.emails.send(
    {
      from,
      to: [email],
      subject: copy.subject,
      html: `
      <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #18181b;">
        <p style="margin: 0 0 12px; color: #71717a;">Dentist Image Reco</p>
        <h1 style="margin: 0 0 12px; font-size: 24px; line-height: 1.25;">${copy.heading}</h1>
        <p style="margin: 0 0 20px;">${copy.body}</p>
        <p style="margin: 0 0 20px; font-size: 32px; font-weight: 700; letter-spacing: 0.24em;">${otp}</p>
        <p style="margin: 0; color: #71717a;">This code expires shortly. If you did not request it, you can ignore this email.</p>
      </div>
    `,
      text: `${copy.heading}\n\n${copy.body}\n\nCode: ${otp}\n\nThis code expires shortly. If you did not request it, you can ignore this email.`,
    },
    {
      idempotencyKey: `auth-otp/${type}/${email}/${otp}`,
    }
  )

  if (error) {
    throw new Error(error.message)
  }
}
