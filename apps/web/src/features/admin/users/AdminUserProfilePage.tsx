import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminBrokerProfile } from "@nexlar/shared";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Modal } from "../../../components/ui/Modal";
import { Spinner } from "../../../components/ui/Spinner";
import { TextField } from "../../../components/ui/TextField";
import { ApiError } from "../../../lib/http";
import { adminHttp } from "../api/http";
import { useAdminAuth } from "../AdminAuthContext";
import { StatusDaConta, dataCurta } from "./status";

/**
 * Perfil administrativo da conta (Task 14 da épica). Seções: resumo,
 * profissional (leitura), conta, uso agregado e ações. Nenhum dado pessoal
 * de lead ou cliente aparece aqui: o Admin cuida da conta, não da carteira.
 */
export function AdminUserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAdminAuth();
  const queryClient = useQueryClient();
  const [acao, setAcao] = useState<"suspender" | "reativar" | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => adminHttp.get<AdminBrokerProfile>(`/users/${id}`),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-border bg-surface p-8 text-center">
        <p className="text-body text-text">Não foi possível carregar esta conta.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button type="button" variant="ghost" onClick={() => void refetch()}>
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  const suspensa = data.status !== "ativo";

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/admin/usuarios" className="text-caption text-text-subtle hover:text-text">
        ← Usuários
      </Link>

      <header className="mb-8 mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-h1 text-text">{data.fullName}</h1>
            <StatusDaConta status={data.status} emailVerified={data.emailVerified} />
          </div>
          <p className="mt-1 text-body text-text-muted">{data.email}</p>
        </div>
        {can("admin.users.manage") && (
          <div>
            {!suspensa && (
              <Button type="button" variant="danger" onClick={() => setAcao("suspender")}>
                Suspender acesso
              </Button>
            )}
            {data.status === "suspenso" && (
              <Button type="button" onClick={() => setAcao("reativar")}>
                Reativar acesso
              </Button>
            )}
          </div>
        )}
      </header>

      {data.suspendedReason && (
        <div className="mb-6 rounded-xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] p-4">
          <p className="text-caption font-medium text-[var(--danger-fg)]">
            Suspensa em {data.suspendedAt ? dataCurta.format(new Date(data.suspendedAt)) : ""}
          </p>
          <p className="mt-1 text-body text-text">{data.suspendedReason}</p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Cartao titulo="Conta">
          <Linha rotulo="Cadastro" valor={dataCurta.format(new Date(data.createdAt))} />
          <Linha
            rotulo="Último acesso"
            valor={data.lastLoginAt ? dataCurta.format(new Date(data.lastLoginAt)) : "Nunca"}
          />
          <Linha rotulo="E-mail confirmado" valor={data.emailVerified ? "Sim" : "Não"} />
          <Linha
            rotulo="Formas de entrada"
            valor={[data.hasPassword && "Senha", data.hasGoogle && "Google"]
              .filter(Boolean)
              .join(" e ") || "Nenhuma"}
          />
          <Linha rotulo="Onboarding" valor={data.onboardingCompleto ? "Completo" : "Incompleto"} />
          <Linha
            rotulo="Termos aceitos"
            valor={data.termsAcceptedAt ? dataCurta.format(new Date(data.termsAcceptedAt)) : "Não"}
          />
        </Cartao>

        <Cartao titulo="Profissional">
          <Linha rotulo="Telefone" valor={data.phone ?? "Não informado"} />
          <Linha rotulo="Imobiliária" valor={data.agencyName ?? "Autônomo"} />
          <Linha
            rotulo="CRECI"
            valor={
              data.creci?.numero
                ? `${data.creci.numero}/${data.creci.uf ?? ""} (${data.creci.status})`
                : "Não informado"
            }
          />
        </Cartao>

        <Cartao titulo="Uso da plataforma" largura="md:col-span-2">
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            <Indicador rotulo="Leads" valor={data.usage.leads} />
            <Indicador rotulo="Clientes" valor={data.usage.clientes} />
            <Indicador rotulo="Imóveis" valor={data.usage.imoveis} />
            <Indicador rotulo="Seleções" valor={data.usage.selecoes} />
            <Indicador rotulo="Visitas" valor={data.usage.visitas} />
            <Indicador rotulo="Agenda" valor={data.usage.agendamentos} />
          </div>
        </Cartao>
      </div>

      {acao && (
        <AcaoDeStatusModal
          perfil={data}
          acao={acao}
          aoFechar={() => setAcao(null)}
          aoConcluir={() => {
            setAcao(null);
            void queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
            void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
          }}
        />
      )}
    </div>
  );
}

function Cartao({
  titulo,
  children,
  largura = "",
}: {
  titulo: string;
  children: ReactNode;
  largura?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-6 ${largura}`}>
      <h2 className="mb-4 text-caption font-semibold uppercase tracking-wide text-text-subtle">
        {titulo}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-caption text-text-subtle">{rotulo}</span>
      <span className="text-right text-[14px] text-text">{valor}</span>
    </div>
  );
}

function Indicador({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="text-center">
      <p className="text-h2 tabular-nums text-text">{valor}</p>
      <p className="text-caption text-text-subtle">{rotulo}</p>
    </div>
  );
}

function AcaoDeStatusModal({
  perfil,
  acao,
  aoFechar,
  aoConcluir,
}: {
  perfil: AdminBrokerProfile;
  acao: "suspender" | "reativar";
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const suspender = acao === "suspender";
  const [reason, setReason] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      adminHttp.post(`/users/${perfil.id}/${suspender ? "suspend" : "reactivate"}`, { reason }),
    onSuccess: aoConcluir,
    onError: (e) => {
      setConfirmando(false);
      setErro(e instanceof ApiError ? e.message : "Não foi possível concluir. Tente novamente.");
    },
  });

  return (
    <>
      <Modal
        open={!confirmando}
        onClose={aoFechar}
        title={suspender ? `Suspender ${perfil.fullName}` : `Reativar ${perfil.fullName}`}
      >
        <div className="flex flex-col gap-4">
          <p className="text-body text-text-muted">
            {suspender
              ? "A pessoa perde o acesso imediatamente e as sessões abertas são encerradas. Nenhum dado é apagado: leads, imóveis e agenda ficam intactos, à espera de uma reativação."
              : "A conta volta a entrar normalmente, com tudo como estava."}
          </p>
          <TextField
            label="Motivo"
            hint="Fica registrado na auditoria."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
          {erro && (
            <p role="alert" className="text-caption text-[var(--danger-fg)]">
              {erro}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant={suspender ? "danger" : "accent"}
              disabled={reason.trim().length < 5}
              onClick={() => setConfirmando(true)}
            >
              {suspender ? "Suspender acesso" : "Reativar acesso"}
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmando}
        title={suspender ? "Suspender esta conta?" : "Reativar esta conta?"}
        description={
          suspender
            ? `${perfil.fullName} (${perfil.email}) será desconectado agora e não conseguirá entrar até a reativação.`
            : `${perfil.fullName} (${perfil.email}) volta a entrar normalmente.`
        }
        confirmLabel={suspender ? "Suspender" : "Reativar"}
        danger={suspender}
        loading={mutation.isPending}
        onConfirm={() => mutation.mutate()}
        onCancel={() => setConfirmando(false)}
      />
    </>
  );
}
