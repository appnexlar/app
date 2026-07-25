-- CreateEnum
CREATE TYPE "property_public_visibility" AS ENUM ('privado', 'publico', 'oculto');

-- AlterTable
ALTER TABLE "property" ADD COLUMN     "highlight_order" INTEGER,
ADD COLUMN     "public_since" TIMESTAMPTZ(6),
ADD COLUMN     "public_visibility" "property_public_visibility" NOT NULL DEFAULT 'privado';

-- CreateIndex
CREATE INDEX "property_broker_id_public_visibility_idx" ON "property"("broker_id", "public_visibility");
