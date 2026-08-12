-- Falhas de envio de e-mail: o que antes só existia no log passa a ter
-- registro consultável, para o painel administrativo poder avisar a equipe.
--
-- O destinatário entra mascarado ("ra****@gmail.com"). A tabela serve para
-- descobrir que o envio quebrou e por quê, e nada disso exige o endereço
-- completo de ninguém.

-- CreateTable
CREATE TABLE "email_delivery_failure" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_delivery_failure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_delivery_failure_created_at_idx" ON "email_delivery_failure"("created_at" DESC);

-- Blindagem: mesmas travas das demais tabelas. O revoke para anon/authenticated
-- já vale por default para tabelas novas; o RLS liga tabela a tabela.
ALTER TABLE "email_delivery_failure" ENABLE ROW LEVEL SECURITY;
