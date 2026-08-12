import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, MailWarning, MailX, ShieldAlert } from "lucide-react";
import type {
  AdminAlert,
  AdminDashboardPeriod,
  AdminDashboardSummary,
} from "@nexlar/shared";
import { ADMIN_DASHBOARD_PERIODS, ADMIN_PERIOD_LABELS } from "@nexlar/shared";
import { Button } from "../../../components/ui/Button";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { adminHttp } from "../api/http";
import { useAdminAuth } from "../AdminAuthContext";
import { StatusDaConta, dataCurta } from "../users/status";
import { StatCard } from "./StatCard";

/**
 * Dashboard do Nextlar Admin (docs/10, Fase 2).
 *
 * A ordem da página é a ordem da decisão: primeiro o que pede ação, depois o
 * retrato das contas, o movimento do período e só então o volume de uso. Um
 * painel que abre com números bonitos e esconde a fila de pendências ensina
 * a pessoa a passar direto pelo topo.
 */

/** Como cada alerta se apresenta e, principalmente, para onde ele leva. */
const ALERTAS: Record<
  AdminAlert["kind"],
  {
    icone: typeof ShieldAlert;
    tom: "danger" | "warning";
    titulo: (n: number) => string;
    descricao: string;
    /** Sem destino: o alerta informa, mas quem resolve age fora do sistema. */
    acao?: string;
    para?: string;
  }
> = {
  contas_suspensas: {
    icone: ShieldAlert,
    tom: "danger",
    titulo: (n) => `${n} ${n === 1 ? "conta suspensa" : "contas suspensas"}`,
    descricao: "Sem acesso à plataforma até alguém reativar.",
    acao: "Revisar suspensões",
    para: "/admin/usuarios?status=suspenso",
  },
  verificacao_parada: {
    icone: MailWarning,
    tom: "warning",
    titulo: (n) => `${n} ${n === 1 ? "conta não confirmou" : "contas não confirmaram"} o e-mail`,
    descricao: "Cadastraram há mais de três dias e ainda não entraram.",
    acao: "Ver quem não confirmou",
    para: "/admin/usuarios?status=pendente_verificacao",
  },
  emails_falhando: {
    icone: MailX,
    // Vermelho, e não amarelo: é defeito acontecendo agora, não fila para
    // organizar. Quem pediu recuperação de senha está sem conseguir entrar.
    tom: "danger",
    titulo: (n) =>
      `${n} ${n === 1 ? "e-mail não saiu" : "e-mails não saíram"} nas últimas 24 horas`,
    descricao: "Quem pediu não recebeu nada, e a tela não avisou que falhou.",
  },
};

