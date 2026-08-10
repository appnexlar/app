/**
 * Apaga uma conta de corretor do banco de produção, com conferência antes.
 *
 * Existe porque a exclusão é irreversível e as 32 tabelas filhas de `broker`
 * são CASCADE: um delete leva junto leads, imóveis, agenda, documentos e tudo
 * o mais daquele corretor. Então o script mostra o que vai sumir e só age
 * depois que você digitar o e-mail de novo.
 *
 * Uso:
 *   cd apps/api
 *   ( set -a; . ./.env.production; set +a; node scripts/apagar-conta-de-producao.js alguem@exemplo.com )
 */

const { PrismaClient } = require("@prisma/client");
const readline = require("node:readline/promises");

const email = (process.argv[2] || "").trim().toLowerCase();

async function main() {
  if (!email) {
    console.log("uso: node scripts/apagar-conta-de-producao.js <email>");
    return 1;
  }

  const prisma = new PrismaClient();
  try {
    const [conta] = await prisma.$queryRawUnsafe(
      `select b.id, b.email, b.full_name, b.created_at,
        (select count(*) from lead where broker_id = b.id) leads,
        (select count(*) from property where broker_id = b.id) imoveis,
        (select count(*) from agenda_event where broker_id = b.id) agenda,
        (select count(*) from property_selection where broker_id = b.id) selecoes,
        (select count(*) from document where broker_id = b.id) documentos
       from broker b where lower(b.email) = $1`,
      email,
    );

    if (!conta) {
      console.log(`nenhuma conta com o e-mail ${email}`);
      return 1;
    }

    const n = (v) => Number(v);
    console.log("\nvai apagar esta conta e tudo que pende dela:\n");
    console.log(`  ${conta.email}  (${conta.full_name})`);
    console.log(`  criada em ${conta.created_at.toISOString()}`);
    console.log(
      `  leads ${n(conta.leads)} | imóveis ${n(conta.imoveis)} | agenda ${n(conta.agenda)}` +
        ` | seleções ${n(conta.selecoes)} | documentos ${n(conta.documentos)}`,
    );

    // Arquivo no bucket não é apagado por CASCADE: quem some no banco é só o
    // registro. Com documento a mais, o certo é excluir pela tela do produto.
    if (n(conta.documentos) > 0) {
      console.log(
        "\n  ATENÇÃO: esta conta tem documento no bucket. O CASCADE apaga o\n" +
          "  registro no banco, mas o arquivo continua no Storage. Prefira\n" +
          "  excluir pela tela do produto, que remove os dois.",
      );
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const resposta = (await rl.question("\ndigite o e-mail de novo para confirmar: ")).trim().toLowerCase();
    rl.close();

    if (resposta !== email) {
      console.log("não bateu, nada foi apagado");
      return 1;
    }

    await prisma.$executeRawUnsafe(`delete from broker where id = $1::uuid`, conta.id);
    console.log(`\npronto: ${conta.email} apagada`);

    const [{ count }] = await prisma.$queryRawUnsafe("select count(*) from broker");
    console.log(`restam ${Number(count)} conta(s) no banco`);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then((c) => process.exit(c || 0));
