-- Unificação de lead e cliente, passo 2: um conjunto só de preferências.
--
-- Hoje a região e a faixa de valor do cadastro rápido moram na tabela lead,
-- e o "o que a pessoa procura" da seleção mora em lead_preference. São duas
-- fontes para a mesma pergunta, e nada sincroniza as duas. A partir daqui a
-- lead_preference é a fonte única. As colunas antigas de lead FICAM (param de
-- ser escritas) e só saem numa migration posterior, depois da confirmação.

-- 1. A região vai como texto livre, do jeito que a pessoa disse.
ALTER TABLE "lead_preference" ADD COLUMN "region" TEXT;

-- 2. Quem tem preferência: completa o que estiver vazio com o que veio do
--    cadastro. Nunca sobrescreve um valor já preenchido na preferência.
UPDATE "lead_preference" p
SET
  "region"    = COALESCE(p."region", l."region"),
  "price_min" = COALESCE(p."price_min", l."budget_min"),
  "price_max" = COALESCE(p."price_max", l."budget_max"),
  "updated_at" = NOW()
FROM "lead" l
WHERE l."id" = p."lead_id"
  AND (
    (p."region" IS NULL AND l."region" IS NOT NULL) OR
    (p."price_min" IS NULL AND l."budget_min" IS NOT NULL) OR
    (p."price_max" IS NULL AND l."budget_max" IS NOT NULL)
  );

-- 3. Quem não tem preferência mas disse região ou faixa no cadastro: cria.
INSERT INTO "lead_preference" ("id", "broker_id", "lead_id", "region", "price_min", "price_max", "types", "cities", "neighborhoods", "features", "created_at", "updated_at")
SELECT gen_random_uuid(), l."broker_id", l."id", l."region", l."budget_min", l."budget_max",
       '{}', '{}', '{}', '{}', NOW(), NOW()
FROM "lead" l
LEFT JOIN "lead_preference" p ON p."lead_id" = l."id"
WHERE p."id" IS NULL
  AND (l."region" IS NOT NULL OR l."budget_min" IS NOT NULL OR l."budget_max" IS NOT NULL);

-- 4. CPF passa a viver só no perfil do cliente, junto dos outros dados
--    pessoais. Cria o perfil só para quem já tinha CPF no cadastro.
INSERT INTO "client_profile" ("id", "broker_id", "lead_id", "cpf", "created_at", "updated_at")
SELECT gen_random_uuid(), l."broker_id", l."id", l."cpf", NOW(), NOW()
FROM "lead" l
LEFT JOIN "client_profile" cp ON cp."lead_id" = l."id"
WHERE cp."id" IS NULL AND l."cpf" IS NOT NULL;

UPDATE "client_profile" cp
SET "cpf" = l."cpf", "updated_at" = NOW()
FROM "lead" l
WHERE l."id" = cp."lead_id" AND cp."cpf" IS NULL AND l."cpf" IS NOT NULL;
