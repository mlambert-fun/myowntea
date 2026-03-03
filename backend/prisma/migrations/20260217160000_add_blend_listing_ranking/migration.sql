ALTER TABLE "BlendListing"
ADD COLUMN "ranking" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "BlendListing_ranking_idx" ON "BlendListing"("ranking");
