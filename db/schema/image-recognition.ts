import {
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const imagePair = pgTable(
  "imagePair",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    notes: text("notes"),
    tags: text("tags").array().default([]),
    status: text("status").notNull().default("processing"),
    createdById: text("createdById")
      .notNull()
      .references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
    createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3 }).notNull(),
  },
  (table) => [
    index("imagePair_createdById_idx").on(table.createdById),
    index("imagePair_status_idx").on(table.status),
  ],
);

export const imageAsset = pgTable(
  "imageAsset",
  {
    id: text("id").primaryKey(),
    pairId: text("pairId")
      .notNull()
      .references(() => imagePair.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    kind: text("kind").notNull(),
    storageProvider: text("storageProvider").notNull(),
    storageKey: text("storageKey").notNull(),
    url: text("url").notNull(),
    secureUrl: text("secureUrl"),
    checksum: text("checksum").notNull(),
    mimeType: text("mimeType").notNull(),
    byteSize: integer("byteSize").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex("imageAsset_pairId_kind_key").on(table.pairId, table.kind),
    index("imageAsset_checksum_idx").on(table.checksum),
    index("imageAsset_kind_idx").on(table.kind),
  ],
);

export const imageEmbedding = pgTable(
  "imageEmbedding",
  {
    id: text("id").primaryKey(),
    pairId: text("pairId")
      .notNull()
      .references(() => imagePair.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    assetId: text("assetId")
      .notNull()
      .references(() => imageAsset.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    model: text("model").notNull(),
    dimension: integer("dimension").notNull(),
    status: text("status").notNull().default("ready"),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    error: text("error"),
    createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { precision: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex("imageEmbedding_assetId_key").on(table.assetId),
    index("imageEmbedding_pairId_idx").on(table.pairId),
    index("imageEmbedding_status_idx").on(table.status),
    index("imageEmbedding_embedding_hnsw_idx")
      .using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);

export const imageMatchLog = pgTable(
  "imageMatchLog",
  {
    id: text("id").primaryKey(),
    requestedById: text("requestedById")
      .notNull()
      .references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
    matchedPairId: text("matchedPairId").references(() => imagePair.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    queryChecksum: text("queryChecksum").notNull(),
    queryMimeType: text("queryMimeType").notNull(),
    queryByteSize: integer("queryByteSize").notNull(),
    similarityScore: doublePrecision("similarityScore"),
    status: text("status").notNull(),
    createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    index("imageMatchLog_requestedById_idx").on(table.requestedById),
    index("imageMatchLog_matchedPairId_idx").on(table.matchedPairId),
    index("imageMatchLog_status_idx").on(table.status),
  ],
);
