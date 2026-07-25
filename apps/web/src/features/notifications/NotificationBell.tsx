import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationDTO } from "@nexlar/shared";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "./api";

/**
 * O sino do cabeçalho. Existe por causa da página pública: quando alguém
 * demonstra interesse num imóvel, o corretor precisa saber sem depender de
 * abrir a lista de leads e reparar que apareceu um nome novo.
 *
 * Consulta em intervalo, sem tempo real: o volume é baixo e um minuto de
 * atraso não muda nada para quem vai responder no WhatsApp.
 */
const INTERVALO = 60_000;

export function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const consulta = useQuery({
    queryKey: ["notificacoes"],
    queryFn: fetchNotifications,
    refetchInterval: INTERVALO,
    // Voltar para a aba é o momento mais provável de ter chegado coisa nova.
    refetchOnWindowFocus: true,
  });

  const aplicar = (dados: Awaited<ReturnType<typeof fetchNotifications>>) =>
    queryClient.setQueryData(["notificacoes"], dados);

  const marcarUma = useMutation({ mutationFn: markNotificationRead, onSuccess: aplicar });
  const marcarTodas = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: aplicar });

  useEffect(() => {
    if (!aberto) return;
    const clique = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", clique);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", clique);
      document.removeEventListener("keydown", escape);
    };
  }, [aberto]);

  const itens = consulta.data?.items ?? [];
  const naoLidas = consulta.data?.unreadCount ?? 0;

  const abrir = (n: NotificationDTO) => {
    setAberto(false);
    if (!n.readAt) marcarUma.mutate(n.id);
    if (n.actionUrl) navigate(n.actionUrl);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={naoLidas > 0 ? `Notificações, ${naoLidas} não lidas` : "Notificações"}
        className="relative flex h-10 w-10 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-sunken hover:text-text focus-visible:shadow-focus"
      >
        <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M18 8.4A6 6 0 006 8.4c0 4.2-1.8 5.4-1.8 5.4h15.6S18 12.6 18 8.4z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M13.7 17.4a2 2 0 01-3.4 0"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
        {naoLidas > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold tabular-nums text-accent-on">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Notificações"
          // No celular o painel se ancora na TELA, com a mesma margem dos dois
          // lados: preso ao botão do sino ele nasceria fora da borda esquerda,
          // porque é mais largo do que a distância do sino até a direita. No
          // desktop cai sob o sino, como todo menu.
          className="animate-rise fixed inset-x-4 top-[4.5rem] z-[var(--z-modal)] overflow-hidden rounded-xl border border-border bg-surface shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <p className="text-body-sm font-semibold text-text">Notificações</p>
            {naoLidas > 0 && (
              <button
                type="button"
                onClick={() => marcarTodas.mutate()}
                disabled={marcarTodas.isPending}
                className="text-caption font-semibold text-accent transition-colors hover:text-accent-hover disabled:opacity-50"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          {itens.length === 0 ? (
            <p className="px-4 py-8 text-center text-body-sm text-text-muted">
              Quando alguém demonstrar interesse num imóvel da sua página, o aviso aparece aqui.
            </p>
          ) : (
            <ul className="max-h-[min(24rem,60vh)] overflow-y-auto">
              {itens.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => abrir(n)}
                    className={`flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-sunken ${
                      n.readAt ? "" : "bg-accent-soft"
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 flex-none rounded-full ${
                        n.readAt ? "bg-transparent" : "bg-accent"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-sm font-semibold text-text">{n.title}</span>
                      <span className="mt-0.5 block text-body-sm text-text-muted">{n.body}</span>
                      <span className="mt-1 block text-caption text-text-subtle">
                        {quando(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** "Agora", "há 20 min", "há 3 h", ou a data curta quando passa de um dia. */
function quando(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutos < 1) return "Agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}
