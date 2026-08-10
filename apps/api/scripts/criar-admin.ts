/**
 * Cria um administrador do Nexlar Admin pela linha de comando.
 *
 * Existe para resolver o ovo e a galinha: administrador se cria pela tela de
 * administradores, mas o PRIMEIRO não tem quem o crie (docs/10, R4). Nunca
 * haverá endpoint público de setup; quem roda isto é quem tem o shell e o
 * ambiente, que é exatamente a autoridade que a operação exige.
 *
 * A senha é digitada às escuras, prática da casa desde o vazamento no outro
 * projeto: nada dela passa por tela, histórico ou chat.
 *
 * Uso (dentro de apps/api):
 *   npx tsx scripts/criar-admin.ts <email> "Nome Completo" [papel]
 *   papel: super_admin (padrão) | admin | suporte | financeiro
 *
 * Para produção, carregue o ambiente antes:
 *   set -a; . ./.env.production; set +a; npx tsx scripts/criar-admin.ts ...
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

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
    // Sem .env: produção, o shell já exportou tudo.
  }
}

carregarEnvLocal();

const PAPEIS = ["super_admin", "admin", "suporte", "financeiro"] as const;
type Papel = (typeof PAPEIS)[number];

/** Pergunta sem ecoar o que é digitado, como o getpass do Python. */
function perguntarEscondido(rotulo: string): Promise<string> {
  const mudo = new Writable({
    write(_chunk, _enc, done) {
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output: mudo, terminal: true });
  process.stdout.write(rotulo);
  return new Promise((resolvePromise) => {
    rl.question("", (resposta) => {
      rl.close();
      process.stdout.write("\n");
      resolvePromise(resposta.trim());
    });
  });
}

async function main(): Promise<number> {
  const [email, fullName, papelBruto] = process.argv.slice(2);
  if (!email || !fullName) {
    console.log('uso: npx tsx scripts/criar-admin.ts <email> "Nome Completo" [papel]');
    console.log(`papéis: ${PAPEIS.join(", ")} (padrão: super_admin)`);
    return 1;
  }
  const papel = (papelBruto ?? "super_admin") as Papel;
  if (!PAPEIS.includes(papel)) {
    console.log(`papel desconhecido: ${papelBruto}. Use um de: ${PAPEIS.join(", ")}`);
    return 1;
  }

  const prisma = new PrismaClient();
  try {
    const emailNormalizado = email.trim().toLowerCase();
    const existente = await prisma.adminUser.findUnique({
      where: { email: emailNormalizado },
    });
    if (existente) {
      console.log(`já existe administrador com o e-mail ${emailNormalizado}`);
      return 1;
    }

    console.log("Clique dentro do terminal antes de digitar: o campo não mostra nada.");
    const senha = await perguntarEscondido("Senha (mínimo 10 caracteres): ");
    if (senha.length < 10) {
      console.log("senha curta demais, nada foi criado");
      return 1;
    }
    if (senha !== (await perguntarEscondido("Digite de novo para conferir: "))) {
      console.log("as duas não bateram, nada foi criado");
      return 1;
    }

    const passwordHash = await argon2.hash(senha, { type: argon2.argon2id });
    const admin = await prisma.adminUser.create({
      data: { email: emailNormalizado, fullName: fullName.trim(), role: papel, passwordHash },
    });
    console.log(`pronto: ${admin.email} criado como ${admin.role}`);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then((code) => process.exit(code));
