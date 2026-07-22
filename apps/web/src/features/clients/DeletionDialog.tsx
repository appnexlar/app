import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RequestDeletionDto } from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { TextField } from "../../components/ui/TextField";
import { ApiError } from "../../lib/http";
import { requestDeletion } from "./api";

/**
 * Exclusão controlada (LGPD). Não é um botão simples: mostra o impacto e
 * registra a SOLICITAÇÃO. A exclusão/anonimização efetiva passa por análise de
 * retenção (dados fiscais/contratuais podem ter guarda obrigatória).
 */
export function DeletionDialog({
  clientId,
  clientName,
  onClose,
}: {
  clientId: string;
  clientName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const dto: RequestDeletionDto = { reason: reason.trim() || null };
      return requestDeletion(clientId, dto);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Não foi possível registrar. Tente novamente."),
  });

  return (
    <Modal open onClose={onClose} title="Solicitar exclusão de dados">
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3.5">
          <p className="text-body-sm font-semibold text-[var(--danger-fg)]">O que acontece</p>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-caption text-text-muted">
            <li>Registra a solicitação de exclusão de {clientName}.</li>
            <li>Serão avaliados dados pessoais, financeiros e participantes.</li>
            <li>Registros com retenção obrigatória (fiscais, contratuais) passam por análise antes de apagar ou anonimizar.</li>
            <li>A exclusão não é imediata: fica registrada para tratamento.</li>
          </ul>
        </div>
        {error && <Banner variant="danger">{error}</Banner>}
        <TextField
          label="Motivo"
          optionalLabel="opcional"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex.: solicitação do titular"
        />
        <div className="flex flex-col gap-2">
          <Button type="button" variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Registrar solicitação
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
