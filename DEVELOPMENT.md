# Development Guide

This project is a Next.js 16 app for dental before/after image workflows. It is an admin dashboard for uploading pre-treatment and post-treatment teeth images, indexing them, and matching an uploaded pre-treatment image to the closest stored pre-treatment case so the paired post-treatment image can be shown.

> **Stack note:** This build runs on **MongoDB** with **custom email/password authentication**. There is **no Prisma, no Postgres, no Better Auth, and no email sending (Resend)**. The previous Postgres + Better Auth + Resend implementation is preserved on the `backup/postgres-betterauth` branch.

## Product Requirements

1. Admin users can upload pre-treatment and post-treatment teeth image pairs.
2. An admin user can upload a pre-treatment teeth image and the app finds the most similar stored pre-treatment image.
3. After finding the closest pre-treatment match, the app returns the matched case's post-treatment image.
4. Future work: generate dental result images through the Gemini API.

## Current Implementation Status

Done:

- Email/password authentication, sign-up, and sign-in with a custom auth layer (no email verification step).
- The first registered user is promoted to `admin` automatically.
- Sessions are stored in MongoDB and tracked with an httpOnly cookie.
- Admins can upload pre/post image pairs from `/dashboard/image-pairs`.
- Images are validated as JPEG, PNG, or WebP and capped at 10 MB.
- Uploaded images are stored in Cloudinary.
- Image metadata, pairs, embeddings, and match logs are stored in MongoDB.
- A local 64-dimension perceptual embedding is generated with `sharp`.
- Similarity search ranks stored embeddings by cosine similarity in application code.
- Duplicate active pre-treatment images are rejected by checksum.
- Admins can upload a query image from `/dashboard/image-match`.
- Matching returns the paired post-treatment image when confidence is above the threshold.
- The app also checks whether the query looks more like a stored post-treatment image and rejects it as the wrong image type.
- Admins can archive image pairs and backfill missing embeddings.

Not done yet:

- Gemini image generation is not implemented.
- There is no review/approval workflow for generated images.
- There are no automated tests configured.

## Stack

- Next.js `16.2.4` App Router with Cache Components enabled
- React `19.2.4`
- TypeScript with strict mode
- Tailwind CSS v4 and shadcn/Radix UI components
- **MongoDB** via the official `mongodb` Node.js driver
- **Custom email/password auth** (scrypt password hashing, DB-backed cookie sessions)
- Cloudinary for image storage
- `sharp` for local perceptual image embeddings
- pnpm `10.34.1` via Corepack

## First-Time Setup

Use pnpm through Corepack. If a global `pnpm` binary is not available, `corepack pnpm` works.

```bash
corepack pnpm install
```

Start a local MongoDB instance (Docker):

```bash
docker run -d --name dentist-mongo -p 27017:27017 mongo:7
```

Run the development server:

```bash
corepack pnpm dev
```

The app starts at `http://localhost:3000`.

Collection indexes (including the unique email index and a session TTL index) are created automatically on first auth/image operation via `ensureIndexes()` in `lib/mongodb.ts` — no migration step is required.

## Environment Variables

Create `.env.local` locally. This file is ignored by Git.

Required:

```bash
MONGODB_URI="mongodb://localhost:27017"
MONGODB_DB="dentistimgreco"
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."
```

Optional:

```bash
BETTER_AUTH_URL="http://localhost:3000"   # app URL; influences the secure-cookie decision
CLOUDINARY_FOLDER="dentist-image-reco"
```

Notes:

- `MONGODB_URI` is required at runtime; `lib/mongodb.ts` throws on startup if it is missing.
- `MONGODB_DB` defaults to `dentistimgreco` if not set.
- Cloudinary is required before image upload workflows can succeed.
- There is no email service. Sign-up logs the user in immediately; there is no OTP/verification email.
- Secure cookies are enabled only when `NODE_ENV === "production"`.

## Database

There is no schema migration tool. Collections are created lazily by MongoDB on first write, and indexes are ensured by `ensureIndexes()`.

Collections (defined in `lib/mongodb.ts`):

- `users` — `{ _id, name, email, emailVerified, image, role, passwordHash, createdAt, updatedAt }`, unique index on `email`.
- `sessions` — `{ _id (session token), userId, expiresAt, ipAddress, userAgent, createdAt }`, TTL index on `expiresAt`.
- `imagePairs` — `{ _id, title, notes, tags, status, createdById, createdAt, updatedAt }`.
- `imageAssets` — `{ _id, pairId, kind, storageProvider, storageKey, url, secureUrl, checksum, mimeType, byteSize, width, height, ... }`.
- `imageEmbeddings` — `{ _id, pairId, assetId, model, dimension, status, embedding (number[64]), error, ... }`, unique index on `assetId`.
- `imageMatchLogs` — `{ _id, requestedById, matchedPairId, queryChecksum, queryMimeType, queryByteSize, similarityScore, status, createdAt }`.

Inspect data with `mongosh`:

```bash
docker exec -it dentist-mongo mongosh dentistimgreco
```

## App Routes

- `/` redirects to `/dashboard`
- `/sign-in` signs in with email/password
- `/sign-up` creates an account (first user becomes admin)
- `/unauthorized` is shown to signed-in non-admin users
- `/dashboard` is the admin home
- `/dashboard/image-pairs` uploads, lists, archives, and backfills image pairs
- `/dashboard/image-match` searches for a matching before image

The dashboard layout requires:

- a valid session
- `session.user.role === "admin"`

(There is no email-verification gate.)

## Authentication

Auth is implemented from scratch — no Better Auth.

