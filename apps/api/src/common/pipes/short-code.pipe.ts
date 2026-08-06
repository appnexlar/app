import { BadRequestException, Injectable, NotFoundException, PipeTransform } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APENAS_DIGITOS = /^\d+$/;

/**
 * As telas passaram a usar o código curto na URL (/leads/1042) no lugar do
 * uuid. Estes pipes traduzem código para id antes de o controller chamar o
 * service, aceitando as duas formas: link antigo com uuid continua abrindo.
 *
 * A tradução NÃO autoriza nada. Ela devolve o id e o service segue filtrando
 * por broker_id, então pedir o código de outro corretor continua dando 404 lá.
 * O código é sequencial e portanto adivinhável; é justamente por isso que a
 * autorização não pode morar aqui.
 */
function garantirFormato(value: string): number | string {
  if (UUID.test(value)) return value;
  if (!APENAS_DIGITOS.test(value)) {
    throw new BadRequestException("Identificador inválido.");
  }
  const code = Number(value);
  if (!Number.isSafeInteger(code) || code <= 0) {
    throw new BadRequestException("Identificador inválido.");
  }
  return code;
}

@Injectable()
export class LeadRefPipe implements PipeTransform<string, Promise<string>> {
  constructor(private readonly prisma: PrismaService) {}

  async transform(value: string): Promise<string> {
    const ref = garantirFormato(value);
    if (typeof ref === "string") return ref;
    const lead = await this.prisma.lead.findUnique({
      where: { code: ref },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException("Lead não encontrado.");
    return lead.id;
  }
}

@Injectable()
export class FinancingRefPipe implements PipeTransform<string, Promise<string>> {
  constructor(private readonly prisma: PrismaService) {}

  async transform(value: string): Promise<string> {
    const ref = garantirFormato(value);
    if (typeof ref === "string") return ref;
    const request = await this.prisma.financingDataRequest.findUnique({
      where: { code: ref },
      select: { id: true },
    });
    if (!request) throw new NotFoundException("Solicitação não encontrada.");
    return request.id;
  }
}

@Injectable()
export class SelectionRefPipe implements PipeTransform<string, Promise<string>> {
  constructor(private readonly prisma: PrismaService) {}

  async transform(value: string): Promise<string> {
    const ref = garantirFormato(value);
    if (typeof ref === "string") return ref;
    const selection = await this.prisma.propertySelection.findUnique({
      where: { code: ref },
      select: { id: true },
    });
    if (!selection) throw new NotFoundException("Seleção não encontrada.");
    return selection.id;
  }
}
