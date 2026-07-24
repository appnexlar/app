/**
 * Fila de verificação de CRECI, operada pela linha de comando.
 *
 * Não existe painel de administração no Nexlar, e construir um exigiria a
 * noção de usuário administrador, que o sistema não tem. Enquanto o volume for
 * baixo, conferir por aqui é mais honesto do que uma tela mal feita.
 *
 * Uso (dentro de apps/api):
 *   npx tsx scripts/creci.ts fila
 *   npx tsx scripts/creci.ts documento <email> [saida.png]
 *   npx tsx scripts/creci.ts aprovar <email>
 *   npx tsx scripts/creci.ts recusar <email> "motivo que o corretor vai ler"
 *
 * Para operar produção, carregue o ambiente de produção antes:
 *   set -a; . ./.env.production; set +a; npx tsx scripts/creci.ts fila
 */
import { createReadStream, createWriteStream, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { PrismaClient } from "@prisma/client";

/**
 * Carrega o .env local sem depender de pacote: o dotenv não é dependência
 * direta daqui e o pnpm não o deixa alcançável. Em produção o shell já
 * exporta o ambiente antes de chamar o script, e nada aqui sobrescreve o que
 * já existe.
 */
function carregarEnvLocal(): void {
  try {
    for (const linha of readFileSync(".env", "utf8").split("\n")) {
      const par = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha);
      if (!par) continue;
      const [, chave, bruto] = par;
      if (process.env[chave] !== undefined) continue;
      process.env[chave] = bruto.trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // Sem .env: é o caso de produção, onde o ambiente vem do shell.
  }
}

carregarEnvLocal();

const prisma = new PrismaClient();

async function fila(): Promise<void> {
  const pendentes = await prisma.broker.findMany({
    where: { creciStatus: "pendente" },
    select: {
      email: true,
      fullName: true,
      creci: true,
      creciUf: true,
      creciSubmittedAt: true,
    },
    orderBy: { creciSubmittedAt: "asc" },
  });

  if (pendentes.length === 0) {
    console.log("Nenhum CRECI aguardando conferência.");
    return;
  }

  console.table(
    pendentes.map((b) => ({
      email: b.email,
      nome: b.fullName,
      creci: `${b.creci ?? ""}${b.creciUf ? `/${b.creciUf}` : ""}`,
      enviado: b.creciSubmittedAt?.toLocaleString("pt-BR") ?? "",
    })),
  );
  console.log("\nPara ver o documento: npx tsx scripts/creci.ts documento <email>");
}

/**
 * Baixa o documento enviado para conferir com o olho.
 *
 * Fala com o storage direto, sem passar pelo StorageService: aquele depende do
 * ConfigService do Nest, que fora da aplicação não resolve as variáveis. São
 * poucas linhas e o caminho do arquivo é o mesmo nos dois modos.
 */
async function documento(email: string, saida?: string): Promise<void> {
  const broker = await prisma.broker.findUnique({ where: { email } });
  if (!broker?.creciDocumentKey) {
    console.error(`Nenhum documento enviado por ${email}.`);
    process.exitCode = 1;
    return;
  }

  const chave = broker.creciDocumentKey;
  const destino =
    saida ?? `creci-${email.replace(/[^a-z0-9]/gi, "-")}${extensaoDe(chave)}`;

  if ((process.env.STORAGE_DRIVER ?? "local") === "s3") {
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "",
      },
      forcePathStyle: true,
    });
    const objeto = await s3.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: chave }),
    );
    await pipeline(objeto.Body as NodeJS.ReadableStream, createWriteStream(destino));
  } else {
    const origem = resolve(process.env.STORAGE_DIR ?? "./storage", chave);
    await pipeline(createReadStream(origem), createWriteStream(destino));
  }

  console.log(`Documento salvo em ${destino}`);
  console.log(`CRECI informado: ${broker.creci ?? "-"}/${broker.creciUf ?? "-"}`);
  console.log(`\nConferiu? npx tsx scripts/creci.ts aprovar ${email}`);
}

function extensaoDe(chave: string): string {
  const ponto = chave.lastIndexOf(".");
  return ponto === -1 ? "" : chave.slice(ponto);
}

async function aprovar(email: string): Promise<void> {
  const broker = await prisma.broker.update({
    where: { email },
    data: { creciStatus: "aprovado", creciReviewedAt: new Date(), creciRejectionReason: null },
  });
  console.log(`Aprovado: ${broker.fullName} (${broker.creci}/${broker.creciUf}).`);
  console.log("O selo já aparece nas páginas de imóvel que ele compartilhar.");
}

async function recusar(email: string, motivo: string): Promise<void> {
  if (!motivo) {
    console.error("Informe o motivo: ele é mostrado ao corretor para ele corrigir e reenviar.");
    process.exitCode = 1;
    return;
  }
  const broker = await prisma.broker.update({
    where: { email },
    data: { creciStatus: "recusado", creciReviewedAt: new Date(), creciRejectionReason: motivo },
  });
  console.log(`Recusado: ${broker.fullName}. Ele vê o motivo no Perfil e pode reenviar.`);
}

async function main(): Promise<void> {
  const [comando, arg1, arg2] = process.argv.slice(2);
  switch (comando) {
    case "fila":
      return fila();
    case "documento":
      return documento(arg1, arg2);
    case "aprovar":
      return aprovar(arg1);
    case "recusar":
      return recusar(arg1, arg2);
    default:
      console.log("Comandos: fila | documento <email> [saida] | aprovar <email> | recusar <email> <motivo>");
  }
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
