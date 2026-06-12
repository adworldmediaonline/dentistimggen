CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp (3),
	"refreshTokenExpiresAt" timestamp (3),
	"scope" text,
	"password" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rateLimit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"lastRequest" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp (3) NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	"impersonatedBy" text
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"banReason" text,
	"banExpires" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp (3) NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imageAsset" (
	"id" text PRIMARY KEY NOT NULL,
	"pairId" text NOT NULL,
	"kind" text NOT NULL,
	"storageProvider" text NOT NULL,
	"storageKey" text NOT NULL,
	"url" text NOT NULL,
	"secureUrl" text,
	"checksum" text NOT NULL,
	"mimeType" text NOT NULL,
	"byteSize" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imageEmbedding" (
	"id" text PRIMARY KEY NOT NULL,
	"pairId" text NOT NULL,
	"assetId" text NOT NULL,
	"model" text NOT NULL,
	"dimension" integer NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"embedding" vector(64) NOT NULL,
	"error" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imageMatchLog" (
	"id" text PRIMARY KEY NOT NULL,
	"requestedById" text NOT NULL,
	"matchedPairId" text,
	"queryChecksum" text NOT NULL,
	"queryMimeType" text NOT NULL,
	"queryByteSize" integer NOT NULL,
	"similarityScore" double precision,
	"status" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imagePair" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"tags" text[] DEFAULT '{}',
	"status" text DEFAULT 'processing' NOT NULL,
	"createdById" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "imageAsset" ADD CONSTRAINT "imageAsset_pairId_imagePair_id_fk" FOREIGN KEY ("pairId") REFERENCES "public"."imagePair"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "imageEmbedding" ADD CONSTRAINT "imageEmbedding_pairId_imagePair_id_fk" FOREIGN KEY ("pairId") REFERENCES "public"."imagePair"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "imageEmbedding" ADD CONSTRAINT "imageEmbedding_assetId_imageAsset_id_fk" FOREIGN KEY ("assetId") REFERENCES "public"."imageAsset"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "imageMatchLog" ADD CONSTRAINT "imageMatchLog_requestedById_user_id_fk" FOREIGN KEY ("requestedById") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "imageMatchLog" ADD CONSTRAINT "imageMatchLog_matchedPairId_imagePair_id_fk" FOREIGN KEY ("matchedPairId") REFERENCES "public"."imagePair"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "imagePair" ADD CONSTRAINT "imagePair_createdById_user_id_fk" FOREIGN KEY ("createdById") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "rateLimit_key_key" ON "rateLimit" USING btree ("key");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_key" ON "session" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_key" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "imageAsset_pairId_kind_key" ON "imageAsset" USING btree ("pairId","kind");--> statement-breakpoint
CREATE INDEX "imageAsset_checksum_idx" ON "imageAsset" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "imageAsset_kind_idx" ON "imageAsset" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "imageEmbedding_assetId_key" ON "imageEmbedding" USING btree ("assetId");--> statement-breakpoint
CREATE INDEX "imageEmbedding_pairId_idx" ON "imageEmbedding" USING btree ("pairId");--> statement-breakpoint
CREATE INDEX "imageEmbedding_status_idx" ON "imageEmbedding" USING btree ("status");--> statement-breakpoint
CREATE INDEX "imageEmbedding_embedding_hnsw_idx" ON "imageEmbedding" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "imageMatchLog_requestedById_idx" ON "imageMatchLog" USING btree ("requestedById");--> statement-breakpoint
CREATE INDEX "imageMatchLog_matchedPairId_idx" ON "imageMatchLog" USING btree ("matchedPairId");--> statement-breakpoint
CREATE INDEX "imageMatchLog_status_idx" ON "imageMatchLog" USING btree ("status");--> statement-breakpoint
CREATE INDEX "imagePair_createdById_idx" ON "imagePair" USING btree ("createdById");--> statement-breakpoint
CREATE INDEX "imagePair_status_idx" ON "imagePair" USING btree ("status");
