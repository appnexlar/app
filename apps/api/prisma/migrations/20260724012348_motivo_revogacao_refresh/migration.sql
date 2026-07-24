-- CreateEnum
CREATE TYPE "RefreshRevokeReason" AS ENUM ('rotacao', 'logout', 'senha_redefinida', 'reuso_detectado');

-- AlterTable
ALTER TABLE "refresh_token" ADD COLUMN     "revoked_reason" "RefreshRevokeReason";
