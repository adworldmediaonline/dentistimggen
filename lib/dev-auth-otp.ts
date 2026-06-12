type StoredOtp = {
  email: string;
  otp: string;
  type: string;
  expiresAt: number;
  createdAt: number;
};

const globalForOtp = globalThis as unknown as {
  authOtps?: Map<string, StoredOtp>;
};

const authOtps = globalForOtp.authOtps ?? new Map<string, StoredOtp>();

if (process.env.NODE_ENV !== "production") {
  globalForOtp.authOtps = authOtps;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function storeAuthOtp(input: {
  email: string;
  otp: string;
  type: string;
  expiresInSeconds: number;
}) {
  const now = Date.now();

  authOtps.set(normalizeEmail(input.email), {
    email: normalizeEmail(input.email),
    otp: input.otp,
    type: input.type,
    createdAt: now,
    expiresAt: now + input.expiresInSeconds * 1000,
  });
}

export function getAuthOtp(email: string) {
  const key = normalizeEmail(email);
  const stored = authOtps.get(key);

  if (!stored) {
    return null;
  }

  if (stored.expiresAt <= Date.now()) {
    authOtps.delete(key);
    return null;
  }

  return stored;
}
