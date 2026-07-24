import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  isMilestoneEvent,
  isProductEventType,
  type TrackEventInput,
} from "@nexlar/shared";
import { Prisma, type ProductEvent } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Cliente Prisma que tanto pode ser o serviço quanto uma transação em curso.
 * Permite emitir o evento dentro da mesma transação que criou a entidade, de
 * forma que ou os dois nascem, ou nenhum dos dois.
 */
type Db = PrismaService | Prisma.TransactionClient;

/**
 * Registro central de eventos de uso e aprendizado (§9, §27).
 *
 * É o sistema nervoso da Jornada 2: cada ação real do corretor vira uma linha
 * imutável em `product_event`, e o motor de orientação lê essas linhas para
 * saber o que já foi aprendido. O broker vem sempre de fora (do token, na
 * borda da API), nunca do payload.
 *
 * O que este serviço NÃO faz de propósito: guardar conteúdo sensível. Só
 * referências (entityType + entityId) e metadados mínimos. CPF, renda, nome de
 * cliente, nada disso entra aqui.
 */
@Injectable()
export class ProductEventService {
  private readonly logger = new Logger(ProductEventService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra um evento de forma idempotente.
   *
   * Marcos (MILESTONE_EVENTS) deduplicam pelo próprio tipo: receber
   * FIRST_LEAD_CREATED várias vezes grava uma linha só. Eventos repetíveis
   * (GUIDANCE_SHOWN) gravam sempre, a menos que quem chama passe um `dedupeKey`
   * explícito para deduplicar por alguma dimensão.
   *
   * Aceita um cliente de transação para nascer junto com a entidade que o
   * disparou. Usa upsert no caminho com dedupe, e não `create` + catch, porque
   * um P2002 dentro de uma transação compartilhada a abortaria inteira.
   *
   * Devolve o evento gravado, ou o já existente no caso de um marco repetido.
   */
  async track(
    brokerId: string,
    input: TrackEventInput,
    client?: Db,
  ): Promise<ProductEvent> {
    if (!isProductEventType(input.type)) {
      // Não é 400 de usuário: é erro de programação ou tentativa de burlar o
      // catálogo. Barra alto e cedo. O front nunca escolhe o tipo livremente.
      throw new BadRequestException(`Evento de produto desconhecido: ${input.type}`);
    }

    const db = client ?? this.prisma;
    const dedupeKey = this.resolveDedupeKey(input);

    const data: Prisma.ProductEventUncheckedCreateInput = {
      brokerId,
      type: input.type,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      source: input.source ?? "system",
      dedupeKey,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    };

    if (dedupeKey === null) {
      // Evento repetível: grava sempre, sem chave de unicidade.
      return db.productEvent.create({ data });
    }

    // Com chave: on conflict do nothing. O update vazio nunca toca a linha
    // existente, então o primeiro registro do marco é o que vale.
    return db.productEvent.upsert({
      where: { broker_dedupe: { brokerId, dedupeKey } },
      create: data,
      update: {},
    });
  }

  /**
   * Registra um evento sem nunca derrubar o fluxo principal. Para os pontos em
   * que o evento é um efeito colateral desejável mas não essencial: se falhar,
   * a ação do corretor não pode falhar junto. Loga e engole.
   *
   * Use fora de transações. Dentro de uma, prefira `track` com o `client` para
   * manter a atomicidade.
   */
  async trackSafe(brokerId: string, input: TrackEventInput): Promise<void> {
    try {
      await this.track(brokerId, input);
    } catch (erro) {
      this.logger.warn(
        `Falha ao registrar evento ${input.type} do corretor: ${
          erro instanceof Error ? erro.message : "desconhecido"
        }`,
      );
    }
  }

  /** True se o marco já foi registrado para este corretor. */
  async hasMilestone(brokerId: string, type: TrackEventInput["type"]): Promise<boolean> {
    if (!isMilestoneEvent(type)) return false;
    const existente = await this.prisma.productEvent.findUnique({
      where: { broker_dedupe: { brokerId, dedupeKey: type } },
      select: { id: true },
    });
    return existente !== null;
  }

  private resolveDedupeKey(input: TrackEventInput): string | null {
    if (input.dedupeKey) return input.dedupeKey;
    if (isMilestoneEvent(input.type)) return input.type;
    return null;
  }
}
