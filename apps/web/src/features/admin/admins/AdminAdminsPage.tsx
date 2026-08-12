import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ADMIN_ROLES,
  ADMIN_ROLE_LABELS,
  type AdminRole,
  type AdminUserSummary,
} from "@nexlar/shared";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { Modal } from "../../../components/ui/Modal";
import { PasswordField } from "../../../components/ui/PasswordField";
import { Select } from "../../../components/ui/Select";
import { Spinner } from "../../../components/ui/Spinner";
import { TextField } from "../../../components/ui/TextField";
import { ApiError } from "../../../lib/http";
import { adminHttp } from "../api/http";
import { useAdminAuth } from "../AdminAuthContext";

const dataCurta = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

/**
 * Gestão do time administrativo (Task 3 da épica). Quem enxerga esta tela
 * tem admin.admins.view; criar e alterar exigem admin.admins.manage, e o
 * botão nem aparece sem ela. A API nega de qualquer jeito.
 */
export function AdminAdminsPage() {
  const { admin: eu, can } = useAdminAuth();
  const queryClient = useQueryClient();
  const podeGerenciar = can("admin.admins.manage");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "admins"],
    queryFn: () => adminHttp.get<AdminUserSummary[]>("/admins"),
  });

  const [criando, setCriando] = useState(false);
  const [alvoDeSuspensao, setAlvoDeSuspensao] = useState<AdminUserSummary | null>(null);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["admin", "admins"] });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 text-text">Administradores</h1>
          <p className="mt-2 text-body text-text-muted">
            Quem opera o Nextlar Admin e com qual papel.
          </p>
        </div>
        {podeGerenciar && (
          <Button type="button" onClick={() => setCriando(true)}>
            Convidar administrador
          </Button>
        )}
      </header>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-body text-text">Não foi possível carregar a lista.</p>
          <div className="mt-4 flex justify-center">
            <Button type="button" variant="ghost" onClick={() => void refetch()}>
              Tentar de novo
            </Button>
          </div>
        </div>
      )}

      {data && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[640px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-border text-caption text-text-subtle">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Papel</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Último acesso</th>
                {podeGerenciar && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {data.map((linha) => (
                <tr key={linha.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-text">{linha.fullName}</p>
                    <p className="text-caption text-text-subtle">{linha.email}</p>
                  </td>
                  <td className="px-4 py-3 text-text">{ADMIN_ROLE_LABELS[linha.role]}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ${
                        linha.status === "ativo"
                          ? "bg-[var(--success-soft)] text-[var(--success-fg)]"
                          : "bg-[var(--danger-soft)] text-[var(--danger-fg)]"
                      }`}
                    >
                      {linha.status === "ativo" ? "Ativo" : "Suspenso"}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-text-muted">
                    {linha.lastLoginAt ? dataCurta.format(new Date(linha.lastLoginAt)) : "Nunca"}
                  </td>
                  {podeGerenciar && (
                    <td className="px-4 py-3 text-right">
                      {linha.id !== eu?.id && linha.status === "ativo" && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setAlvoDeSuspensao(linha)}
                        >
                          Suspender
                        </Button>
                      )}
                      {linha.id !== eu?.id && linha.status === "suspenso" && (
                        <ReativarBotao linha={linha} aoConcluir={invalidar} />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {criando && (
        <CriarAdminModal aoFechar={() => setCriando(false)} aoConcluir={invalidar} />
      )}
      {alvoDeSuspensao && (
        <SuspenderModal
          linha={alvoDeSuspensao}
          aoFechar={() => setAlvoDeSuspensao(null)}
          aoConcluir={invalidar}
        />
      )}
    </div>
  );
}

function CriarAdminModal({
  aoFechar,
  aoConcluir,
}: {
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AdminRole>("suporte");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => adminHttp.post("/admins", { email, fullName, role, password }),
    onSuccess: () => {
      aoConcluir();
      aoFechar();
    },
    onError: (e) =>
      setErro(e instanceof ApiError ? e.message : "Não foi possível criar. Tente novamente."),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    mutation.mutate();
  }

  return (
    <Modal open onClose={aoFechar} title="Convidar administrador">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Nome completo"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <TextField
          label="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Select
          label="Papel"
          value={role}
          onValueChange={(v) => setRole(v as AdminRole)}
          options={ADMIN_ROLES.map((r) => ({ value: r, label: ADMIN_ROLE_LABELS[r] }))}
        />
        <PasswordField
          label="Senha inicial"
          hint="A pessoa troca no primeiro acesso. Combine por um canal seguro, nunca por e-mail."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
          <Button type="submit" loading={mutation.isPending}>
            Criar acesso
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SuspenderModal({
  linha,
  aoFechar,
  aoConcluir,
}: {
  linha: AdminUserSummary;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => adminHttp.patch(`/admins/${linha.id}`, { status: "suspenso", reason }),
    onSuccess: () => {
      aoConcluir();
      aoFechar();
    },
    onError: (e) => {
      setConfirmando(false);
      setErro(e instanceof ApiError ? e.message : "Não foi possível suspender.");
    },
  });

  return (
    <>
      <Modal open={!confirmando} onClose={aoFechar} title={`Suspender ${linha.fullName}`}>
        <div className="flex flex-col gap-4">
          <p className="text-body text-text-muted">
            A pessoa perde o acesso ao Admin imediatamente e as sessões abertas
            são encerradas. Nenhum dado é apagado.
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
              variant="danger"
              disabled={reason.trim().length < 5}
              onClick={() => setConfirmando(true)}
            >
              Suspender acesso
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmando}
        title="Suspender este acesso?"
        description={`${linha.fullName} (${linha.email}) não conseguirá mais entrar no Nextlar Admin até ser reativado.`}
        confirmLabel="Suspender"
        danger
        loading={mutation.isPending}
        onConfirm={() => mutation.mutate()}
        onCancel={() => setConfirmando(false)}
      />
    </>
  );
}

function ReativarBotao({
  linha,
  aoConcluir,
}: {
  linha: AdminUserSummary;
  aoConcluir: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      adminHttp.patch(`/admins/${linha.id}`, {
        status: "ativo",
        reason: "Reativação pelo painel",
      }),
    onSuccess: () => {
      setAberto(false);
      aoConcluir();
    },
  });

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setAberto(true)}>
        Reativar
      </Button>
      <ConfirmDialog
        open={aberto}
        title="Reativar este acesso?"
        description={`${linha.fullName} volta a entrar no Nextlar Admin com o mesmo papel de antes.`}
        confirmLabel="Reativar"
        loading={mutation.isPending}
        onConfirm={() => mutation.mutate()}
        onCancel={() => setAberto(false)}
      />
    </>
  );
}
