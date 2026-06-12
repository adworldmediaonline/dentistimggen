import "dotenv/config";

import { createHash } from "node:crypto";

import { generateId } from "@better-auth/core/utils/id";
import { GoogleGenAI } from "@google/genai";
import { v2 as cloudinary } from "cloudinary";
import pg from "pg";
import * as z from "zod/v4";

const { Pool } = pg;

const EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_DIMENSION = 768;
const IMAGE_PAIR_STATUS_READY = "ready";
const IMAGE_STORAGE_PROVIDER = "cloudinary";

const cloudinaryResourceSchema = z.object({
  public_id: z.string().min(1),
  secure_url: z.url(),
  bytes: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  format: z.string().min(1),
  created_at: z.string().min(1),
});

const cloudinaryListResponseSchema = z.object({
  resources: z.array(cloudinaryResourceSchema),
  next_cursor: z.string().optional(),
});

const geminiEmbeddingResponseSchema = z
  .object({
    embedding: z
      .object({
        values: z.array(z.number()),
      })
      .optional(),
    embeddings: z
      .array(
        z.object({
          values: z.array(z.number()),
        }),
      )
      .optional(),
  })
  .transform(
    (value) => value.embedding?.values ?? value.embeddings?.[0]?.values,
  )
  .pipe(z.array(z.number()).length(EMBEDDING_DIMENSION));

const imageResponseSchema = z.object({
  buffer: z.instanceof(Buffer),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().positive(),
});

let geminiClient = null;

/**
 * Retry a function with exponential backoff.
 * @param {() => Promise<T>} fn
 * @param {{ retries?: number; baseDelayMs?: number; label?: string }} [opts]
 * @returns {Promise<T>}
 */
