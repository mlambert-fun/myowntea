-- Add googleId for OAuth linking
ALTER TABLE "Customer"
ADD COLUMN     "googleId" TEXT;

CREATE UNIQUE INDEX "Customer_googleId_key" ON "Customer"("googleId");