- `lib/auth.ts` (server-only) — password hashing (scrypt), session create/read/destroy, `signUp`, `signIn`, and the `requireAdminUserId()` guard used by server actions. Exposes `getSession()` for the dashboard layout.
- `lib/auth-actions.ts` — `"use server"` actions: `signUpAction`, `signInAction`, `signOutAction`.
- `lib/auth-client.ts` — a thin client object (`authClient.signUp.email`, `authClient.signIn.email`, `authClient.signOut`) that calls the server actions, preserving the call shape the UI already used.

Session model: a random 32-byte token is stored as the session `_id` in MongoDB and set as the `dentist_session` httpOnly cookie. Sessions live 7 days; expired ones are reaped by the TTL index.

First-user-is-admin: `signUp()` checks whether the `users` collection is empty and assigns `role: "admin"` to the first account, `role: "user"` to everyone after.

## Image Recognition Flow

Domain code lives in `lib/image-recognition`.

Upload flow:

1. Admin submits a title, optional notes/tags, a before image, and an after image.
2. Files are validated as JPEG, PNG, or WebP and must be smaller than 10 MB.
3. Duplicate active before images are rejected by checksum.
4. Images are uploaded to Cloudinary.
5. A local perceptual embedding is generated with `sharp` (64-dim, L2-normalized).
6. Embeddings are stored as a `number[]` in the `imageEmbeddings` collection.
7. The pair status changes from `processing` to `ready`.

Matching flow:

1. Admin uploads a query image.
2. The app generates the same 64-dimension embedding.
3. `findClosestBeforeImages` / `findClosestAfterImages` load ready embeddings and rank them by cosine similarity in application code (`cosineSimilarity` in `embedding-service.ts`).
4. If the closest after image is stronger than the closest before image, the app rejects the query as the wrong image type.
5. Otherwise, matches above the `0.72` threshold return the paired after image.
6. Searches are logged in `imageMatchLogs`.

Why app-side similarity instead of a vector index: embeddings are only 64-dim and the dataset is small and admin-curated, so ranking in JS is fast and avoids requiring MongoDB Atlas `$vectorSearch`. If the dataset grows large, migrate to an Atlas Vector Search index.

Constants such as accepted MIME types, max upload size, embedding dimension, and match threshold are in `lib/image-recognition/constants.ts`.

## Future Gemini Image Generation

Gemini generation is planned future work, separate from matching. Matching should first identify the closest stored pre-treatment image and its known post-treatment image; Gemini can then create an illustrative generated outcome from the uploaded pre-treatment image and matched case context.

Guidance:

- Keep the Gemini client server-only; do not expose API keys to client components.
- Store generated outputs in Cloudinary like uploaded images.
- Persist generation metadata in MongoDB (prompts, source images, matched pairs, output URLs, status, errors).
- Add a manual review state before generated images are shown outside the admin dashboard.
- Make generated results clearly illustrative, not guaranteed treatment outcomes.

## Next.js 16 Notes

`next.config.ts` enables:

- `cacheComponents: true`
- Server Action body limit of `22mb`
- Cloudinary remote image loading

With Cache Components enabled, prefer the Next 16 caching model:

- Use `"use cache"` only for deterministic async data/components that can be cached.
- Do not use request-time APIs such as `headers()` or `cookies()` inside cached scopes. (Auth reads cookies, so auth-dependent code must stay dynamic.)
- Use `connection()` when a page must render at request time. The dashboard pages call `connection()` because they render fresh admin/database state.
- Wrap dynamic server content in `Suspense` boundaries.

Before changing Next.js routing, caching, or config behavior, read the local docs in `node_modules/next/dist/docs/` — the installed Next.js version has breaking changes compared with older versions.

## Code Organization

- `app/` contains App Router routes.
- `components/ui/` contains shadcn/Radix primitives.
- `components/auth/` contains the sign-in and sign-up forms.
- `components/image-recognition/` contains upload, match, archive, backfill, and lightbox UI.
- `lib/mongodb.ts` — MongoDB client, collection accessors, document types, and index bootstrap.
- `lib/auth.ts` — server-only custom auth (hashing, sessions, guards).
- `lib/auth-actions.ts` — server actions for sign-up/sign-in/sign-out.
- `lib/auth-client.ts` — client wrapper over the auth actions.
- `lib/image-recognition/` — image validation, storage, embedding, similarity search, and server actions.

## Common Commands

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm lint
corepack pnpm build
```

There is no test script configured. Use lint and a production build as the baseline checks.

## Development Workflow

1. Pull latest code.
2. Run `corepack pnpm install`.
3. Ensure MongoDB is running (`docker start dentist-mongo` or the `docker run` command above).
4. Ensure `.env.local` has the required variables.
5. Run `corepack pnpm dev`.
6. Before handing off changes, run:

```bash
corepack pnpm lint
corepack pnpm build
```

## Troubleshooting

`MONGODB_URI is not set`

Add `MONGODB_URI` to `.env.local` and restart the dev server.

`MongoServerSelectionError` / `ECONNREFUSED 127.0.0.1:27017`

MongoDB is not reachable. Start the container: `docker start dentist-mongo` (or run the `docker run` command in First-Time Setup).

Image uploads fail

Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`. `CLOUDINARY_FOLDER` is optional.

Dashboard redirects to `/unauthorized`

The signed-in user is not an admin. The first registered user becomes admin automatically; later users need their `role` set to `admin` (update the user document in MongoDB).

Want the old Postgres / Better Auth / Resend setup back

Check out the `backup/postgres-betterauth` branch.
