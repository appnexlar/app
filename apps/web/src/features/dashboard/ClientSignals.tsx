import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  ChevronRight,
  Heart,
  Landmark,
  MailOpen,
  MessageCircleQuestion,
  UserPlus,
} from "lucide-react";
import type { NotificationDTO } from "@nexlar/shared";
import { ICON } from "../../components/ui/icon";
import { fetchNotifications, markNotificationRead } from "../notifications/api";

/**
 * "Seus clientes agiram": o que veio de fora, no topo da home.
 *
 * O Radar mostra o que o corretor ainda não fez. Isto mostra o contrário: o
 * que o cliente fez e está esperando resposta. Sinal de cliente que só existe
 * dentro do sino vira sinal perdido, então ele sobe para a primeira dobra.
 *
 * A fonte é a mesma das notificações, sem endpoint novo: aqui ficam só os
 * tipos que representam ação do cliente, e só os não lidos.
 */

/** Tipos que são ação do cliente. Aviso de sistema (expirou) fica de fora. */
const SINAIS: Record<string, { icone: typeof Heart; urgente?: boolean }> = {
  novo_lead_pagina_publica: { icone: UserPlus, urgente: true },
  nova_demonstracao_interesse: { icone: Heart, urgente: true },
  selecao_gostou: { icone: Heart },
  selecao_visita: { icone: CalendarCheck, urgente: true },
  selecao_visita_agendada: { icone: CalendarCheck, urgente: true },
  selecao_visita_cancelada: { icone: CalendarCheck },
  selecao_informacoes: { icone: MessageCircleQuestion, urgente: true },
  selecao_aberta: { icone: MailOpen },
  selecao_descartou: { icone: Heart },
  selecao_todos_descartados: { icone: Heart, urgente: true },
  financiamento_aberto: { icone: MailOpen },
  financiamento_respondido: { icone: Landmark, urgente: true },
};

const MAXIMO = 4;
/**
 * Janela de relevância. O corte NÃO é "não lido": abrir o sino de passagem
 * apagaria o alerta, e o cliente continuaria esperando resposta. O que define
 * é ser recente; o não lido só vem primeiro e com mais peso visual.
 */
const DIAS_RELEVANTES = 7;

export function ClientSignals() {
  const queryClient = useQueryClient();

  const consulta = useQuery({
    queryKey: ["notificacoes"],
    queryFn: fetchNotifications,
  });

  const marcarLida = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notificacoes"] }),
  });

  const limite = Date.now() - DIAS_RELEVANTES * 24 * 60 * 60 * 1000;
  const recentes = (consulta.data?.items ?? [])
    .filter((n) => SINAIS[n.type] && new Date(n.createdAt).getTime() >= limite)
    // Não lido primeiro; dentro de cada grupo, o mais novo na frente.
    .sort((a, b) => {
      const naoLido = Number(Boolean(a.readAt)) - Number(Boolean(b.readAt));
      return naoLido !== 0 ? naoLido : b.createdAt.localeCompare(a.createdAt);
    });

  if (recentes.length === 0) return null;

  const sinais = recentes.slice(0, MAXIMO);
  const restantes = recentes.length - sinais.length;

  return (
    <section className="animate-rise mt-8" style={{ animationDelay: "40ms" }}>
      {/* No celular a legenda desce; título e legenda disputando a mesma linha
          quebram os dois pela metade. */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2">
        <h2 className="text-h3 text-text">Seus clientes agiram</h2>
        <span className="text-body-sm text-text-subtle">responda enquanto está quente</span>
      </div>

      <ul className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        {sinais.map((sinal) => (
          <SinalRow key={sinal.id} sinal={sinal} onAbrir={() => marcarLida.mutate(sinal.id)} />
        ))}
      </ul>

      {restantes > 0 && (
        <p className="mt-2 text-body-sm text-text-subtle">
          e mais {restantes} {restantes === 1 ? "aviso" : "avisos"} no sino.
        </p>
      )}
    </section>
  );
}

function SinalRow({ sinal, onAbrir }: { sinal: NotificationDTO; onAbrir: () => void }) {
  const def = SINAIS[sinal.type];
  const Icone = def.icone;
  const destino = sinal.actionUrl ?? "/leads";
  // Peso visual só para o que ainda não foi visto: destaque em tudo é
  // destaque em nada.
  const novo = !sinal.readAt;

  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        to={destino}
        onClick={onAbrir}
        className="flex min-h-[var(--tap-target-min)] items-center gap-4 px-4 py-4 transition-colors hover:bg-surface-hover sm:px-6"
      >
        <span
          className={
            "flex h-10 w-10 flex-none items-center justify-center rounded-2xl " +
            (novo && def.urgente
              ? "bg-accent-soft text-accent"
              : "bg-surface-sunken text-text-muted")
          }
        >
          <Icone size={ICON.row} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          {/* Duas linhas para o título: quem agiu e o que fez precisa caber
              em 375px sem virar reticências. */}
          <span
            className={
              "block text-body leading-snug text-text " + (novo ? "font-semibold" : "font-normal")
            }
          >
            {sinal.title}
          </span>
          {/* Sem "block" aqui: ele anula o display que o line-clamp precisa. */}
          <span className="mt-1 line-clamp-2 text-body-sm text-text-muted">{sinal.body}</span>
        </span>
        <span className="flex flex-none items-center gap-2">
          {novo && (
            <span className="h-2 w-2 rounded-full bg-accent" aria-label="não visto" />
          )}
          <span className="hidden text-caption text-text-subtle sm:block">{quando(sinal.createdAt)}</span>
          <ChevronRight size={ICON.row} className="text-text-subtle" aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

/** "agora", "há 2 h", "ontem", ou a data. Tempo relativo curto, sem biblioteca. */
function quando(iso: string): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 2) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  if (horas < 48) return "ontem";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
