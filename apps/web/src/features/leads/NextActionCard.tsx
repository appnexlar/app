import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import type {
  FinancingRequestSummary,
  LeadShareSummary,
  SelectionSummary,
} from "@nexlar/shared";
import { Button, buttonClasses } from "../../components/ui/Button";
import { AuthImage } from "../properties/AuthImage";
import { fetchLeadShares, publicShareUrl } from "../sharing/api";
import { sharePropertyUnavailable } from "../sharing/labels";
import { ProposeVisitSheet } from "../sharing/ProposeVisitSheet";
import { fetchLeadSelections, selectionPublicUrl } from "../selections/api";
import { fetchLeadFinancingRequests } from "../financing/api";
import { leadPath, selectionPath } from "../../lib/routes";
import { displayCreatedAt } from "./labels";

interface LeadRef {
  id: string;
  code: number;
  fullName: string;
  whatsapp: string;
}

/** O que o card recomenda e por quê. `folha` abre a escolha de canal. */
interface Recomendacao {
  titulo: string;
  porque: string;
  /** Imóvel âncora da recomendação, quando existe um. */
  share?: LeadShareSummary;
  cta:
    | { tipo: "folha"; label: string; tituloFolha: string; mensagem: string }
    | { tipo: "link"; label: string; to: string }
    | { tipo: "compartilhar"; label: string };
  secundaria?: { label: string; to: string };
}

/**
 * "Próxima ação": a página inteira aponta para uma decisão, e é esta.
 *
 * A ficha tinha oito botões com o mesmo peso e o corretor tinha que deduzir a
 * ordem sozinho. Aqui a regra é dita e explicada: visita pedida vale mais que
 * interesse, interesse vale mais que financiamento parado, e assim por diante,
 * porque é a ordem em que o negócio esfria. Deriva só do que já está na tela
 * (mesmas queries, mesmo cache); nenhuma chamada nova.
 */
export function NextActionCard({ lead, onShare }: { lead: LeadRef; onShare: () => void }) {
  const [folhaAberta, setFolhaAberta] = useState(false);

  const shares = useQuery({ queryKey: ["lead-shares", lead.id], queryFn: () => fetchLeadShares(lead.id) });
  const selections = useQuery({
    queryKey: ["lead-selections", lead.id],
    queryFn: () => fetchLeadSelections(lead.id),
  });
  const financing = useQuery({
    queryKey: ["lead-financing", lead.id],
    queryFn: () => fetchLeadFinancingRequests(lead.id),
  });

  // Recomendação é reforço, não requisito: sem dados, a página segue sem ela.
  if (shares.isPending || selections.isPending || financing.isPending) return null;
  if (shares.isError || selections.isError || financing.isError) return null;

  const rec = derivarProximaAcao(lead, shares.data ?? [], selections.data ?? [], financing.data ?? []);
  if (!rec) return null;

  return (
    <section className="animate-rise rounded-2xl border border-border bg-surface p-4 shadow-md sm:p-6">
      <p className="flex items-center gap-2 text-label font-semibold text-accent">
        <Sparkles size={16} aria-hidden="true" />
        Próxima ação
      </p>
      <h2 className="mt-2 text-h3 text-text">{rec.titulo}</h2>
      <p className="mt-1 text-body-sm text-text-muted">{rec.porque}</p>

      {rec.share && <TileImovel share={rec.share} />}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {rec.cta.tipo === "folha" ? (
          <Button type="button" variant="accent" onClick={() => setFolhaAberta(true)}>
            {rec.cta.label}
          </Button>
        ) : rec.cta.tipo === "link" ? (
          <Link to={rec.cta.to} className={buttonClasses("accent")}>
            {rec.cta.label}
          </Link>
        ) : (
          <Button type="button" variant="accent" onClick={onShare}>
            {rec.cta.label}
          </Button>
        )}
        {rec.secundaria && (
          <Link to={rec.secundaria.to} className={buttonClasses("ghost")}>
            {rec.secundaria.label}
          </Link>
        )}
      </div>

      {folhaAberta && rec.cta.tipo === "folha" && (
        <ProposeVisitSheet
          titulo={rec.cta.tituloFolha}
          mensagem={rec.cta.mensagem}
          leadWhatsapp={lead.whatsapp}
          onClose={() => setFolhaAberta(false)}
        />
      )}
    </section>
  );
}

