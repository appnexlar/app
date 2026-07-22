import { z } from "zod";

/** Validação das variáveis de ambiente. Falha cedo se algo essencial faltar. */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  // Conexão direta, usada só pelo Prisma nas migrations. Em produção o
  // DATABASE_URL passa pelo pooler, que não aceita DDL. Em dev as duas
  // apontam para o mesmo banco local.
  DIRECT_URL: z.string().min(1, "DIRECT_URL é obrigatória"),
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET muito curto"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET muito curto"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  WEB_APP_URL: z.string().default("http://localhost:5173"),
  // Storage privado de mídia. Local em dev; S3-compatível na infra (docs/06).
  STORAGE_DIR: z.string().default("./storage"),
  // Limites de mídia configuráveis: nada de valor fixo espalhado no código.
  MEDIA_MAX_PHOTO_MB: z.coerce.number().default(15),
  MEDIA_MAX_VIDEO_MB: z.coerce.number().default(200),
  MEDIA_MAX_PHOTOS_PER_PROPERTY: z.coerce.number().default(40),
  MEDIA_MAX_VIDEOS_PER_PROPERTY: z.coerce.number().default(5),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuração de ambiente inválida:\n${issues}`);
  }
  return parsed.data;
}
