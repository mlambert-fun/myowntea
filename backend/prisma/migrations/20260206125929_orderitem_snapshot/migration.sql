/*
  Warnings:

  - You are about to drop the column `ingredientId` on the `OrderItem` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_ingredientId_fkey";

-- AlterTable
ALTER TABLE "OrderItem" DROP COLUMN "ingredientId",
ADD COLUMN     "ingredientColor" TEXT NOT NULL DEFAULT '#6B7280',
ADD COLUMN     "ingredientName" TEXT NOT NULL DEFAULT 'Ingrédient';
