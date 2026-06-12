import { getAuthOtp } from "@/lib/dev-auth-otp";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const email = url.searchParams.get("email");

  if (!email) {
    return Response.json({ error: "Email is required" }, { status: 400 });
  }

  const otp = getAuthOtp(email);

  return Response.json({
    otp: otp?.otp ?? null,
    type: otp?.type ?? null,
    expiresAt: otp ? new Date(otp.expiresAt).toISOString() : null,
  });
}
