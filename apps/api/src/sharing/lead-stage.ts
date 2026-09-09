import type { LeadStatus } from "@nexlar/shared";
import { LEAD_STATUSES } from "@nexlar/shared";
import type { Prisma } from "@prisma/client";
import { STATUS_LABELS } from "../leads/status-labels";

/** Etapas que nunca mudam sozinhas: sair delas é sempre decisão do corretor. */
const FROZEN_STATUSES: LeadStatus[] = ["fechado", "perdida", "reativar_futuro"];

/**
 * Promove a etapa da lead no funil quando um evento comercial acontece
 * (imóvel enviado, link aberto, resposta registrada, pedido de visita).
 * Só anda para a frente: nunca rebaixa uma lead que já está adiante e nunca
 * mexe em lead encerrada ou convertida. A mudança fica na timeline como
 * automática. Usada pelo envio rápido e pela seleção personalizada.
 */
export async function promoteLeadStage(
  tx: Prisma.TransactionClient,
  brokerId: string,
  leadId: string,
  target: LeadStatus,
): Promise<void> {
  const lead = await tx.lead.findFirst({
    where: { id: leadId, brokerId },
    select: { status: true },
  });
  if (!lead) return;
  if (FROZEN_STATUSES.includes(lead.status)) return;
  if (LEAD_STATUSES.indexOf(target) <= LEAD_STATUSES.indexOf(lead.status)) return;

  await tx.lead.update({
    where: { id: leadId },
    data: { status: target, lastContactAt: new Date() },
  });
  await tx.leadActivity.create({
    data: {
      brokerId,
      leadId,
      type: "mudanca_status",
      description: `Etapa atualizada automaticamente para ${STATUS_LABELS[target]}`,
      metadata: { from: lead.status, to: target, auto: true },
    },
  });
}
