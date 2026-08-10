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
  // Nexlar Admin. Sem o segredo, o módulo administrativo inteiro fica fora
  // do ar (as rotas /api/admin respondem 404), igual ao Google sem chave.
  // O segredo é OBRIGATORIAMENTE diferente do JWT_ACCESS_SECRET: com o mesmo
  // valor, um token de corretor viraria meio caminho de um token de admin.
  JWT_ADMIN_SECRET: z.string().default(""),
  JWT_ADMIN_ACCESS_TTL: z.string().default("10m"),
  // Teto ABSOLUTO da sessão administrativa: a rotação não estende o prazo.
  JWT_ADMIN_SESSION_TTL: z.string().default("8h"),
  // Quantos proxies existem na frente da API. O limite de tentativas por IP
  // depende disso: com 0 atrás da Railway todo mundo vira o mesmo IP (o do
  // proxy) e o limite prenderia o app inteiro; com um valor alto demais o IP
  // passa a ser o que o cliente escrever no cabeçalho, e o limite não vale
  // nada. Local é 0, Railway é 1.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  // Envio de e-mail. Sem a chave, os e-mails só vão para o log: o ambiente
  // local roda sem conta no Resend e produção avisa alto que ninguém recebe.
  RESEND_API_KEY: z.string().default(""),
  // Remetente. O domínio precisa estar verificado no Resend, senão o e-mail
  // cai no spam ou nem sai.
  EMAIL_FROM: z.string().default("Nexlar <onboarding@resend.dev>"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  WEB_APP_URL: z.string().default("http://localhost:5173"),
  // Entrar com o Google. Sem as duas chaves o recurso fica desligado e as
  // rotas respondem 404: é melhor a porta não existir do que existir quebrada.
  // O redirect_uri é derivado do WEB_APP_URL e precisa estar cadastrado igual
  // no Google Cloud, senão o Google recusa antes de qualquer código nosso.
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  // Storage privado de mídia.
  // local: disco, para desenvolvimento.
  // s3: bucket compatível com S3, obrigatório em produção, porque o disco do
  // servidor é apagado a cada publicação e as fotos sumiriam.
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().default(""),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("nexlar-media"),
  S3_ACCESS_KEY: z.string().default(""),
  S3_SECRET_KEY: z.string().default(""),
  // Limites de mídia configuráveis: nada de valor fixo espalhado no código.
  MEDIA_MAX_PHOTO_MB: z.coerce.number().default(15),
  MEDIA_MAX_VIDEO_MB: z.coerce.number().default(200),
  MEDIA_MAX_PHOTOS_PER_PROPERTY: z.coerce.number().default(40),
  MEDIA_MAX_VIDEOS_PER_PROPERTY: z.coerce.number().default(5),
})
  // Falha na subida, e não na primeira foto enviada, se o modo s3 estiver
  // escolhido sem as credenciais do bucket.
  // Meia credencial é pior que nenhuma: o recurso pareceria ligado e falharia
  // só na hora que o corretor clicasse no botão.
  .superRefine((env, ctx) => {
    const temId = env.GOOGLE_CLIENT_ID !== "";
    const temSegredo = env.GOOGLE_CLIENT_SECRET !== "";
    if (temId !== temSegredo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [temId ? "GOOGLE_CLIENT_SECRET" : "GOOGLE_CLIENT_ID"],
        message: "GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET andam juntos",
      });
    }
  })
  .superRefine((env, ctx) => {
    if (env.JWT_ADMIN_SECRET === "") return;
    if (env.JWT_ADMIN_SECRET.length < 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_ADMIN_SECRET"],
        message: "JWT_ADMIN_SECRET muito curto",
      });
    }
    if (
      env.JWT_ADMIN_SECRET === env.JWT_ACCESS_SECRET ||
      env.JWT_ADMIN_SECRET === env.JWT_REFRESH_SECRET
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_ADMIN_SECRET"],
        message: "JWT_ADMIN_SECRET não pode repetir os segredos do corretor",
      });
    }
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER !== "s3") return;
    for (const chave of ["S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY"] as const) {
      if (!env[chave]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [chave],
          message: `${chave} é obrigatória quando STORAGE_DRIVER=s3`,
        });
      }
    }
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
