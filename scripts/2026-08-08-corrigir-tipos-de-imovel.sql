-- ===========================================================================
-- Corrigir imóveis com `type` fora do vocabulário atual
-- Rafaelle, 8 ago 2026
--
-- CONTEXTO
-- Seis imóveis do banco de desenvolvimento guardam em property.type o RÓTULO
-- ("Apartamento") em vez do slug ("apartamento") que CATEGORY_TYPES define em
-- packages/shared/src/properties/dto.ts. Todos foram inseridos no mesmo
-- instante (2026-07-24 15:56:14) por um script de teste que gravou direto no
-- banco, pulando a validação da API. Nenhuma migration renomeou tipos: a API
-- nunca teria aceitado esses valores.
--
-- EFEITO
-- O filtro por tipo da carteira (/imoveis) compara o slug exato e não acha
-- esses registros. A vitrine pública, os candidatos de seleção e o cálculo de
-- compatibilidade normalizam antes de comparar, então lá o dado passa.
--
-- COMO RODAR
--   psql postgresql://rafaelle@localhost:5432/nexlar_dev \
--     -f scripts/2026-08-08-corrigir-tipos-de-imovel.sql
--
-- É seguro rodar mais de uma vez: só toca em quem ainda estiver errado, e o
-- de-para é explícito (nada de lower() genérico, que inventaria slugs como
-- "sala" ou "terreno", que não existem na lista).
-- ===========================================================================

BEGIN;

-- 1) Antes: o que será corrigido -------------------------------------------
\echo '--- Antes da correção ---'
SELECT code, category, type, title
FROM property
WHERE type ~ '[A-Z]'
ORDER BY code;

-- 2) De-para explícito, rótulo antigo -> slug atual -------------------------
-- Cada par foi conferido contra CATEGORY_TYPES da respectiva categoria.
UPDATE property AS p
SET type = m.slug, updated_at = now()
FROM (VALUES
  ('residencial', 'Apartamento', 'apartamento'),
  ('residencial', 'Casa',        'casa'),
  ('residencial', 'Cobertura',   'cobertura'),
  ('residencial', 'Studio',      'studio'),
  -- "Sala" comercial vira sala_comercial: é o tipo equivalente na lista.
  ('comercial',   'Sala',        'sala_comercial'),
  -- "Terreno" solto vira terreno_residencial, o tipo mais genérico da
  -- categoria. Confira o IM-0026 depois: se for terreno comercial ou lote em
  -- condomínio, troque pela tela de edição.
  ('terreno',     'Terreno',     'terreno_residencial')
) AS m(categoria, antigo, slug)
WHERE p.type = m.antigo
  AND p.category::text = m.categoria;

-- 3) Depois: nada pode sobrar ----------------------------------------------
\echo '--- Depois da correção (a lista precisa vir vazia) ---'
SELECT code, category, type, title
FROM property
WHERE type ~ '[A-Z]'
ORDER BY code;

-- 4) Conferência final: todo tipo pertence à sua categoria ------------------
\echo '--- Tipos que ainda não pertencem à categoria (precisa vir vazio) ---'
SELECT code, category, type
FROM property
WHERE NOT (
  (category = 'residencial' AND type IN ('casa','apartamento','casa_condominio','cobertura','studio','kitnet','sobrado','flat','loft','duplex','triplex','chacara_residencial'))
  OR (category = 'comercial' AND type IN ('sala_comercial','loja','ponto_comercial','escritorio','predio_comercial','clinica_consultorio','hotel_pousada'))
  OR (category = 'industrial' AND type IN ('galpao','armazem','fabrica','centro_distribuicao','area_industrial'))
  OR (category = 'terreno' AND type IN ('terreno_residencial','terreno_comercial','terreno_industrial','lote_condominio','area_incorporacao'))
  OR (category = 'rural' AND type IN ('fazenda','sitio','chacara','area_rural'))
  OR (category = 'empreendimento' AND type IN ('lancamento','unidade_construcao','unidade_pronta','loteamento'))
)
ORDER BY code;

-- Se as duas listas acima vierem vazias, confirme:
COMMIT;
-- Se algo parecer errado, rode ROLLBACK; em vez do COMMIT acima.
