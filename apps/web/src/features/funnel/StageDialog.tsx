import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadStatus } from "@nexlar/shared";
import { LEAD_STATUSES } from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { TextField } from "../../components/ui/TextField";
import { ApiError } from "../../lib/http";
import { changeLeadStatus } from "../leads/api";
import { STATUS_LABELS } from "../leads/labels";

interface StageDialogProps {
  lead: { id: string; fullName: string; status: LeadStatus };
  /** Etapa pré-selecionada (ex.: soltou o card na coluna de encerradas). */
  initialStatus?: LeadStatus;
  onClose: () => void;
}

/**
 * Muda a etapa da lead no funil. "Cliente" nunca aparece como opção: a
 * conversão é uma ação própria (LEAD-13). Perdida pede motivo e Reativar pede
 * data; a API valida de novo e cria a tarefa de reativação.
 */
export function StageDialog({ lead, initialStatus, onClose }: StageDialogProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LeadStatus>(initialStatus ?? lead.status);
  const [lostReason, setLostReason] = useState("");
  const [reactivateAt, setReactivateAt] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const options = LEAD_STATUSES.filter((s) => s !== "convertida_em_cliente").map((s) => ({
    value: s,
    label: STATUS_LABELS[s],
  }));

  const mutation = useMutation({
    mutationFn: () =>
      changeLeadStatus(lead.id, status, {
        lostReason: status === "perdida" ? lostReason.trim() : undefined,
        reactivateAt: status === "reativar_futuro" ? reactivateAt : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
      onClose();
    },
  });

  const submit = () => {
    setFieldError(null);
    if (status === "perdida" && !lostReason.trim()) {
      setFieldError("Informe o motivo da perda.");
      return;
    }
    if (status === "reativar_futuro" && !reactivateAt) {
      setFieldError("Informe a data para reativar o contato.");
      return;
    }
    mutation.mutate();
  };

  const apiMessage =
    mutation.error instanceof ApiError && mutation.error.status !== 500
      ? mutation.error.message
      : "Não foi possível mudar a etapa agora. Tente novamente.";

  return (
    <Modal open onClose={onClose} title="Alterar etapa">
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-text-muted">
          {lead.fullName} está em{" "}
          <span className="font-semibold text-text">{STATUS_LABELS[lead.status]}</span>.
        </p>

        <Select
          label="Nova etapa"
          value={status}
          options={options}
          onValueChange={(v) => {
            setStatus(v as LeadStatus);
            setFieldError(null);
          }}
        />

        {status === "perdida" && (
          <TextField
            label="Motivo da perda"
            placeholder="Ex.: comprou com outro corretor"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            error={fieldError ?? undefined}
            autoFocus
          />
        )}

        {status === "reativar_futuro" && (
          <TextField
            label="Reativar em"
            type="date"
            value={reactivateAt}
            onChange={(e) => setReactivateAt(e.target.value)}
            error={fieldError ?? undefined}
            hint="Uma tarefa de reativação será criada para esta data."
          />
        )}

        {mutation.isError && <Banner variant="danger">{apiMessage}</Banner>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="accent"
            disabled={mutation.isPending || status === lead.status}
            onClick={submit}
          >
            {mutation.isPending ? "Salvando..." : "Salvar etapa"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
