import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CONSENT_TEXT,
  CONVERSION_NEXT_STEPS,
  CONVERSION_REASONS,
  CLIENT_PURPOSES,
  type ConvertLeadDto,
} from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { TextField } from "../../components/ui/TextField";
import { ApiError } from "../../lib/http";
import { fetchProperties } from "../properties/api";
import { convertLead } from "./api";
import { NEXT_STEP_LABELS, PURPOSE_LABELS, REASON_LABELS } from "./labels";

interface Props {
  lead: { id: string; fullName: string };
  onClose: () => void;
  onConverted: (clientId: string) => void;
}

export function ConvertDialog({ lead, onClose, onConverted }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"form" | "confirm">("form");

  const [reason, setReason] = useState("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [purpose, setPurpose] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const propertiesQuery = useQuery({
    queryKey: ["properties", "picker"],
    queryFn: () => fetchProperties({ perPage: 50 }),
  });

  const propertyOptions = useMemo(
    () => [
      { value: "", label: "Sem imóvel relacionado" },
      ...(propertiesQuery.data?.items ?? []).map((p) => ({
        value: p.id,
        label: `#${p.code} · ${p.title}`,
      })),
    ],
    [propertiesQuery.data],
  );

  const mutation = useMutation({
    mutationFn: () => {
      const dto: ConvertLeadDto = {
        reason: reason as ConvertLeadDto["reason"],
        reasonDetail: reason === "outro" ? reasonDetail.trim() : undefined,
        nextStep: nextStep as ConvertLeadDto["nextStep"],
        purpose: purpose as ConvertLeadDto["purpose"],
        propertyId: propertyId || undefined,
        consent: true,
      };
      return convertLead(lead.id, dto);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      onConverted(lead.id);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Não foi possível converter. Tente novamente.");
      setStep("form");
    },
  });

  function goConfirm() {
    setError(null);
    if (!reason) return setError("Selecione o motivo da conversão.");
    if (reason === "outro" && !reasonDetail.trim()) return setError("Descreva o motivo da conversão.");
    if (!nextStep) return setError("Selecione a próxima etapa.");
    if (!purpose) return setError("Selecione a finalidade do atendimento.");
    if (!consent) return setError("Confirme a ciência sobre a coleta de dados adicionais.");
    setStep("confirm");
  }

  if (step === "confirm") {
    return (
      <Modal open onClose={onClose} title="Converter esta lead em cliente?">
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-3.5">
            <p className="text-body-sm text-text">
              Ao converter {lead.fullName} em cliente, serão liberados campos adicionais e áreas com
              dados pessoais e financeiros. Todo o histórico anterior será preservado.
            </p>
          </div>
          <dl className="flex flex-col gap-1.5 text-body-sm">
            <Row label="Motivo" value={REASON_LABELS[reason as keyof typeof REASON_LABELS]} />
            <Row label="Próxima etapa" value={NEXT_STEP_LABELS[nextStep as keyof typeof NEXT_STEP_LABELS]} />
            <Row label="Finalidade" value={PURPOSE_LABELS[purpose as keyof typeof PURPOSE_LABELS]} />
          </dl>
          {error && <Banner variant="danger">{error}</Banner>}
          <div className="flex flex-col gap-2">
            <Button type="button" variant="accent" loading={mutation.isPending} onClick={() => mutation.mutate()}>
              Confirmar conversão
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep("form")}>
              Voltar
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Converter esta lead em cliente?">
      <form
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1"
        onSubmit={(e) => {
          e.preventDefault();
          goConfirm();
        }}
      >
        <p className="text-body-sm text-text-muted">
          Use esta ação quando a pessoa avançar para uma etapa que exija informações adicionais,
          documentos, análise financeira, proposta ou negociação formal.
        </p>
        {error && <Banner variant="danger">{error}</Banner>}

        <Select
          label="Motivo da conversão"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Selecione"
          options={CONVERSION_REASONS.map((r) => ({ value: r, label: REASON_LABELS[r] }))}
        />
        {reason === "outro" && (
          <TextField
            label="Descreva o motivo"
            value={reasonDetail}
            onChange={(e) => setReasonDetail(e.target.value)}
            placeholder="Qual o motivo da conversão?"
          />
        )}

        <Select
          label="Próxima etapa"
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          placeholder="Selecione"
          options={CONVERSION_NEXT_STEPS.map((n) => ({ value: n, label: NEXT_STEP_LABELS[n] }))}
        />

        <Select
          label="Finalidade do atendimento"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="Selecione"
          options={CLIENT_PURPOSES.map((p) => ({ value: p, label: PURPOSE_LABELS[p] }))}
        />

        <Select
          label="Imóvel relacionado (opcional)"
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          options={propertyOptions}
        />

        <div className="rounded-xl bg-surface-sunken p-3.5">
          <p className="text-caption text-text-muted">{CONSENT_TEXT}</p>
          <div className="mt-2.5">
            <Checkbox
              label="Confirmo que a pessoa tem ciência da coleta de dados adicionais para esta finalidade."
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button type="submit" variant="accent">
            Continuar
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-subtle">{label}</dt>
      <dd className="font-medium text-text">{value}</dd>
    </div>
  );
}
