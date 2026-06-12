import "dotenv/config";

import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateId } from "@better-auth/core/utils/id";
import { GoogleGenAI } from "@google/genai";
import { v2 as cloudinary } from "cloudinary";
import pg from "pg";
import sharp from "sharp";
import * as z from "zod/v4";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_DIMENSION = 768;
const IMAGE_PAIR_STATUS_READY = "ready";
const IMAGE_STORAGE_PROVIDER = "cloudinary";
const SUPPORTED_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const IMAGES_DIR = path.resolve(__dirname, "../Images_Data_Set");
const MIN_HEIGHT_TO_WIDTH_RATIO = 0.85;
const CENTRE_BAND_FRACTION = 0.06;
const CLOUDINARY_CONCURRENCY = 5;
const GEMINI_CONCURRENCY = 2;

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const limitArg = args.find((a) => /^\d+$/.test(a));
const limit = limitArg ? Number(limitArg) : 20;

const geminiEmbeddingResponseSchema = z
  .object({
    embedding: z.object({ values: z.array(z.number()) }).optional(),
    embeddings: z.array(z.object({ values: z.array(z.number()) })).optional(),
  })
  .transform((v) => v.embedding?.values ?? v.embeddings?.[0]?.values)
  .pipe(z.array(z.number()).length(EMBEDDING_DIMENSION));

let _gemini = null;
function getGemini() {
  _gemini ??= new GoogleGenAI({ apiKey: requiredEnv("GEMINI_API_KEY") });
  return _gemini;
}

class Semaphore {
  #max;
  #count = 0;
  #queue = [];

  constructor(max) {
    this.#max = max;
  }

