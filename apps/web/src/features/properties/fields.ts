import type { PropertyOrigin } from "@nexlar/shared";

/**
 * Campos condicionais renderizados a partir de configuração. O formulário
 * não mostra quartos para terreno nem docas para apartamento: cada categoria
 * e cada origem têm seu próprio grupo.
 *
 * Os campos por CATEGORIA moram no pacote compartilhado, porque a página
 * pública monta a ficha técnica com os mesmos rótulos. Os campos de ORIGEM
 * ficam aqui de propósito: são dados internos (proprietário, autorização,
 * chaves) que nunca saem para o visitante.
 */

export { DETAIL_FIELDS } from "@nexlar/shared";
export type { FieldDef } from "@nexlar/shared";

import type { FieldDef } from "@nexlar/shared";

export const ORIGIN_FIELDS: Record<PropertyOrigin, FieldDef[]> = {
  captacao_propria: [
    { key: "ownerName", label: "Nome do proprietário", kind: "text" },
    { key: "ownerWhatsapp", label: "WhatsApp do proprietário", kind: "phone" },
    { key: "ownerEmail", label: "E-mail do proprietário", kind: "email" },
    { key: "hasAuthorization", label: "Existe autorização para divulgar", kind: "boolean" },
    { key: "authorizationType", label: "Tipo de autorização", kind: "text", placeholder: "Com ou sem exclusividade" },
    { key: "authorizationDate", label: "Data da autorização", kind: "date" },
    { key: "authorizationValidity", label: "Validade", kind: "date" },
    { key: "keysHolder", label: "Responsável pelas chaves", kind: "text" },
    { key: "visitInstructions", label: "Instruções para visita", kind: "text" },
    { key: "originNotes", label: "Observações internas", kind: "text" },
  ],
  proprietario_particular: [
    { key: "ownerName", label: "Nome do proprietário", kind: "text" },
    { key: "ownerWhatsapp", label: "WhatsApp do proprietário", kind: "phone" },
    { key: "ownerEmail", label: "E-mail do proprietário", kind: "email" },
    { key: "hasAuthorization", label: "Existe autorização para divulgar", kind: "boolean" },
    { key: "authorizationType", label: "Tipo de autorização", kind: "text" },
    { key: "authorizationDate", label: "Data da autorização", kind: "date" },
    { key: "authorizationValidity", label: "Validade", kind: "date" },
    { key: "keysHolder", label: "Responsável pelas chaves", kind: "text" },
    { key: "visitInstructions", label: "Instruções para visita", kind: "text" },
    { key: "originNotes", label: "Observações internas", kind: "text" },
  ],
  imobiliaria: [
    { key: "agencyName", label: "Nome da imobiliária", kind: "text" },
    { key: "agencyPropertyCode", label: "Código do imóvel na imobiliária", kind: "text" },
    { key: "agencyContactName", label: "Contato responsável", kind: "text" },
    { key: "agencyContactPhone", label: "Telefone ou WhatsApp", kind: "phone" },
    { key: "agencyContactEmail", label: "E-mail", kind: "email" },
    { key: "agencyVisitNotes", label: "Observações para visita", kind: "text" },
  ],
  corretor_parceiro: [
    { key: "partnerName", label: "Nome do corretor", kind: "text" },
    { key: "partnerCreci", label: "CRECI", kind: "text" },
    { key: "partnerWhatsapp", label: "WhatsApp", kind: "phone" },
    { key: "partnerEmail", label: "E-mail", kind: "email" },
    { key: "partnerAgency", label: "Imobiliária, quando existir", kind: "text" },
    { key: "partnershipNotes", label: "Observações da parceria", kind: "text" },
  ],
  construtora: [
    { key: "builderName", label: "Nome da construtora", kind: "text" },
    { key: "developmentName", label: "Empreendimento", kind: "text" },
    { key: "block", label: "Bloco", kind: "text" },
    { key: "tower", label: "Torre", kind: "text" },
    { key: "unit", label: "Unidade", kind: "text" },
    { key: "unitCode", label: "Código da unidade", kind: "text" },
    { key: "commercialContact", label: "Contato comercial", kind: "text" },
    { key: "originNotes", label: "Observações", kind: "text" },
  ],
  indicacao: [{ key: "originNotes", label: "Quem indicou e observações", kind: "text" }],
  banco_leilao: [{ key: "originNotes", label: "Banco, leilão e observações", kind: "text" }],
  outro: [{ key: "originNotes", label: "Observações da origem", kind: "text" }],
};
