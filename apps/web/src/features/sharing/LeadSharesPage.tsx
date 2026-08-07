import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { LeadShareSummary } from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { fetchLead } from "../leads/api";
import { fetchLeadShares } from "./api";
import { SendFromLeadModal } from "./SendFromLeadModal";
import { ShareActionSheet, SharesExplorer } from "./LeadSharesSection";
import { ProposeVisitSheet } from "./ProposeVisitSheet";

/**
 * Página dedicada com todos os imóveis enviados para a lead. Alcançada pelo
 * botão "Ver todos" na ficha. Tem rota própria (voltar do navegador funciona),
 * busca, filtros e agrupamento, e escala para dezenas de imóveis.
 */
export function LeadSharesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [menuShare, setMenuShare] = useState<LeadShareSummary | null>(null);
  const [visitaShare, setVisitaShare] = useState<LeadShareSummary | null>(null);
  const [sendOpen, setSendOpen] = useState(false);

  const leadQuery = useQuery({
    queryKey: ["lead", id],
    queryFn: () => fetchLead(id as string),
    enabled: Boolean(id),
  });
  const sharesQuery = useQuery({
    queryKey: ["lead-shares", id],
    queryFn: () => fetchLeadShares(id as string),
    enabled: Boolean(id),
  });

  const lead = leadQuery.data;
  const shares = sharesQuery.data ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="hidden text-h2 text-text sm:block">Imóveis enviados</h1>
          <p className="text-body-sm text-text-subtle sm:mt-0.5">
            {lead ? `${shares.length} para ${lead.fullName}` : "o que a lead recebeu e como respondeu"}
          </p>
        </div>
        {lead && (
          <Button type="button" variant="accent" className="shrink-0" onClick={() => setSendOpen(true)}>
            Enviar imóvel
          </Button>
        )}
      </div>

      {sharesQuery.isPending ? (
        <div className="h-40 animate-pulse rounded-2xl bg-surface-sunken" />
      ) : sharesQuery.isError ? (
        <Banner variant="danger">Não foi possível carregar os imóveis enviados.</Banner>
      ) : shares.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong bg-surface-sunken/40 px-6 py-14 text-center">
          <p className="text-body font-semibold text-text">Nenhum imóvel enviado</p>
          <p className="mt-1 max-w-sm text-body-sm text-text-muted">
            Envie imóveis da sua carteira que combinem com o perfil desta lead.
          </p>
          {lead && (
            <Button type="button" variant="accent" className="mt-5" onClick={() => setSendOpen(true)}>
              Enviar imóvel
            </Button>
          )}
        </div>
      ) : (
        <SharesExplorer
          shares={shares}
          onOpenMenu={setMenuShare}
          onOpenProperty={(s) => navigate(`/imoveis/${s.propertyId}`)}
          onProposeVisit={setVisitaShare}
        />
      )}

      {menuShare && lead && (
        <ShareActionSheet
          share={menuShare}
          leadId={lead.id}
          leadWhatsapp={lead.whatsapp}
          onClose={() => setMenuShare(null)}
        />
      )}

      {visitaShare && lead && (
        <ProposeVisitSheet
          titulo={visitaShare.visitRequestedAt ? "Combinar a visita" : "Propor visita"}
          mensagem={
            visitaShare.visitRequestedAt || visitaShare.response === "quero_visitar"
              ? `Oi ${lead.fullName.split(" ")[0]}! Vi que você quer visitar o ${visitaShare.propertyTitle}. Bora combinar? Me diz o melhor dia e horário que eu organizo tudo.`
              : `Oi ${lead.fullName.split(" ")[0]}! Que bom que você gostou do ${visitaShare.propertyTitle}. Quer marcar uma visita? Me diz o melhor dia e horário que eu organizo tudo.`
          }
          leadWhatsapp={lead.whatsapp}
          onClose={() => setVisitaShare(null)}
        />
      )}

      {sendOpen && lead && (
        <SendFromLeadModal
          lead={{ id: lead.id, fullName: lead.fullName, whatsapp: lead.whatsapp }}
          onClose={() => setSendOpen(false)}
        />
      )}
    </div>
  );
}