  acquire() {
    if (this.#count < this.#max) {
      this.#count++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.#queue.push(resolve));
  }

  release() {
    this.#count--;
    if (this.#queue.length > 0) {
      this.#count++;
      this.#queue.shift()();
    }
  }

  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

const cloudinarySem = new Semaphore(CLOUDINARY_CONCURRENCY);
const geminiSem = new Semaphore(GEMINI_CONCURRENCY);

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function withRetry(fn, { retries = 4, baseDelayMs = 1500, label = "op" } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable =
        err?.cause?.code === "ECONNRESET" ||
        err?.cause?.code === "ECONNREFUSED" ||
        err?.cause?.code === "ETIMEDOUT" ||
        err?.status === 429 ||
        (err?.status ?? 0) >= 500;

      if (!isRetryable || attempt === retries) throw err;

      const delay = baseDelayMs * 2 ** attempt + Math.random() * 500;
      console.warn(
        `  [retry] ${label} (attempt ${attempt + 1}/${retries}): ${
          err?.cause?.code ?? err?.message
        }. Retrying in ${Math.round(delay)}ms…`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function validateImage(filePath) {
  const meta = await sharp(filePath).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const ratio = h / w;

  if (ratio < MIN_HEIGHT_TO_WIDTH_RATIO) {
    return {
      valid: false,
      reason: `aspect ratio ${ratio.toFixed(2)} < ${MIN_HEIGHT_TO_WIDTH_RATIO} (likely side-by-side or single shot)`,
    };
  }

  return { valid: true, width: w, height: h };
}

async function splitImage(filePath, origWidth, origHeight) {
  const h = origHeight;
  const w = origWidth;
  const midH = Math.floor(h / 2);
  const bandH = Math.round(h * CENTRE_BAND_FRACTION);
  const half = Math.floor(bandH / 2);

  const beforeHeight = midH - half;
  const afterTop = midH + half;
  const afterHeight = h - afterTop;

  const [beforeBuf, afterBuf] = await Promise.all([
    sharp(filePath)
      .extract({ left: 0, top: 0, width: w, height: Math.max(beforeHeight, 1) })
      .jpeg({ quality: 90 })
      .toBuffer(),
    sharp(filePath)
      .extract({ left: 0, top: afterTop, width: w, height: Math.max(afterHeight, 1) })
      .jpeg({ quality: 90 })
      .toBuffer(),
  ]);

  const [bMeta, aMeta] = await Promise.all([
    sharp(beforeBuf).metadata(),
    sharp(afterBuf).metadata(),
  ]);

  return {
    before: { buffer: beforeBuf, mimeType: "image/jpeg", byteSize: beforeBuf.length, width: bMeta.width, height: bMeta.height },
    after: { buffer: afterBuf, mimeType: "image/jpeg", byteSize: afterBuf.length, width: aMeta.width, height: aMeta.height },
  };
}

async function uploadToCloudinary(buffer, publicId) {
  return cloudinarySem.run(() =>
    withRetry(
      () =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { public_id: publicId, resource_type: "image", overwrite: true, format: "jpg" },
            (err, result) => (err ? reject(err) : resolve(result)),
          );
          stream.end(buffer);
        }),
      { label: `upload(${publicId})` },
    ),
  );
}

async function generateGeminiEmbedding(image) {
  return geminiSem.run(() =>
    withRetry(
      async () => {
        const response = await getGemini().models.embedContent({
          model: EMBEDDING_MODEL,
          contents: [
            {
              inlineData: {
                mimeType: image.mimeType,
                data: image.buffer.toString("base64"),
              },
            },
          ],
          config: { outputDimensionality: EMBEDDING_DIMENSION },
        });
        return geminiEmbeddingResponseSchema.parse(response);
      },
      { label: `embedding(${image.byteSize}B)`, baseDelayMs: 2000 },
    ),
  );
}

function toPgVector(vector) {
  return `[${vector.map((v) => Number(v).toFixed(8)).join(",")}]`;
}

async function getImportUserId(pool) {
  const preferredEmail =
    process.env.IMPORT_ADMIN_EMAIL ?? process.env.TEST_ADMIN_EMAIL;

  if (preferredEmail) {
    const res = await pool.query(
      'select id from "user" where lower(email) = lower($1) limit 1',
      [preferredEmail],
    );
    if (res.rows[0]?.id) return res.rows[0].id;
  }

  const admin = await pool.query(
    'select id from "user" where role = $1 order by "createdAt" asc limit 1',
    ["admin"],
  );
  if (admin.rows[0]?.id) return admin.rows[0].id;

  throw new Error("No admin user found. Create one first or set IMPORT_ADMIN_EMAIL.");
}

async function upsertPair(pool, { pairId, createdById, before, after, beforeResource, afterResource, beforeEmbedding, afterEmbedding }) {
  await pool.query("begin");
  try {
    await pool.query(
      `
        insert into "imagePair" (id, title, notes, tags, status, "createdById", "createdAt", "updatedAt")
        values ($1, $2, $3, $4, $5, $6, now(), now())
        on conflict (id) do update
        set title = excluded.title, notes = excluded.notes, tags = excluded.tags,
            status = excluded.status, "updatedAt" = now()
      `,
      [pairId, `Imported case ${pairId}`, "Imported from local Images_Data_Set.", ["local-import"], IMAGE_PAIR_STATUS_READY, createdById],
    );

    const assets = [
      { kind: "before", image: before, resource: beforeResource, embedding: beforeEmbedding },
      { kind: "after", image: after, resource: afterResource, embedding: afterEmbedding },
    ];

    for (const asset of assets) {
      const assetId = generateId();
      const checksum = createHash("sha256").update(asset.image.buffer).digest("hex");

      const assetResult = await pool.query(
        `
          insert into "imageAsset" (
            id, "pairId", kind, "storageProvider", "storageKey", url, "secureUrl",
            checksum, "mimeType", "byteSize", width, height, "createdAt", "updatedAt"
          )
          values ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,now(),now())
          on conflict ("pairId", kind) do update
          set "storageProvider"=excluded."storageProvider", "storageKey"=excluded."storageKey",
              url=excluded.url, "secureUrl"=excluded."secureUrl", checksum=excluded.checksum,
              "mimeType"=excluded."mimeType", "byteSize"=excluded."byteSize",
              width=excluded.width, height=excluded.height, "updatedAt"=now()
          returning id
        `,
        [
          assetId, pairId, asset.kind,
          IMAGE_STORAGE_PROVIDER, asset.resource.public_id, asset.resource.secure_url,
          checksum, asset.image.mimeType, asset.image.byteSize,
          asset.resource.width, asset.resource.height,
        ],
      );

      const persistedAssetId = assetResult.rows[0].id;
      await pool.query('delete from "imageEmbedding" where "assetId" = $1', [persistedAssetId]);
      await pool.query(
        `
          insert into "imageEmbedding" (id, "pairId", "assetId", model, dimension, status, embedding, "createdAt", "updatedAt")
          values ($1,$2,$3,$4,$5,'ready',$6::vector,now(),now())
        `,
        [generateId(), pairId, persistedAssetId, EMBEDDING_MODEL, EMBEDDING_DIMENSION, toPgVector(asset.embedding)],
      );
    }

    await pool.query("commit");
  } catch (err) {
    await pool.query("rollback");
    throw err;
  }
}

async function processImage(pool, createdById, filePath, filename, index, total) {
  const prefix = `[${index}/${total}] ${filename}`;

  let validation;
  try {
    validation = await validateImage(filePath);
  } catch (err) {
    console.log(`${prefix} → ERROR (validate): ${err.message}`);
    return "error";
  }

  if (!validation.valid) {
    console.log(`${prefix} → SKIP (${validation.reason})`);
    return "skipped";
  }

  let halves;
  try {
    halves = await splitImage(filePath, validation.width, validation.height);
  } catch (err) {
    console.log(`${prefix} → ERROR (split): ${err.message}`);
    return "error";
  }

  const baseName = path.basename(filename, path.extname(filename))
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 50);
  const pairId = `local-${baseName}`;