/** Imóvel âncora: foto, nome em até duas linhas e preço, clicável. */
function TileImovel({ share }: { share: LeadShareSummary }) {
  return (
    <Link
      to={`/imoveis/${share.propertyCode}`}
      className="mt-4 flex items-center gap-4 rounded-xl border border-border bg-surface-sunken/40 p-2 transition-colors hover:bg-surface-sunken"
    >
      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-sunken">
        {share.coverUrl ? (
          <AuthImage src={share.coverUrl} alt={share.propertyTitle} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-text-subtle">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 11l9-7 9 7M5 9.5V20a1 1 0 001 1h12a1 1 0 001-1V9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-body-sm font-semibold leading-snug text-text">
          {share.propertyTitle}
        </span>
        <span className="mt-1 block text-body-sm font-bold text-text">{share.priceLabel}</span>
      </span>
      <svg className="h-5 w-5 shrink-0 text-text-subtle" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Derivação pura: dados na mão, recomendação na saída.                */
/* ------------------------------------------------------------------ */

/** Mais engajado primeiro; prioridade marcada pelo corretor fura a fila. */
function maisQuente(shares: LeadShareSummary[]): LeadShareSummary {
  const quando = (s: LeadShareSummary) =>
    new Date(s.respondedAt ?? s.visitRequestedAt ?? s.sentAt ?? s.createdAt).getTime();
  return [...shares].sort((a, b) => {
    if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
    return quando(b) - quando(a);
  })[0];
}

export function derivarProximaAcao(
  lead: { code: number; fullName: string },
  shares: LeadShareSummary[],
  selections: SelectionSummary[],
  financing: FinancingRequestSummary[],
): Recomendacao | null {
  const nome = lead.fullName.split(" ")[0];
  // Imóvel vendido ou link revogado saem da conta: não se propõe visita ao
  // que não existe mais. Link expirado fica: o interesse registrado não expira.
  const vivos = shares.filter((s) => !sharePropertyUnavailable(s) && s.status !== "revogada");
  // Seleção arquivada é capítulo que o corretor encerrou: não gera recomendação.
  const selecoes = selections.filter((s) => s.status !== "arquivada");

  // 1. Visita pedida: a lead deu o passo mais forte que existe; confirmar já.
  const pediuVisita = vivos.filter((s) => s.visitRequestedAt || s.response === "quero_visitar");
  if (pediuVisita.length > 0) {
    const s = maisQuente(pediuVisita);
    const quando = s.visitRequestedAt ? ` ${displayCreatedAt(s.visitRequestedAt).toLowerCase()}` : "";
    return {
      titulo: "Confirmar a visita",
      porque: `${nome} pediu${quando} para visitar este imóvel. Responder rápido segura o entusiasmo.`,
      share: s,
      cta: {
        tipo: "folha",
        label: "Combinar a visita",
        tituloFolha: "Combinar a visita",
        mensagem: `Oi ${nome}! Vi que você quer visitar o ${s.propertyTitle}. Bora combinar? Me diz o melhor dia e horário que eu organizo tudo.`,
      },
    };
  }

  const visitasDeSelecao = selecoes.find((s) => s.visitRequestedCount > 0);
  if (visitasDeSelecao) {
    const n = visitasDeSelecao.visitRequestedCount;
    return {
      titulo: "Confirmar a visita",
      porque: `Na seleção de ${dataCurta(visitasDeSelecao.createdAt)}, ${nome} marcou ${n === 1 ? "um imóvel" : `${n} imóveis`} para visitar.`,
      cta: {
        tipo: "link",
        label: n === 1 ? "Ver o pedido de visita" : "Ver os pedidos de visita",
        to: selectionPath(lead.code, visitasDeSelecao.code),
      },
    };
  }

  // 2. Interesse declarado sem visita: a janela que mais converte.
  const comInteresse = vivos.filter((s) => s.response === "tenho_interesse");
  if (comInteresse.length > 0) {
    const s = maisQuente(comInteresse);
    const quando = s.respondedAt ? ` ${displayCreatedAt(s.respondedAt).toLowerCase()}` : "";
    return {
      titulo: "Propor uma visita",
      porque: `${nome} demonstrou interesse${quando} neste imóvel. Aproveite enquanto está quente.`,
      share: s,
      cta: {
        tipo: "folha",
        label: "Propor visita",
        tituloFolha: "Propor visita",
        mensagem: `Oi ${nome}! Que bom que você gostou do ${s.propertyTitle}. Quer marcar uma visita? Me diz o melhor dia e horário que eu organizo tudo.`,
      },
    };
  }

  const selecaoComGostei = selecoes.find((s) => s.likedCount > 0);
  if (selecaoComGostei) {
    const n = selecaoComGostei.likedCount;
    return {
      titulo: "Propor uma visita",
      porque: `Na seleção de ${dataCurta(selecaoComGostei.createdAt)}, ${nome} gostou de ${n === 1 ? "um imóvel" : `${n} imóveis`}. É a hora de puxar a visita.`,
      cta: {
        tipo: "link",
        label: "Ver o que ela gostou",
        to: selectionPath(lead.code, selecaoComGostei.code),
      },
    };
  }

  // 3. Financiamento respondido: o cliente fez a parte dele e está esperando.
  const finRespondido = financing.find((f) => f.status === "respondida" || f.status === "em_revisao");
  if (finRespondido) {
    const quando = finRespondido.submittedAt
      ? ` em ${dataCurta(finRespondido.submittedAt)}`
      : "";
    return {
      titulo: "Revisar o financiamento",
      porque: `${nome} enviou os dados${quando} e está esperando seu retorno para a simulação.`,
      cta: {
        tipo: "link",
        label: "Revisar respostas",
        to: `${leadPath(lead.code)}/financiamento/${finRespondido.code}`,
      },
    };
  }

  // 4. Ficou em dúvida: um empurrão leve antes de virar desinteresse.
  const emDuvida = vivos.filter((s) => s.response === "talvez");
  if (emDuvida.length > 0) {
    const s = maisQuente(emDuvida);
    return {
      titulo: "Tirar a dúvida",
      porque: `${nome} ficou na dúvida sobre este imóvel. Uma pergunta certa destrava a conversa.`,
      share: s,
      cta: {
        tipo: "folha",
        label: "Puxar conversa",
        tituloFolha: "Puxar conversa",
        mensagem: `Oi ${nome}! Ficou alguma dúvida sobre o ${s.propertyTitle}? Se quiser, mando mais fotos ou marco uma visita sem compromisso.`,
      },
    };
  }

  // 5. Tudo descartado: o alvo está errado; recalibrar em vez de insistir.
  // "Tudo" é literal: com resposta pendente em qualquer imóvel, ainda não é
  // hora de decretar que nada agradou.
  const tudoDescartado =
    (vivos.length > 0 && vivos.every((s) => s.response === "sem_interesse")) ||
    selecoes.some((s) => s.itemCount > 0 && s.dismissedCount === s.itemCount);
  if (tudoDescartado) {
    return {
      titulo: "Enviar novas opções",
      porque: `Nada do que foi enviado agradou. Vale revisar o perfil de ${nome} e tentar outra linha.`,
      cta: { tipo: "compartilhar", label: "Escolher novos imóveis" },
    };
  }

  // 6. Abriu e não decidiu: perguntar destrava mais que reenviar.
  const viuSemDecidir = vivos.filter(
    (s) =>
      (s.viewCount > 0 || s.response === "visualizado") &&
      (s.response === "nao_visualizado" || s.response === "visualizado"),
  );
  if (viuSemDecidir.length > 0) {
    const s = maisQuente(viuSemDecidir);
    return {
      titulo: "Perguntar o que achou",
      porque: `${nome} abriu este imóvel e não respondeu. Uma pergunta direta vale mais que esperar.`,
      share: s,
      cta: {
        tipo: "folha",
        label: "Perguntar o que achou",
        tituloFolha: "Perguntar o que achou",
        mensagem: `Oi ${nome}! Viu o ${s.propertyTitle} que te mandei? Me conta o que achou, assim eu afino as próximas opções.`,
      },
    };
  }

  // 7. Enviado e não aberto: o link precisa chegar de novo, não mudar.
  const selecaoFechada = selecoes.find((s) => s.status === "ativa" && !s.viewedAt);
  if (selecaoFechada) {
    return {
      titulo: "Reforçar o convite",
      porque: `A seleção de ${dataCurta(selecaoFechada.createdAt)} ainda não foi aberta. Um lembrete costuma resolver.`,
      cta: {
        tipo: "folha",
        label: "Mandar um lembrete",
        tituloFolha: "Reforçar o convite",
        mensagem: `Oi ${nome}! Separei ${selecaoFechada.itemCount === 1 ? "um imóvel" : `${selecaoFechada.itemCount} imóveis`} com a sua cara. Dá uma olhada quando puder: ${selectionPublicUrl(selecaoFechada.publicToken)}`,
      },
      secundaria: { label: "Ver seleção", to: selectionPath(lead.code, selecaoFechada.code) },
    };
  }

  const shareFechado = vivos.find(
    (s) => s.status === "ativa" && s.viewCount === 0 && s.response === "nao_visualizado",
  );
  if (shareFechado) {
    return {
      titulo: "Reforçar o convite",
      porque: `O imóvel enviado ${displayCreatedAt(shareFechado.sentAt ?? shareFechado.createdAt).toLowerCase()} ainda não foi aberto.`,
      share: shareFechado,
      cta: {
        tipo: "folha",
        label: "Mandar um lembrete",
        tituloFolha: "Reforçar o convite",
        mensagem: `Oi ${nome}! Viu o imóvel que te mandei? Acho que tem tudo a ver com o que você procura: ${publicShareUrl(shareFechado.publicToken)}`,
      },
    };
  }

  // 8. Financiamento no ar: lembrar sem pressionar.
  const finAguardando = financing.find((f) => f.status === "enviada");
  if (finAguardando) {
    const prazo = finAguardando.expiresAt ? ` O link vale até ${dataCurta(finAguardando.expiresAt)}.` : "";
    return {
      titulo: "Lembrar do financiamento",
      porque: `${nome} ainda não enviou os dados para a simulação.${prazo}`,
      cta: {
        tipo: "folha",
        label: "Mandar um lembrete",
        tituloFolha: "Lembrar do financiamento",
        mensagem: `Oi ${nome}! Conseguiu preencher os dados do financiamento pelo link que te mandei? Com eles eu já preparo a sua simulação.`,
      },
    };
  }

  // Sem sinal nenhum (nada enviado): o bloco de imóveis já orienta o começo.
  return null;
}

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
