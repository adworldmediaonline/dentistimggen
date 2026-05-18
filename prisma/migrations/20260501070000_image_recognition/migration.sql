-- Enable vector similarity search for before-image embeddings.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "imagePair" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'processing',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imagePair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imageAsset" (
    "id" TEXT NOT NULL,
    "pairId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secureUrl" TEXT,
    "checksum" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imageEmbedding" (
    "id" TEXT NOT NULL,
    "pairId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimension" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "embedding" vector(64) NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imageEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imageMatchLog" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "matchedPairId" TEXT,
    "queryChecksum" TEXT NOT NULL,
    "queryMimeType" TEXT NOT NULL,
    "queryByteSize" INTEGER NOT NULL,
    "similarityScore" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imageMatchLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imagePair_createdById_idx" ON "imagePair"("createdById");

-- CreateIndex
CREATE INDEX "imagePair_status_idx" ON "imagePair"("status");

-- CreateIndex
CREATE UNIQUE INDEX "imageAsset_pairId_kind_key" ON "imageAsset"("pairId", "kind");

-- CreateIndex
CREATE INDEX "imageAsset_checksum_idx" ON "imageAsset"("checksum");

-- CreateIndex
CREATE INDEX "imageAsset_kind_idx" ON "imageAsset"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "imageEmbedding_assetId_key" ON "imageEmbedding"("assetId");

-- CreateIndex
CREATE INDEX "imageEmbedding_pairId_idx" ON "imageEmbedding"("pairId");

-- CreateIndex
CREATE INDEX "imageEmbedding_status_idx" ON "imageEmbedding"("status");

-- CreateIndex
CREATE INDEX "imageEmbedding_embedding_hnsw_idx" ON "imageEmbedding" USING hnsw ("embedding" vector_cosine_ops);

-- CreateIndex
CREATE INDEX "imageMatchLog_requestedById_idx" ON "imageMatchLog"("requestedById");

-- CreateIndex
CREATE INDEX "imageMatchLog_matchedPairId_idx" ON "imageMatchLog"("matchedPairId");

-- CreateIndex
CREATE INDEX "imageMatchLog_status_idx" ON "imageMatchLog"("status");

-- AddForeignKey
ALTER TABLE "imagePair" ADD CONSTRAINT "imagePair_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imageAsset" ADD CONSTRAINT "imageAsset_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "imagePair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imageEmbedding" ADD CONSTRAINT "imageEmbedding_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "imagePair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imageEmbedding" ADD CONSTRAINT "imageEmbedding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "imageAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imageMatchLog" ADD CONSTRAINT "imageMatchLog_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imageMatchLog" ADD CONSTRAINT "imageMatchLog_matchedPairId_fkey" FOREIGN KEY ("matchedPairId") REFERENCES "imagePair"("id") ON DELETE SET NULL ON UPDATE CASCADE;