async function withRetry(
  fn,
  { retries = 4, baseDelayMs = 1500, label = "operation" } = {},
) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable =
        err?.cause?.code === "ECONNRESET" ||
        err?.cause?.code === "ECONNREFUSED" ||
        err?.cause?.code === "ETIMEDOUT" ||
        err?.status === 429 ||
        err?.status >= 500;

      if (!isRetryable || attempt === retries) {
        throw err;
      }

      const delayMs = baseDelayMs * 2 ** attempt + Math.random() * 500;
      console.warn(
        `[retry] ${label} failed (attempt ${attempt + 1}/${retries}): ${
          err?.cause?.code ?? err?.message
        }. Retrying in ${Math.round(delayMs)}ms…`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function getGeminiClient() {
  geminiClient ??= new GoogleGenAI({ apiKey: requiredEnv("GEMINI_API_KEY") });
  return geminiClient;
}

function getMimeType(resource) {
  if (resource.format === "jpg" || resource.format === "jpeg") {
    return "image/jpeg";
  }

  if (resource.format === "png") {
    return "image/png";
  }

  if (resource.format === "webp") {
    return "image/webp";
  }

  throw new Error(`Unsupported Cloudinary image format: ${resource.format}`);
}

function getKind(publicId) {
  const fileName = publicId.split("/").at(-1) ?? "";

  if (fileName.startsWith("before-")) {
    return "before";
  }

  if (fileName.startsWith("after-")) {
    return "after";
  }

  return null;
}

function groupCloudinaryPairs(resources, folder) {
  const groups = new Map();

  for (const resource of resources) {
    const kind = getKind(resource.public_id);

    if (!kind) {
      continue;
    }

    const parts = resource.public_id.split("/");
    const pairId = parts.length >= 3 ? parts[1] : null;

    if (!pairId || parts[0] !== folder) {
      continue;
    }

    const group = groups.get(pairId) ?? { pairId, before: null, after: null };
    group[kind] = resource;
    groups.set(pairId, group);
  }

  return [...groups.values()]
    .filter((group) => group.before && group.after)
    .sort((a, b) => a.pairId.localeCompare(b.pairId));
}

async function listCloudinaryResources(folder) {
  let nextCursor;
  const resources = [];

  do {
    const response = await cloudinary.api.resources({
      resource_type: "image",
      type: "upload",
      prefix: folder,
      max_results: 100,
      next_cursor: nextCursor,
    });
    const parsed = cloudinaryListResponseSchema.parse(response);

    resources.push(...parsed.resources);
    nextCursor = parsed.next_cursor;
  } while (nextCursor);

  return resources;
}

async function downloadImage(resource) {
  return withRetry(
    async () => {
      const response = await fetch(resource.secure_url);

      if (!response.ok) {
        const err = new Error(
          `Failed to download ${resource.public_id}: ${response.status}`,
        );
        err.status = response.status;
        throw err;
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      return imageResponseSchema.parse({
        buffer,
        mimeType: getMimeType(resource),
        byteSize: buffer.length,
      });
    },
    { label: `downloadImage(${resource.public_id})` },
  );
}

async function generateGeminiEmbedding(image) {
  return withRetry(
    async () => {
      const response = await getGeminiClient().models.embedContent({
        model: EMBEDDING_MODEL,
        contents: [
          {
            inlineData: {
              mimeType: image.mimeType,
              data: image.buffer.toString("base64"),
            },
          },
        ],
        config: {
          outputDimensionality: EMBEDDING_DIMENSION,
        },
      });

      return geminiEmbeddingResponseSchema.parse(response);
    },
    {
      label: `generateGeminiEmbedding(${image.mimeType}, ${image.byteSize}B)`,
      baseDelayMs: 2000,
    },
  );
}

function toPgVector(vector) {
  return `[${vector.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

async function getImportUserId(pool) {
  const preferredEmail =
    process.env.IMPORT_ADMIN_EMAIL ?? process.env.TEST_ADMIN_EMAIL;

  if (preferredEmail) {
    const byEmail = await pool.query(
      'select id from "user" where lower(email) = lower($1) limit 1',
      [preferredEmail],
    );

    if (byEmail.rows[0]?.id) {
      return byEmail.rows[0].id;
    }
  }

  const admin = await pool.query(
    'select id from "user" where role = $1 order by "createdAt" asc limit 1',
    ["admin"],
  );

  if (admin.rows[0]?.id) {
    return admin.rows[0].id;
  }

  throw new Error(
    "No admin user found. Create one first or set IMPORT_ADMIN_EMAIL to an existing user.",
  );
}

async function upsertPair(
  pool,
  { pair, createdById, before, after, beforeEmbedding, afterEmbedding },
) {
  await pool.query("begin");

  try {
    await pool.query(
      `
        insert into "imagePair" (
          id,
          title,
          notes,
          tags,
          status,
          "createdById",
          "createdAt",
          "updatedAt"
        )
        values ($1, $2, $3, $4, $5, $6, now(), now())
        on conflict (id) do update
        set
          title = excluded.title,
          notes = excluded.notes,
          tags = excluded.tags,
          status = excluded.status,
          "updatedAt" = now()
      `,
      [
        pair.pairId,
        `Imported case ${pair.pairId}`,
        "Imported from Cloudinary.",
        ["cloudinary-import"],
        IMAGE_PAIR_STATUS_READY,
        createdById,
      ],
    );

    const assets = [
      {
        kind: "before",
        resource: pair.before,
        image: before,
        embedding: beforeEmbedding,
      },
      {
        kind: "after",
        resource: pair.after,
        image: after,
        embedding: afterEmbedding,
      },
    ];

    for (const asset of assets) {
      const assetId = generateId();
      const checksum = createHash("sha256")
        .update(asset.image.buffer)
        .digest("hex");

      const assetResult = await pool.query(
        `
          insert into "imageAsset" (
            id,
            "pairId",
            kind,
            "storageProvider",
            "storageKey",
            url,
            "secureUrl",
            checksum,
            "mimeType",
            "byteSize",
            width,
            height,
            "createdAt",
            "updatedAt"
          )
          values ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11, now(), now())
          on conflict ("pairId", kind) do update
          set
            "storageProvider" = excluded."storageProvider",
            "storageKey" = excluded."storageKey",
            url = excluded.url,
            "secureUrl" = excluded."secureUrl",
            checksum = excluded.checksum,
            "mimeType" = excluded."mimeType",
            "byteSize" = excluded."byteSize",
            width = excluded.width,
            height = excluded.height,
            "updatedAt" = now()
          returning id
        `,
        [
          assetId,
          pair.pairId,
          asset.kind,
          IMAGE_STORAGE_PROVIDER,
          asset.resource.public_id,
          asset.resource.secure_url,
          checksum,
          asset.image.mimeType,
          asset.image.byteSize,
          asset.resource.width,
          asset.resource.height,
        ],
      );

      const persistedAssetId = assetResult.rows[0].id;
      await pool.query('delete from "imageEmbedding" where "assetId" = $1', [
        persistedAssetId,
      ]);

      await pool.query(
        `
          insert into "imageEmbedding" (
            id,
            "pairId",
            "assetId",
            model,
            dimension,
            status,
            embedding,
            "createdAt",
            "updatedAt"
          )
          values ($1, $2, $3, $4, $5, 'ready', $6::vector, now(), now())
        `,
        [
          generateId(),
          pair.pairId,
          persistedAssetId,
          EMBEDDING_MODEL,
          EMBEDDING_DIMENSION,
          toPgVector(asset.embedding),
        ],
      );
    }

    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}

requiredEnv("DATABASE_URL");
requiredEnv("CLOUDINARY_CLOUD_NAME");
requiredEnv("CLOUDINARY_API_KEY");
requiredEnv("CLOUDINARY_API_SECRET");
requiredEnv("GEMINI_API_KEY");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const folder = process.env.CLOUDINARY_FOLDER ?? "dentist-image-reco";
const limit = process.argv[2]
  ? Number(process.argv[2])
  : Number.POSITIVE_INFINITY;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const createdById = await getImportUserId(pool);
  const resources = await listCloudinaryResources(folder);
  const pairs = groupCloudinaryPairs(resources, folder).slice(0, limit);

  console.log(
    `Found ${pairs.length} complete Cloudinary pair(s) in ${folder}.`,
  );

  let imported = 0;

  for (const pair of pairs) {
    console.log(`Importing ${pair.pairId}...`);

    // Download both images concurrently (CDN, safe to parallelise).
    const [before, after] = await Promise.all([
      downloadImage(pair.before),
      downloadImage(pair.after),
    ]);

    // Generate embeddings sequentially to avoid Gemini rate-limit resets.
    const beforeEmbedding = await generateGeminiEmbedding(before);
    const afterEmbedding = await generateGeminiEmbedding(after);

    await upsertPair(pool, {
      pair,
      createdById,
      before,
      after,
      beforeEmbedding,
      afterEmbedding,
    });

    imported += 1;
    console.log(`Imported ${pair.pairId}.`);
  }

  console.log(
    JSON.stringify({ imported, totalAvailable: pairs.length }, null, 2),
  );
} finally {
  await pool.end();
}
