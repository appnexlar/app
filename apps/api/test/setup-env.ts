import os from "node:os";
import path from "node:path";

/**
 * Ambiente dos testes e2e. Roda antes de qualquer import da aplicação:
 * process.env tem precedência sobre o .env tanto no @nestjs/config
 * quanto no Prisma, então o banco de desenvolvimento nunca é tocado.
 */
const user = process.env.USER ?? "postgres";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? `postgresql://${user}@localhost:5432/nexlar_test`;
process.env.JWT_ACCESS_SECRET = "test-access-secret-0123456789";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-0123456789";
process.env.STORAGE_DIR = path.join(os.tmpdir(), "nexlar-test-storage");

if (!/test/.test(process.env.DATABASE_URL)) {
  throw new Error(
    `Recusando rodar testes contra um banco que não parece de teste: ${process.env.DATABASE_URL}`,
  );
}
