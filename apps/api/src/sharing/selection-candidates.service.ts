import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  CandidateHistory,
  SelectionCandidate,
  SelectionCandidatesQuery,
  SelectionCandidatesResult,
} from "@nexlar/shared";
import type { LeadPreference, Property, PropertyMedia } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { avaliarCompatibilidade } from "./selection-compatibility";

/**
 * Pesquisa de imóveis para montar a seleção de uma lead.
 *
 * Só enxerga a carteira do próprio corretor. Cada candidato volta com o
 * contexto que evita mancada: compatibilidade explicada, se já está na
 * seleção e o que a lead achou dele em envios anteriores (um imóvel que ela
 * descartou volta com aviso, nunca escondido).
 *
 * Quartos/banheiros/vagas moram no details (Json), então o filtro fino e a
 * ordenação acontecem em memória, como na vitrine pública: a carteira de um
 * corretor solo cabe folgada numa ida ao banco.
 */
@Injectable()
export class SelectionCandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    brokerId: string,
    selectionId: string,
    query: SelectionCandidatesQuery,
  ): Promise<SelectionCandidatesResult> {
    const selection = await this.prisma.propertySelection.findFirst({
      where: { id: selectionId, brokerId },
      select: { id: true, leadId: true, items: { select: { propertyId: true } } },
    });
    if (!selection) throw new NotFoundException("Seleção não encontrada.");

    const [pref, properties, historico] = await Promise.all([
      this.prisma.leadPreference.findFirst({ where: { leadId: selection.leadId, brokerId } }),
      this.prisma.property.findMany({
        where: {
          brokerId,
          status: { not: "arquivado" },
          ...(query.purpose
            ? { purpose: query.purpose === "venda" || query.purpose === "locacao" ? { in: [query.purpose, "venda_locacao"] } : query.purpose }
            : {}),
          ...(query.city ? { city: { equals: query.city, mode: "insensitive" } } : {}),
          ...(query.neighborhood
            ? { neighborhood: { contains: query.neighborhood, mode: "insensitive" } }
            : {}),
          ...(query.type ? { type: { equals: query.type, mode: "insensitive" } } : {}),
        },
        include: { media: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.selectionItem.findMany({
        where: { brokerId, selection: { leadId: selection.leadId }, selectionId: { not: selectionId } },
        include: { selection: { select: { sentAt: true, createdAt: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Última interação da lead por imóvel (a lista já vem da mais recente).
    const porImovel = new Map<string, CandidateHistory>();
    for (const item of historico) {
      if (porImovel.has(item.propertyId)) continue;
      porImovel.set(item.propertyId, {
        sentAt: item.selection.sentAt?.toISOString() ?? null,
        response: item.response,
        visitRequestedAt: item.visitRequestedAt?.toISOString() ?? null,
        responseReason: item.responseReason,
      });
    }

    const naSelecao = new Set(selection.items.map((i) => i.propertyId));
    const termo = query.q ? normalizar(query.q) : null;

    const candidatos = properties
      .map((p) => this.toCandidate(p, pref, naSelecao, porImovel))
      .filter((c) => {
        if (query.priceMin != null && (c.price == null || c.price < query.priceMin)) return false;
        if (query.priceMax != null && (c.price == null || c.price > query.priceMax)) return false;
        if (query.bedroomsMin != null && (c.bedrooms ?? 0) < query.bedroomsMin) return false;
        if (termo) {
          const alvo = normalizar(
            `${c.title} ${c.type} ${c.city ?? ""} ${c.neighborhood ?? ""} ${c.code}`,
          );
          if (!alvo.includes(termo)) return false;
        }
        return true;
      });

    // Melhores primeiro: compatibilidade decide, cadastro recente desempata.
    const peso: Record<string, number> = { alta: 0, media: 1, baixa: 2, fora_do_perfil: 3 };
    candidatos.sort((a, b) => (peso[a.compatibility ?? "baixa"] ?? 2) - (peso[b.compatibility ?? "baixa"] ?? 2));

    const inicio = (query.page - 1) * query.pageSize;
    return {
      items: candidatos.slice(inicio, inicio + query.pageSize),
      total: candidatos.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  private toCandidate(
    p: Property & { media: PropertyMedia[] },
    pref: LeadPreference | null,
    naSelecao: Set<string>,
    historico: Map<string, CandidateHistory>,
  ): SelectionCandidate {
    const d = (p.details ?? {}) as Record<string, unknown>;
    const numero = (chave: string): number | null =>
      typeof d[chave] === "number" && Number.isFinite(d[chave]) ? (d[chave] as number) : null;
    const price = p.salePrice != null ? Number(p.salePrice) : p.rentPrice != null ? Number(p.rentPrice) : null;
    const cover = p.media.find((m) => m.isCover && m.kind === "foto" && m.status === "pronto");
    const veredito = avaliarCompatibilidade(pref, p);

    return {
      propertyId: p.id,
      code: p.code,
      title: p.title,
      type: p.type,
      status: p.status,
      purpose: p.purpose,
      city: p.city,
      neighborhood: p.neighborhood,
      coverUrl: cover ? `/api/properties/${p.id}/media/${cover.id}/file` : null,
      price,
      priceLabel: priceLabel(p.purpose, price),
      bedrooms: numero("bedrooms"),
      bathrooms: numero("bathrooms"),
      parkingSpots: numero("parkingSpots"),
      area: numero("builtArea") ?? numero("totalArea"),
      compatibility: veredito?.level ?? null,
      compatibilityReasons: veredito?.atende ?? [],
      compatibilityWarnings: veredito?.ressalvas ?? [],
      inSelection: naSelecao.has(p.id),
      history: historico.get(p.id) ?? null,
    };
  }
}

const normalizar = (s: string): string =>
  s
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

function priceLabel(purpose: string, price: number | null): string {
  if (price == null) return "Valor sob consulta";
  const formatted = price.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
  if (purpose === "locacao" || purpose === "temporada") return `${formatted} / mês`;
  return formatted;
}