export function AdminDashboardPage() {
  const { admin } = useAdminAuth();
  const [periodo, setPeriodo] = useState<AdminDashboardPeriod>("30d");

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin", "dashboard", periodo],
    queryFn: () =>
      adminHttp.get<AdminDashboardSummary>(`/dashboard/summary?periodo=${periodo}`),
    // Trocar de período troca o recorte, não a página: os números antigos
    // ficam à vista, esmaecidos, em vez de a tela piscar em branco.
    placeholderData: (anterior) => anterior,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1 text-text">Dashboard</h1>
          <p className="mt-2 text-body text-text-muted">
            O que está acontecendo na plataforma agora.
          </p>
        </div>
        {/* Sem bloco algum para recortar, o seletor seria um controle que não
            controla nada: some em vez de enfeitar. */}
        {(isLoading || data?.contas) && (
          <SegmentedControl
            label="Período dos indicadores"
            value={periodo}
            onChange={setPeriodo}
            options={ADMIN_DASHBOARD_PERIODS.map((p) => ({
              value: p,
              label: ADMIN_PERIOD_LABELS[p],
            }))}
          />
        )}
      </header>

      {isLoading && <Esqueleto />}

      {isError && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-body text-text">Não foi possível carregar os indicadores.</p>
          <div className="mt-4 flex justify-center">
            <Button type="button" variant="ghost" onClick={() => void refetch()}>
              Tentar de novo
            </Button>
          </div>
        </div>
      )}

      {data && (
        <div className={`flex flex-col gap-8 ${isFetching ? "opacity-70" : ""}`}>
          {/* Perfil sem alcance sobre contas: a API devolve os blocos vazios
              de propósito, e a tela explica em vez de mostrar caixas zeradas. */}
          {!data.contas ? (
            <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
              <p className="text-body text-text">
                Seu perfil não acompanha indicadores de contas.
              </p>
              <p className="mt-2 text-caption text-text-subtle">
                Você entrou como {admin?.email}. Os números da plataforma aparecem para os
                perfis com acesso à gestão de usuários.
              </p>
            </div>
          ) : data.contas.total === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
              <p className="text-body text-text">Nenhuma conta de corretor ainda.</p>
              <p className="mt-2 text-caption text-text-subtle">
                Assim que a primeira pessoa se cadastrar, os indicadores aparecem aqui.
              </p>
            </div>
          ) : (
            <>
              <Secao titulo="Precisa de atenção">
                {data.alertas.length === 0 ? (
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
                    <CheckCircle2
                      size={20}
                      className="shrink-0 text-[var(--success-fg)]"
                      aria-hidden
                    />
                    <p className="text-body-sm text-text-muted">
                      Nada pendente. Nenhuma conta suspensa ou parada na confirmação, e os
                      e-mails estão saindo.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {data.alertas.map((alerta) => (
                      <CartaoDeAlerta key={alerta.kind} alerta={alerta} />
                    ))}
                  </div>
                )}
              </Secao>

              <Secao titulo="Contas" descricao="Retrato de agora, sem depender do período.">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                  <StatCard label="Total" value={data.contas.total} emphasis />
                  <StatCard label="Ativas" value={data.contas.ativas} />
                  <StatCard
                    label="Pendentes"
                    value={data.contas.pendentesVerificacao}
                    hint="dentro das ativas"
                  />
                  <StatCard label="Suspensas" value={data.contas.suspensas} />
                  <StatCard label="Bloqueadas" value={data.contas.bloqueadas} />
                  <StatCard label="Desativadas" value={data.contas.desativadas} />
                </div>
              </Secao>

              {data.movimento && (
                <Secao titulo="Movimento" descricao={comparacaoDoPeriodo(data.periodo)}>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard
                      label="Contas novas"
                      value={data.movimento.novasContas}
                      previous={data.movimento.novasContasAnterior}
                    />
                    <StatCard
                      label="Entraram no sistema"
                      value={data.movimento.contasAtivas}
                      previous={data.movimento.contasAtivasAnterior}
                    />
                    <StatCard
                      label="Confirmaram o e-mail"
                      value={data.movimento.confirmaramEmail}
                      hint="entre os cadastros do período"
                    />
                  </div>
                </Secao>
              )}

              {data.uso && (
                <Secao
                  titulo="Uso da plataforma"
                  descricao="Quanto os corretores produziram no período. Só contagens: o Admin não abre carteira de ninguém."
                >
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                    <StatCard label="Leads" value={data.uso.leads} />
                    <StatCard label="Clientes" value={data.uso.clientes} />
                    <StatCard label="Imóveis" value={data.uso.imoveis} />
                    <StatCard label="Seleções" value={data.uso.selecoes} />
                    <StatCard label="Visitas" value={data.uso.visitas} />
                  </div>
                </Secao>
              )}

              <Secao titulo="Cadastros recentes">
                <div className="overflow-hidden rounded-xl border border-border bg-surface">
                  {data.recentes.map((conta) => (
                    <Link
                      key={conta.id}
                      to={`/admin/usuarios/${conta.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 transition-colors last:border-b-0 hover:bg-bg"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text">{conta.fullName}</p>
                        <p className="truncate text-caption text-text-subtle">{conta.email}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusDaConta
                          status={conta.status}
                          emailVerified={conta.emailVerified}
                        />
                        <span className="text-caption tabular-nums text-text-subtle">
                          {dataCurta.format(new Date(conta.createdAt))}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </Secao>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A frase da comparação, escrita por extenso para cada período. Montar isso
 * interpolando o rótulo produziria "os hoje anteriores": rótulo de botão e
 * frase corrida são textos diferentes, e cada um merece o seu.
 */
function comparacaoDoPeriodo(periodo: AdminDashboardPeriod): string {
  if (periodo === "hoje") return "Comparado com ontem, até esta mesma hora.";
  return `Comparado com os ${ADMIN_PERIOD_LABELS[periodo].toLowerCase()} anteriores.`;
}

function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-caption font-semibold uppercase tracking-wide text-text-subtle">
        {titulo}
      </h2>
      {descricao && <p className="mt-1 text-caption text-text-subtle">{descricao}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CartaoDeAlerta({ alerta }: { alerta: AdminAlert }) {
  const config = ALERTAS[alerta.kind];
  const Icone = config.icone;
  const fundo = config.tom === "danger" ? "var(--danger-soft)" : "var(--warning-soft)";
  const frente = config.tom === "danger" ? "var(--danger-fg)" : "var(--warning-fg)";

  const conteudo = (
    <>
      <Icone size={20} className="mt-0.5 shrink-0" style={{ color: frente }} aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold text-text">{config.titulo(alerta.count)}</p>
        <p className="mt-0.5 text-caption text-text-muted">{config.descricao}</p>
        {/* O motivo cru do provedor. Feio de propósito: é para ser lido e
            pesquisado, não decorado. Poupa uma ida ao log do servidor. */}
        {alerta.detalhe && (
          <p className="mt-2 break-words font-mono text-caption text-text-subtle">
            {alerta.detalhe}
          </p>
        )}
        {config.acao && (
          <p className="mt-2 text-caption font-semibold" style={{ color: frente }}>
            {config.acao} →
          </p>
        )}
      </div>
    </>
  );

  const classes = "flex items-start gap-3 rounded-xl border p-4";
  const cor = { backgroundColor: fundo, borderColor: fundo };

  // Alerta sem destino não vira link: um cartão clicável que não leva a lugar
  // nenhum é pior do que um cartão que nunca prometeu levar.
  if (!config.para) {
    return (
      <div className={classes} style={cor}>
        {conteudo}
      </div>
    );
  }

  return (
    <Link to={config.para} className={`${classes} transition-shadow hover:shadow-sm`} style={cor}>
      {conteudo}
    </Link>
  );
}

/** Esqueleto com a forma da página final, para a tela não saltar ao carregar. */
function Esqueleto() {
  return (
    <div className="flex animate-pulse flex-col gap-8" aria-hidden>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="h-24 rounded-xl bg-surface-sunken" />
        <div className="h-24 rounded-xl bg-surface-sunken" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-24 rounded-xl bg-surface-sunken" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-surface-sunken" />
    </div>
  );
}