  console.log(`${prefix} → before ${halves.before.width}×${halves.before.height}  after ${halves.after.width}×${halves.after.height}`);

  if (isDryRun) {
    console.log(`  [dry-run] pair ${pairId} — skipping upload & DB`);
    return "dry-run";
  }

  let beforeResource, afterResource;
  try {
    [beforeResource, afterResource] = await Promise.all([
      uploadToCloudinary(halves.before.buffer, `${process.env.CLOUDINARY_FOLDER ?? "dentist-image-reco"}/${pairId}/before-${pairId}`),
      uploadToCloudinary(halves.after.buffer, `${process.env.CLOUDINARY_FOLDER ?? "dentist-image-reco"}/${pairId}/after-${pairId}`),
    ]);
  } catch (err) {
    console.log(`  ERROR (upload): ${err.message}`);
    return "error";
  }

  let beforeEmbedding, afterEmbedding;
  try {
    [beforeEmbedding, afterEmbedding] = await Promise.all([
      generateGeminiEmbedding(halves.before),
      generateGeminiEmbedding(halves.after),
    ]);
  } catch (err) {
    console.log(`  ERROR (embedding): ${err.message}`);
    return "error";
  }

  try {
    await upsertPair(pool, {
      pairId,
      createdById,
      before: halves.before,
      after: halves.after,
      beforeResource,
      afterResource,
      beforeEmbedding,
      afterEmbedding,
    });
  } catch (err) {
    console.log(`  ERROR (db): ${err.message}`);
    return "error";
  }

  console.log(`  ✓ ${pairId}`);
  return "ok";
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

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

console.log(`\n🦷  split-and-import-local-images`);
console.log(`   Images dir         : ${IMAGES_DIR}`);
console.log(`   Limit              : ${limit}`);
console.log(`   Dry run            : ${isDryRun}`);
console.log(`   Folder             : ${process.env.CLOUDINARY_FOLDER ?? "dentist-image-reco"}`);
console.log(`   Min h/w ratio      : ${MIN_HEIGHT_TO_WIDTH_RATIO}`);
console.log(`   Centre band crop   : ${(CENTRE_BAND_FRACTION * 100).toFixed(0)}%`);
console.log(`   Cloudinary workers : ${CLOUDINARY_CONCURRENCY}`);
console.log(`   Gemini workers     : ${GEMINI_CONCURRENCY}\n`);

try {
  const createdById = isDryRun ? "dry-run" : await getImportUserId(pool);

  const allFiles = await readdir(IMAGES_DIR);
  const candidates = allFiles.filter((f) =>
    SUPPORTED_EXTS.has(path.extname(f).toLowerCase()),
  );

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  let i = 0;

  const BATCH = CLOUDINARY_CONCURRENCY;

  while (imported < limit && i < candidates.length) {
    const batch = candidates.slice(i, i + BATCH);
    i += BATCH;

    const results = await Promise.all(
      batch.map((filename, bIdx) => {
        const globalIdx = i - BATCH + bIdx + 1;
        const filePath = path.join(IMAGES_DIR, filename);
        return processImage(pool, createdById, filePath, filename, globalIdx, candidates.length);
      }),
    );

    for (const r of results) {
      if (r === "ok" || r === "dry-run") imported++;
      else if (r === "skipped") skipped++;
      else errors++;
    }

    if (imported >= limit) break;
  }

  console.log(`\n── Summary ──────────────────`);
  console.log(`  Imported : ${imported}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Errors   : ${errors}`);
} finally {
  await pool.end();
}
