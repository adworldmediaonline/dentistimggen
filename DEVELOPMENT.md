# Development Guide

This project is a Next.js 16 app for dental before/after image workflows. The current implementation is an admin dashboard for uploading pre-treatment and post-treatment teeth images, indexing them, and matching an uploaded pre-treatment image to the closest stored pre-treatment case so the paired post-treatment image can be shown.

## Product Requirements

1. Admin users can upload pre-treatment and post-treatment teeth image pairs.
2. An admin user can upload a pre-treatment teeth image and the app should find the most similar stored pre-treatment image.
3. After finding the closest pre-treatment match, the app should return the matched case's post-treatment image.
4. Future work: the app should be able to generate dental result images through the Gemini API.

## Current Implementation Status

Done:

- Admin authentication, sign-up, sign-in, email OTP verification, and role-based dashboard access are implemented with Better Auth.
- The first registered user is promoted to `admin`.
- Admins can upload pre/post image pairs from `/dashboard/image-pairs`.
- Images are validated as JPEG, PNG, or WebP and capped at 10 MB.
- Uploaded images are stored in Cloudinary.
- Image metadata, pairs, embeddings, and match logs are stored in PostgreSQL.
- `pgvector` is used for similarity search.
- A local 64-dimension perceptual embedding is generated with `sharp`.
- Duplicate active pre-treatment images are rejected by checksum.
- Admins can upload a query image from `/dashboard/image-match`.
- Matching searches stored pre-treatment embeddings and returns the paired post-treatment image when confidence is above the threshold.
- The app also checks whether the query looks more like a stored post-treatment image and rejects it as the wrong image type.
- Admins can archive image pairs and backfill missing embeddings.

Partially done:

- The matching workflow is intentionally admin-only. A separate public or patient-facing upload flow is not planned right now.
- Matching currently returns the best confident match, not a ranked list of multiple similar pre-treatment cases.
- Embeddings are simple local perceptual vectors. They are fast and dependency-light, but they are not dental/clinical AI embeddings.

Not done yet:

- Gemini image generation is not implemented.
- There is no Gemini API client, env configuration, route, server action, prompt design, generation history table, or generated-image storage flow.
- There is no review/approval workflow for generated images.
- There are no automated tests configured.

## Next Work

Current decisions:

- Matching stays admin-only.
- A public `/image-match` route is not applicable right now.
- The next matching enhancement is to return multiple nearest pre-treatment candidates instead of only the top confident match.
- Embedding model improvements are pending review after the current matching quality is checked.
- Automated test coverage is pending review.
- Gemini image generation remains future work.

Recommended next steps:

1. Update the admin match flow to return and display multiple nearest pre-treatment candidates.
2. Keep upload limits, authorization checks, and result states inside the admin dashboard.
3. Revisit the embedding model after testing real dental image matching quality.
4. Add automated coverage if/when the team decides to formalize the current behavior.
5. Add Gemini image generation as a separate feature path after the matching flow is stable.

Future Gemini image generation work should include:

- `GEMINI_API_KEY` and model configuration in environment variables.
- A server-only Gemini client module.
- A prompt template that uses matched pre/post context without claiming clinical certainty.
- Optional reference-image support using the uploaded pre-treatment image and/or matched post-treatment image.
- Generated image storage in Cloudinary.
- Database tables for generation requests, prompts, source match IDs, output image assets, status, errors, and requesting user.
- UI states for queued, generating, completed, failed, and manually reviewed generations.
- Safety copy that generated dental images are illustrative and not a diagnosis or treatment plan.

## Stack

- Next.js `16.2.4` App Router with Cache Components enabled
- React `19.2.4`
- TypeScript with strict mode
- Tailwind CSS v4 and shadcn/Radix UI components
- Better Auth with Drizzle adapter, admin plugin, and email OTP verification
- Drizzle ORM with PostgreSQL and `pgvector`
- Cloudinary for image storage
- Resend for auth OTP emails
- `sharp` for local perceptual image embeddings
- pnpm `10.34.1` via Corepack

## First-Time Setup

Use pnpm through Corepack. If a global `pnpm` binary is not available, `corepack pnpm` works with the pinned package manager in `package.json`.

```bash
corepack prepare pnpm@10.34.1 --activate
corepack pnpm install
```

Run the development server:

```bash
corepack pnpm dev
```

The app starts at `http://localhost:3000`.

## Environment Variables

Create `.env.local` locally. This file is ignored by Git.

