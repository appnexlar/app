import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AdminAuditEntry } from "@nexlar/shared";
import { ADMIN_ROLE_LABELS, pesoDaAcao, rotuloDaAcao } from "@nexlar/shared";

/**
 * A trilha administrativa em forma de leitura (docs/10, Fase 5). Serve à
 * tela de auditoria e ao histórico dentro da ficha da conta, então não sabe
 * nada sobre filtros nem paginação: recebe linhas e as apresenta.
 *
 * Cada linha responde as quatro perguntas na ordem em que se pergunta: o que
 * aconteceu, com quem, por quem, quando. O antes e depois fica recolhido,
 * porque é o detalhe que se procura, não o que se varre com o olho.
 */

const formatoLongo = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Rótulo dos campos que aparecem no antes e depois. */
const CAMPOS: Record<string, string> = {
  status: "Situação",
  role: "Papel",
  via: "Entrou por",
  motivo: "Motivo da recusa",
  email: "E-mail",
  fullName: "Nome",
  googleEmail: "Conta Google",
};

/** Valores técnicos que ficariam feios crus na tela. */
const VALORES: Record<string, string> = {
  senha: "senha",
  google: "Google",
  senha_incorreta: "senha incorreta",
  conta_suspensa: "conta suspensa",
  ativo: "ativa",
  suspenso: "suspensa",
  bloqueado: "bloqueada",
  desativado: "desativada",
};

export function AuditTimeline({
  items,
  /** Na ficha da conta o alvo é sempre o mesmo, então repeti-lo é ruído. */
  ocultarAlvo = false,
}: {
  items: AdminAuditEntry[];
  ocultarAlvo?: boolean;
}) {
  return (
    <ol className="overflow-hidden rounded-xl border border-border bg-surface">
      {items.map((item) => (
        <LinhaDaTrilha key={item.id} item={item} ocultarAlvo={ocultarAlvo} />
      ))}
    </ol>
  );
}

function LinhaDaTrilha({ item, ocultarAlvo }: { item: AdminAuditEntry; ocultarAlvo: boolean }) {
  const [aberto, setAberto] = useState(false);
  const mudancas = diferencas(item);
  const destaque = pesoDaAcao(item.action) === "atencao";

  return (
    <li className="border-b border-border last:border-b-0">
      <div className="flex gap-3 p-4">
        <span
          aria-hidden
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
            destaque ? "bg-[var(--warning-fg)]" : "bg-border-strong"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-medium text-text">
              {rotuloDaAcao(item.action)}
              {!ocultarAlvo && <Alvo item={item} />}
            </p>
            <time
              dateTime={item.createdAt}
              className="text-caption tabular-nums text-text-subtle"
            >
              {formatoLongo.format(new Date(item.createdAt))}
            </time>
          </div>

          <p className="mt-0.5 text-caption text-text-muted">
            por {item.actor.fullName}{" "}
            <span className="text-text-subtle">({ADMIN_ROLE_LABELS[item.actor.role]})</span>
          </p>

          {item.reason && (
            <p className="mt-2 border-l-2 border-border pl-3 text-body-sm text-text">
              {item.reason}
            </p>
          )}

          {mudancas.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setAberto((v) => !v)}
                aria-expanded={aberto}
                className="mt-2 inline-flex items-center gap-1 text-caption font-semibold text-text-muted transition-colors hover:text-text focus-visible:shadow-focus"
              >
                {aberto ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                {/* Sem estado anterior nada mudou de fato: é detalhe do que
                    aconteceu (por onde entrou, por que foi recusado). */}
                {aberto
                  ? item.previousState
                    ? "Ocultar o que mudou"
                    : "Ocultar detalhes"
                  : item.previousState
                    ? "Ver o que mudou"
                    : "Ver detalhes"}
              </button>
              {aberto && (
                <dl className="mt-2 flex flex-col gap-1 rounded-lg bg-surface-sunken p-3">
                  {mudancas.map((m) => (
                    <div key={m.campo} className="flex flex-wrap items-baseline gap-x-2 text-caption">
                      <dt className="text-text-subtle">{m.rotulo}</dt>
                      <dd className="text-text">
                        {m.antes !== null && (
                          <>
                            <span className="line-through decoration-text-subtle">{m.antes}</span>
                            <span aria-hidden className="mx-1 text-text-subtle">
                              →
                            </span>
                            <span className="sr-only">passou para</span>
                          </>
                        )}
                        <span className="font-medium">{m.depois}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function Alvo({ item }: { item: AdminAuditEntry }) {
  if (!item.resourceId) return null;
  // Ação sobre a própria conta (entrar, ter a entrada recusada): dizer "em
  // Fulano por Fulano" na mesma linha não acrescenta nada.
  if (item.resourceId === item.actor.id) return null;

  // Alvo sem nome é alvo que não existe mais. A linha continua de pé, que é
  // exatamente o motivo de a trilha não ter chave estrangeira para ele.
  if (!item.resourceLabel) {
    return <span className="font-normal text-text-subtle"> em conta já excluída</span>;
  }
  return <span className="font-normal text-text-muted"> em {item.resourceLabel}</span>;
}

interface Mudanca {
  campo: string;
  rotulo: string;
  antes: string | null;
  depois: string;
}

/**
 * Une o estado anterior e o novo num par legível por campo. Campo que não
 * mudou de valor fica de fora: repetir "ativa vira ativa" não informa nada.
 */
function diferencas(item: AdminAuditEntry): Mudanca[] {
  const antes = item.previousState ?? {};
  const depois = item.newState ?? {};
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(depois)])];

  return campos
    .map((campo) => {
      const de = valor(antes[campo]);
      const para = valor(depois[campo]);
      if (para === null) return null;
      if (de === para) return null;
      return { campo, rotulo: CAMPOS[campo] ?? campo, antes: de, depois: para };
    })
    .filter((m): m is Mudanca => m !== null);
}

function valor(bruto: unknown): string | null {
  if (bruto === null || bruto === undefined) return null;
  const texto = String(bruto);
  return VALORES[texto] ?? texto;
}
