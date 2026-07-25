import type { PropertyCategory } from "./dto";

/**
 * Campos específicos por categoria: a chave guardada em `details` (Json) com
 * o rótulo em português e a unidade. Mora no pacote compartilhado porque duas
 * pontas dependem dela: o formulário de cadastro monta os campos a partir
 * daqui, e a API monta a ficha técnica da página pública com os MESMOS
 * rótulos. Fonte única evita "Área construída" virar "Area const." no site.
 */

export interface FieldDef {
  key: string;
  label: string;
  /** phone/date/email ganham máscara e teclado adequados no mobile. */
  kind: "number" | "boolean" | "text" | "phone" | "date" | "email";
  suffix?: string;
  placeholder?: string;
}

export const DETAIL_FIELDS: Record<PropertyCategory, FieldDef[]> = {
  residencial: [
    { key: "bedrooms", label: "Quartos", kind: "number" },
    { key: "suites", label: "Suítes", kind: "number" },
    { key: "bathrooms", label: "Banheiros", kind: "number" },
    { key: "halfBaths", label: "Lavabos", kind: "number" },
    { key: "livingRooms", label: "Salas", kind: "number" },
    { key: "parkingSpots", label: "Vagas de garagem", kind: "number" },
    { key: "totalArea", label: "Área total", kind: "number", suffix: "m²" },
    { key: "builtArea", label: "Área construída", kind: "number", suffix: "m²" },
    { key: "privateArea", label: "Área privativa", kind: "number", suffix: "m²" },
    { key: "usableArea", label: "Área útil", kind: "number", suffix: "m²" },
    { key: "lotArea", label: "Área do terreno", kind: "number", suffix: "m²" },
    { key: "floors", label: "Andares do imóvel", kind: "number" },
    { key: "unitFloor", label: "Andar da unidade", kind: "number" },
    { key: "buildingFloors", label: "Andares do prédio", kind: "number" },
    { key: "yearBuilt", label: "Ano de construção", kind: "number" },
    { key: "solarPosition", label: "Posição solar", kind: "text", placeholder: "Ex.: face norte" },
    { key: "elevator", label: "Elevador", kind: "boolean" },
    { key: "balcony", label: "Varanda", kind: "boolean" },
    { key: "serviceArea", label: "Área de serviço", kind: "boolean" },
    { key: "serviceRoom", label: "Dependência de serviço", kind: "boolean" },
    { key: "office", label: "Escritório", kind: "boolean" },
    { key: "furnished", label: "Mobiliado", kind: "boolean" },
    { key: "acceptsPets", label: "Aceita pets", kind: "boolean" },
    { key: "pool", label: "Piscina", kind: "boolean" },
    { key: "barbecue", label: "Churrasqueira", kind: "boolean" },
    { key: "garden", label: "Jardim", kind: "boolean" },
    { key: "gatedCommunity", label: "Condomínio fechado", kind: "boolean" },
  ],
  comercial: [
    { key: "rooms", label: "Salas", kind: "number" },
    { key: "bathrooms", label: "Banheiros", kind: "number" },
    { key: "parkingSpots", label: "Vagas", kind: "number" },
    { key: "usableArea", label: "Área útil", kind: "number", suffix: "m²" },
    { key: "totalArea", label: "Área total", kind: "number", suffix: "m²" },
    { key: "floorType", label: "Tipo de piso", kind: "text" },
    { key: "allowedActivity", label: "Atividade permitida", kind: "text" },
    { key: "zoning", label: "Zoneamento", kind: "text" },
    { key: "footTraffic", label: "Fluxo de pessoas", kind: "text" },
    { key: "facade", label: "Fachada", kind: "text" },
    { key: "reception", label: "Recepção", kind: "boolean" },
    { key: "pantry", label: "Copa", kind: "boolean" },
    { key: "kitchen", label: "Cozinha", kind: "boolean" },
    { key: "storage", label: "Depósito", kind: "boolean" },
    { key: "elevator", label: "Elevador", kind: "boolean" },
    { key: "accessibility", label: "Acessibilidade", kind: "boolean" },
    { key: "storefront", label: "Vitrine", kind: "boolean" },
    { key: "airConditioning", label: "Ar-condicionado", kind: "boolean" },
    { key: "signageAllowed", label: "Permite placa", kind: "boolean" },
  ],
  industrial: [
    { key: "totalArea", label: "Área total", kind: "number", suffix: "m²" },
    { key: "builtArea", label: "Área construída", kind: "number", suffix: "m²" },
    { key: "factoryArea", label: "Área fabril", kind: "number", suffix: "m²" },
    { key: "adminArea", label: "Área administrativa", kind: "number", suffix: "m²" },
    { key: "storageArea", label: "Área de armazenagem", kind: "number", suffix: "m²" },
    { key: "ceilingHeight", label: "Pé-direito", kind: "number", suffix: "m" },
    { key: "docks", label: "Docas", kind: "number" },
    { key: "floorCapacity", label: "Capacidade do piso", kind: "number", suffix: "t/m²" },
    { key: "internalOffices", label: "Escritórios internos", kind: "number" },
    { key: "powerSupply", label: "Energia disponível", kind: "text" },
    { key: "zoning", label: "Zoneamento", kind: "text" },
    { key: "security", label: "Segurança", kind: "text" },
    { key: "maneuverYard", label: "Pátio para manobra", kind: "boolean" },
    { key: "loadingArea", label: "Área de carga e descarga", kind: "boolean" },
    { key: "truckAccess", label: "Acesso para caminhões", kind: "boolean" },
  ],
  terreno: [
    { key: "totalArea", label: "Área total", kind: "number", suffix: "m²" },
    { key: "front", label: "Frente", kind: "number", suffix: "m" },
    { key: "back", label: "Fundos", kind: "number", suffix: "m" },
    { key: "rightSide", label: "Lateral direita", kind: "number", suffix: "m" },
    { key: "leftSide", label: "Lateral esquerda", kind: "number", suffix: "m" },
    { key: "topography", label: "Topografia", kind: "text", placeholder: "Plano, aclive, declive" },
    { key: "zoning", label: "Zoneamento", kind: "text" },
    { key: "infrastructure", label: "Infraestrutura disponível", kind: "text" },
    { key: "landNotes", label: "Observações do terreno", kind: "text" },
    { key: "paved", label: "Rua pavimentada", kind: "boolean" },
    { key: "water", label: "Água", kind: "boolean" },
    { key: "power", label: "Energia", kind: "boolean" },
    { key: "sewage", label: "Esgoto", kind: "boolean" },
    { key: "inCondo", label: "Em condomínio ou loteamento", kind: "boolean" },
    { key: "buildingAllowed", label: "Permissão de construção", kind: "boolean" },
  ],
  rural: [
    { key: "totalArea", label: "Área total", kind: "number" },
    { key: "areaUnit", label: "Unidade de medida", kind: "text", placeholder: "ha, alqueire, m²" },
    { key: "productiveArea", label: "Área produtiva", kind: "number" },
    { key: "preservedArea", label: "Área preservada", kind: "number" },
    { key: "improvements", label: "Benfeitorias", kind: "text" },
    { key: "waterResources", label: "Recursos hídricos", kind: "text" },
    { key: "accessType", label: "Tipo de acesso", kind: "text" },
    { key: "accessRoad", label: "Estrada de acesso", kind: "text" },
    { key: "documentation", label: "Documentação disponível", kind: "text" },
    { key: "currentActivity", label: "Atividade atual", kind: "text" },
    { key: "structures", label: "Estruturas existentes", kind: "text" },
    { key: "ruralNotes", label: "Observações", kind: "text" },
    { key: "power", label: "Energia", kind: "boolean" },
  ],
  empreendimento: [
    { key: "bedrooms", label: "Quartos", kind: "number" },
    { key: "suites", label: "Suítes", kind: "number" },
    { key: "bathrooms", label: "Banheiros", kind: "number" },
    { key: "parkingSpots", label: "Vagas", kind: "number" },
    { key: "privateArea", label: "Área privativa", kind: "number", suffix: "m²" },
    { key: "totalArea", label: "Área total", kind: "number", suffix: "m²" },
    { key: "unitFloor", label: "Andar da unidade", kind: "number" },
    { key: "buildingFloors", label: "Andares do prédio", kind: "number" },
    { key: "yearBuilt", label: "Ano de entrega", kind: "number" },
    { key: "elevator", label: "Elevador", kind: "boolean" },
    { key: "balcony", label: "Varanda", kind: "boolean" },
    { key: "furnished", label: "Mobiliado", kind: "boolean" },
  ],
};
