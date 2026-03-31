ALTER TABLE "StoreSettings"
ADD COLUMN "shopAddress" TEXT NOT NULL DEFAULT '34 Place du Général de Gaulle, 59800 Lille, France',
ADD COLUMN "shopPhone" TEXT NOT NULL DEFAULT '+33 642 80 08 27',
ADD COLUMN "contactEmail" TEXT NOT NULL DEFAULT 'contact@myowntea.fr';
