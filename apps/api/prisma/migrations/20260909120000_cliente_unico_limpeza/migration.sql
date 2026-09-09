-- Etapa 7 da unificação de cliente (set 2026): as colunas antigas de `lead`
-- saem, agora que a API lê tudo de `lead_preference` e `client_profile`.
--
-- RODE ESTA MIGRATION SÓ DEPOIS QUE A VERSÃO NOVA DA API ESTIVER NO AR.
-- A versão anterior ainda lê estas colunas; derrubá-las antes quebraria a API.
--
-- Antes de apagar, copia de novo o que ainda estiver só nas colunas antigas
-- (pessoas cadastradas entre a etapa 1 e a etapa 4 podem ter região ou faixa
-- só em lead). Onde os dois lados têm valor, o de lead_preference vence: é
-- a fonte desde a etapa 4. As tabelas *_backup_20260904 continuam intactas.

-- 1. Preferência para quem tem região ou faixa em lead e ainda não tem registro.
INSERT INTO "lead_preference" ("id", "broker_id", "lead_id", "region", "price_min", "price_max", "created_at", "updated_at")
SELECT gen_random_uuid(), l."broker_id", l."id", l."region", l."budget_min", l."budget_max", now(), now()
FROM "lead" l
LEFT JOIN "lead_preference" p ON p."lead_id" = l."id"
WHERE p."id" IS NULL
  AND (l."region" IS NOT NULL OR l."budget_min" IS NOT NULL OR l."budget_max" IS NOT NULL);

-- 2. Preenche o que falta na preferência existente, sem sobrescrever o que já tem.
UPDATE "lead_preference" p
SET "region"    = COALESCE(p."region", l."region"),
    "price_min" = COALESCE(p."price_min", l."budget_min"),
    "price_max" = COALESCE(p."price_max", l."budget_max"),
    "updated_at" = now()
FROM "lead" l
WHERE l."id" = p."lead_id"
  AND ((p."region" IS NULL AND l."region" IS NOT NULL)
    OR (p."price_min" IS NULL AND l."budget_min" IS NOT NULL)
    OR (p."price_max" IS NULL AND l."budget_max" IS NOT NULL));

-- 3. CPF: perfil para quem só tem CPF em lead, e preenchimento onde o perfil existe sem CPF.
INSERT INTO "client_profile" ("id", "broker_id", "lead_id", "cpf", "created_at", "updated_at")
SELECT gen_random_uuid(), l."broker_id", l."id", l."cpf", now(), now()
FROM "lead" l
LEFT JOIN "client_profile" c ON c."lead_id" = l."id"
WHERE c."id" IS NULL AND l."cpf" IS NOT NULL;

UPDATE "client_profile" c
SET "cpf" = l."cpf", "updated_at" = now()
FROM "lead" l
WHERE l."id" = c."lead_id" AND c."cpf" IS NULL AND l."cpf" IS NOT NULL;

-- 4. Só agora as colunas saem.
ALTER TABLE "lead" DROP COLUMN "region";
ALTER TABLE "lead" DROP COLUMN "budget_min";
ALTER TABLE "lead" DROP COLUMN "budget_max";
ALTER TABLE "lead" DROP COLUMN "cpf";