Required for normal local development:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
BETTER_AUTH_SECRET="a-random-secret-at-least-32-characters"
BETTER_AUTH_URL="http://localhost:3000"
RESEND_API_KEY="..."
RESEND_FROM_EMAIL="..."
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."
```

Optional:

```bash
BETTER_AUTH_TRUSTED_ORIGINS="http://localhost:3000"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
CLOUDINARY_FOLDER="dentist-image-reco"
GEMINI_API_KEY="future-image-generation-key"
```

Notes:

- Resend is required for email verification OTP delivery.
- Google OAuth is enabled only when both Google env vars are present.
- Cloudinary is required before image upload workflows can succeed.
- `GEMINI_API_KEY` is required for image embedding import and image-match searches.

## Database

The schema lives in `db/schema/`.

Generate Drizzle migrations after schema changes:

```bash
corepack pnpm db:generate
```

Apply migrations locally:

```bash
corepack pnpm db:migrate
```

The image-recognition migration enables `pgvector`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Your local Postgres user/database must support this extension. If migration fails around `vector`, install pgvector for the database server or use a Postgres image/provider that already supports it.

Open Drizzle Studio:

```bash
corepack pnpm db:studio
```

## App Routes

- `/` redirects to `/dashboard`
- `/sign-in` signs in with Better Auth
- `/sign-up` creates an account
- `/verify-email` handles email OTP verification
- `/unauthorized` is shown to signed-in non-admin users
- `/dashboard` is the admin home
- `/dashboard/image-pairs` uploads, lists, archives, and backfills image pairs
- `/dashboard/image-match` searches for a matching before image
- `/api/auth/[...all]` is the Better Auth route handler

The dashboard layout requires:

- a valid session
- a verified email
- `session.user.role === "admin"`

The first created user is promoted to `admin` by the Better Auth database hook in `lib/auth.ts`.

## Image Recognition Flow

Domain code lives in `lib/image-recognition`.

Upload flow:

1. Admin submits a title, optional notes/tags, a before image, and an after image.
2. Files are validated as JPEG, PNG, or WebP and must be smaller than 10 MB.
3. Duplicate active before images are rejected by checksum.
4. Images are uploaded to Cloudinary.
5. A local perceptual embedding is generated with `sharp`.
6. Embeddings are stored as `vector(64)` in Postgres.
7. The pair status changes from `processing` to `ready`.

Matching flow:

1. Admin uploads a query image.
2. The app generates the same 64-dimension embedding.
3. It searches before-image and after-image embeddings using pgvector cosine distance.
4. If the closest after image is stronger than the closest before image, the app rejects the query as the wrong image type.
5. Otherwise, matches above the `0.72` threshold return the paired after image.
6. Searches are logged in `imageMatchLog`.

Constants such as accepted MIME types, max upload size, embedding dimension, and match threshold are in `lib/image-recognition/constants.ts`.

## Future Gemini Image Generation

Gemini generation is a planned feature and should be treated as a separate workflow from matching. Matching should first identify the closest stored pre-treatment image and its known post-treatment image. Gemini can then be introduced to create an illustrative generated outcome, using the uploaded pre-treatment image and matched case context as inputs.

Implementation guidance:

- Keep the Gemini client server-only; do not expose API keys to client components.
- Store generated outputs in Cloudinary like uploaded images.
- Persist generation metadata in Postgres so admins can audit prompts, source images, matched pairs, output URLs, status, and errors.
- Add a manual review state before generated images are shown outside the admin dashboard.
- Make generated results clearly illustrative and avoid presenting them as guaranteed dental treatment outcomes.

## Next.js 16 Notes

`next.config.ts` enables:

- `cacheComponents: true`
- Server Action body limit of `22mb`
- Cloudinary remote image loading

With Cache Components enabled, prefer the Next 16 caching model:

- Use `"use cache"` only for deterministic async data/components that can be cached.
- Do not use request-time APIs such as `headers()` or `cookies()` inside cached scopes.
- Use `connection()` when a page must render at request time even though it does not directly read request APIs.
- Wrap dynamic server content in `Suspense` boundaries so static shells and streamed content behave correctly.

The dashboard pages call `connection()` because they render fresh admin/database state at request time.

Before changing Next.js routing, caching, or config behavior, read the relevant local docs in:

```bash
node_modules/next/dist/docs/
```

This is required because the installed Next.js version has breaking changes compared with older versions.

## Code Organization

- `app/` contains App Router routes.
- `components/ui/` contains shadcn/Radix primitives.
- `components/auth/` contains auth forms.
- `components/image-recognition/` contains upload, match, archive, backfill, and lightbox UI.
- `components/app-sidebar.tsx`, `components/nav-main.tsx`, `components/nav-user.tsx`, and `components/site-header.tsx` build the dashboard shell.
- `lib/auth.ts` configures Better Auth server behavior.
- `lib/auth-client.ts` configures Better Auth client plugins.
- `lib/db.ts` creates the Drizzle/Postgres connection.
- `lib/email.ts` sends OTP emails with Resend.
- `lib/image-recognition/` owns image validation, storage, embedding, search, and server actions.
- `db/migrations/` contains database migrations.

## Common Commands

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm lint
corepack pnpm build
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:studio
corepack pnpm db:import-cloudinary-pairs
```

There is no test script configured yet. Use lint and production build as the current baseline checks.

## Development Workflow

1. Pull latest code.
2. Run `corepack pnpm install`.
3. Ensure `.env.local` has the required variables.
4. Run `corepack pnpm db:migrate`.
5. Run `corepack pnpm db:generate` if the schema changed.
6. Run `corepack pnpm dev`.
7. Before handing off changes, run:

```bash
corepack pnpm lint
corepack pnpm build
```

## Troubleshooting

`pnpm: command not found`

Use `corepack pnpm ...` or enable Corepack shims if your machine permits it.

`DATABASE_URL is required to connect to Postgres`

Add `DATABASE_URL` to `.env.local`. Migrations and runtime pages need a real database.

`type "vector" does not exist` or migration fails on pgvector

Install/enable pgvector in Postgres. The migration runs `CREATE EXTENSION IF NOT EXISTS vector`, but the database user still needs permission and the server must have the extension available.

Auth OTP emails fail

Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. The email sender throws when either is missing.

Image uploads fail

Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`. `CLOUDINARY_FOLDER` is optional.

Dashboard redirects to `/unauthorized`

The signed-in user is not an admin. The first registered user becomes admin automatically; later users need their `role` set to `admin`.

Cloudinary import finds no pairs

Check that `CLOUDINARY_FOLDER` points to the folder containing `before-*` and `after-*` assets grouped under the same pair folder.
