import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PARTICIPANT_RELATIONS,
  type ParticipantSummary,
  type UpsertParticipantDto,
} from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { TextField } from "../../components/ui/TextField";
import { ApiError } from "../../lib/http";
import { addParticipant, removeParticipant, updateParticipant } from "./api";
import { RELATION_LABELS, maskCpf } from "./labels";

export function ParticipantsSection({
  clientId,
  participants,
}: {
  clientId: string;
  participants: ParticipantSummary[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{ mode: "add" | "edit"; participant?: ParticipantSummary } | null>(
    null,
  );
  const [removeTarget, setRemoveTarget] = useState<ParticipantSummary | null>(null);

  const remove = useMutation({
    mutationFn: (participantId: string) => removeParticipant(clientId, participantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      setRemoveTarget(null);
    },
  });

  return (
    <section id="participantes" className="animate-rise scroll-mt-20 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-label uppercase tracking-wide text-text-subtle">Participantes</h2>
        <Button type="button" variant="ghost" className="!min-h-9 !px-3.5 text-body-sm" onClick={() => setForm({ mode: "add" })}>
          Adicionar
        </Button>
      </div>

      {participants.length === 0 ? (
        <p className="mt-3 text-body-sm text-text-muted">
          Cônjuge, comprador conjunto, fiador, dependente ou procurador. Adicione quando a operação
          exigir.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
          {participants.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-semibold text-text">{p.fullName}</p>
                <p className="mt-0.5 truncate text-caption text-text-subtle">
                  {RELATION_LABELS[p.relation]}
                  {p.cpf && <span> · {maskCpf(p.cpf)}</span>}
                  {p.phone && <span> · {p.phone}</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm({ mode: "edit", participant: p })}
                className="rounded-md px-2 py-1 text-caption font-semibold text-accent hover:bg-surface-sunken"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => setRemoveTarget(p)}
                className="rounded-md px-2 py-1 text-caption font-semibold text-[var(--danger-fg)] hover:bg-surface-sunken"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      {form && (
        <ParticipantFormModal
          clientId={clientId}
          participant={form.mode === "edit" ? form.participant : undefined}
          onClose={() => setForm(null)}
        />
      )}

      <ConfirmDialog
        open={removeTarget != null}
        title="Remover participante"
        description={removeTarget ? `Remover ${removeTarget.fullName} desta operação?` : ""}
        confirmLabel="Remover"
        danger
        loading={remove.isPending}
        onConfirm={() => removeTarget && remove.mutate(removeTarget.id)}
        onCancel={() => setRemoveTarget(null)}
      />
    </section>
  );
}

function ParticipantFormModal({
  clientId,
  participant,
  onClose,
}: {
  clientId: string;
  participant?: ParticipantSummary;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [relation, setRelation] = useState(participant?.relation ?? "");
  const [fullName, setFullName] = useState(participant?.fullName ?? "");
  const [cpf, setCpf] = useState(participant?.cpf ?? "");
  const [phone, setPhone] = useState(participant?.phone ?? "");
  const [email, setEmail] = useState(participant?.email ?? "");
  const [notes, setNotes] = useState(participant?.notes ?? "");

  const mutation = useMutation({
    mutationFn: () => {
      const dto: UpsertParticipantDto = {
        relation: relation as UpsertParticipantDto["relation"],
        fullName: fullName.trim(),
        cpf: cpf || null,
        phone: phone || null,
        email: email || null,
        notes: notes || null,
      };
      return participant
        ? updateParticipant(clientId, participant.id, dto)
        : addParticipant(clientId, dto);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar. Tente novamente."),
  });

  return (
    <Modal open onClose={onClose} title={participant ? "Editar participante" : "Novo participante"}>
      <form
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (!relation) return setError("Selecione a relação com o cliente.");
          if (fullName.trim().length < 2) return setError("Informe o nome do participante.");
          mutation.mutate();
        }}
      >
        {error && <Banner variant="danger">{error}</Banner>}
        <Select
          label="Relação com o cliente"
          value={relation}
          onValueChange={setRelation}
          placeholder="Selecione"
          options={PARTICIPANT_RELATIONS.map((r) => ({ value: r, label: RELATION_LABELS[r] }))}
        />
        <TextField label="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="CPF" value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" inputMode="numeric" />
          <TextField label="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </div>
        <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} />

        <div className="flex flex-col gap-2">
          <Button type="submit" variant="accent" loading={mutation.isPending}>
            Salvar
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
