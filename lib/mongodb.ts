import { MongoClient, type Collection, type Db } from "mongodb"

const uri = process.env.MONGODB_URI

if (!uri) {
  throw new Error("MONGODB_URI is not set. Add it to .env.local.")
}

const dbName = process.env.MONGODB_DB ?? "dentistimgreco"

// Reuse the client across hot reloads in development.
const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>
}

function createClientPromise() {
  const client = new MongoClient(uri as string)
  return client.connect()
}

const clientPromise = globalForMongo._mongoClientPromise ?? createClientPromise()

if (process.env.NODE_ENV !== "production") {
  globalForMongo._mongoClientPromise = clientPromise
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise
  return client.db(dbName)
}

// ── Document shapes ───────────────────────────────────────────────────

export interface UserDoc {
  _id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  role: string
  passwordHash: string
  createdAt: Date
  updatedAt: Date
}

export interface SessionDoc {
  _id: string // session token
  userId: string
  expiresAt: Date
  ipAddress: string | null
  userAgent: string | null
  createdAt: Date
}

export interface ImagePairDoc {
  _id: string
  title: string
  notes: string | null
  tags: string[]
  status: string
  createdById: string
  createdAt: Date
  updatedAt: Date
}

export interface ImageAssetDoc {
  _id: string
  pairId: string
  kind: string
  storageProvider: string
  storageKey: string
  url: string
  secureUrl: string | null
  checksum: string
  mimeType: string
  byteSize: number
  width: number
  height: number
  createdAt: Date
  updatedAt: Date
}

export interface ImageEmbeddingDoc {
  _id: string
  pairId: string
  assetId: string
  model: string
  dimension: number
  status: string
  embedding: number[]
  error: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ImageMatchLogDoc {
  _id: string
  requestedById: string
  matchedPairId: string | null
  queryChecksum: string
  queryMimeType: string
  queryByteSize: number
  similarityScore: number | null
  status: string
  createdAt: Date
}

// ── Collection accessors ──────────────────────────────────────────────

export async function collections() {
  const db = await getDb()
  return {
    users: db.collection<UserDoc>("users"),
    sessions: db.collection<SessionDoc>("sessions"),
    imagePairs: db.collection<ImagePairDoc>("imagePairs"),
    imageAssets: db.collection<ImageAssetDoc>("imageAssets"),
    imageEmbeddings: db.collection<ImageEmbeddingDoc>("imageEmbeddings"),
    imageMatchLogs: db.collection<ImageMatchLogDoc>("imageMatchLogs"),
  }
}

export type AppCollections = Awaited<ReturnType<typeof collections>>

export async function users(): Promise<Collection<UserDoc>> {
  return (await collections()).users
}

// ── Index bootstrap (idempotent) ──────────────────────────────────────

const globalForIndexes = globalThis as unknown as { _mongoIndexesReady?: Promise<void> }

export async function ensureIndexes(): Promise<void> {
  if (globalForIndexes._mongoIndexesReady) {
    return globalForIndexes._mongoIndexesReady
  }

  globalForIndexes._mongoIndexesReady = (async () => {
    const c = await collections()
    await Promise.all([
      c.users.createIndex({ email: 1 }, { unique: true }),
      c.sessions.createIndex({ userId: 1 }),
      // TTL index so expired sessions are reaped automatically.
      c.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      c.imagePairs.createIndex({ status: 1 }),
      c.imagePairs.createIndex({ createdById: 1 }),
      c.imageAssets.createIndex({ pairId: 1, kind: 1 }),
      c.imageAssets.createIndex({ checksum: 1 }),
      c.imageEmbeddings.createIndex({ assetId: 1 }, { unique: true }),
      c.imageEmbeddings.createIndex({ pairId: 1 }),
      c.imageMatchLogs.createIndex({ requestedById: 1 }),
    ])
  })()

  return globalForIndexes._mongoIndexesReady
}
