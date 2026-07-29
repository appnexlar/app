import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  INCOME_TYPES,
  MARITAL_STATUSES,
  PAYMENT_METHODS,
  type ClientFinancialData,
  type ClientNegotiationData,
  type ClientProfileData,
  type UpdateClientFinancialDto,
  type UpdateClientNegotiationDto,
  type UpdateClientProfileDto,
} from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { DatePicker } from "../../components/ui/DatePicker";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { Spinner } from "../../components/ui/Spinner";
import { TextField } from "../../components/ui/TextField";
import { lookupCep } from "../../lib/cep";
import { ApiError } from "../../lib/http";
import { updateClientFinancial, updateClientNegotiation, updateClientProfile } from "./api";
import { INCOME_LABELS, MARITAL_LABELS, PAYMENT_LABELS } from "./labels";

/**
 * Edição progressiva: nenhum campo é obrigatório. O corretor preenche só o
 * que a etapa atual pede; erro de rede nunca apaga o que foi digitado.
 */
export function ProfileFormModal({
  clientId,
  profile,
  onClose,
}: {
  clientId: string;
  profile: ClientProfileData | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    cpf: profile?.cpf ?? "",
    rg: profile?.rg ?? "",
    birthDate: profile?.birthDate ?? "",
    maritalStatus: profile?.maritalStatus ?? "",
    nationality: profile?.nationality ?? "",
    residenceCountry: profile?.residenceCountry ?? "",
    cep: profile?.cep ?? "",
    street: profile?.street ?? "",
    addressNumber: profile?.addressNumber ?? "",
    complement: profile?.complement ?? "",
    neighborhood: profile?.neighborhood ?? "",
    city: profile?.city ?? "",
    state: profile?.state ?? "",
    altPhone: profile?.altPhone ?? "",
  });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  /** O Select entrega o valor direto, não o evento. */
  const setValor = (key: keyof typeof form) => (valor: string) =>
    setForm((f) => ({ ...f, [key]: valor }));

  const [cepLoading, setCepLoading] = useState(false);
  const [cepNotFound, setCepNotFound] = useState(false);

  // Ao completar os 8 dígitos do CEP, busca e preenche rua, bairro, cidade e UF.
  async function handleCep(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    setForm((f) => ({ ...f, cep: digits }));
    setCepNotFound(false);
    if (digits.length !== 8) return;
    setCepLoading(true);
    const address = await lookupCep(digits);
    setCepLoading(false);
    if (!address) {
      setCepNotFound(true);
      return;
    }
    setForm((f) => ({
      ...f,
      street: address.street || f.street,
      neighborhood: address.neighborhood || f.neighborhood,
      city: address.city || f.city,
      state: address.state || f.state,
    }));
  }

  const mutation = useMutation({
    mutationFn: () => updateClientProfile(clientId, form as UpdateClientProfileDto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar. Tente novamente."),
  });

  return (
    <Modal open onClose={onClose} title="Dados pessoais">
      <form
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          mutation.mutate();
        }}
      >
        <p className="text-caption text-text-muted">
          Preencha só o necessário para a etapa atual. Nada aqui é obrigatório.
        </p>
        {error && <Banner variant="danger">{error}</Banner>}

        <div className="grid grid-cols-2 gap-3">
          <TextField label="CPF" value={form.cpf} onChange={set("cpf")} placeholder="000.000.000-00" inputMode="numeric" />
          <TextField label="RG" value={form.rg} onChange={set("rg")} />
        </div>
        <DatePicker
          label="Nascimento"
          value={form.birthDate}
          onChange={(v) => setForm((f) => ({ ...f, birthDate: v }))}
          maxYear={new Date().getFullYear()}
        />
        <Select
          label="Estado civil"
          value={form.maritalStatus}
          onValueChange={setValor("maritalStatus")}
          placeholder="Selecione"
          options={MARITAL_STATUSES.map((m) => ({ value: m, label: MARITAL_LABELS[m] }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Nacionalidade" value={form.nationality} onChange={set("nationality")} />
          <TextField label="País de residência" value={form.residenceCountry} onChange={set("residenceCountry")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="CEP"
            value={form.cep}
            onChange={handleCep}
            placeholder="00000-000"
            inputMode="numeric"
            maxLength={9}
            hint={cepNotFound ? undefined : "Preenche o endereço automaticamente"}
            error={cepNotFound ? "CEP não encontrado. Preencha manualmente." : undefined}
            trailing={cepLoading ? <Spinner className="h-4 w-4 text-text-subtle" /> : undefined}
          />
          <TextField label="UF" value={form.state} onChange={set("state")} placeholder="SP" maxLength={2} />
        </div>
        <TextField label="Endereço" value={form.street} onChange={set("street")} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Número" value={form.addressNumber} onChange={set("addressNumber")} />
          <TextField label="Complemento" value={form.complement} onChange={set("complement")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Bairro" value={form.neighborhood} onChange={set("neighborhood")} />
          <TextField label="Cidade" value={form.city} onChange={set("city")} />
        </div>
        <TextField label="Telefone alternativo" value={form.altPhone} onChange={set("altPhone")} inputMode="tel" />

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

export function NegotiationFormModal({
  clientId,
  negotiation,
  onClose,
}: {
  clientId: string;
  negotiation: ClientNegotiationData | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [propertyValue, setPropertyValue] = useState(
    negotiation?.propertyValue != null ? String(negotiation.propertyValue) : "",
  );
  const [interestDate, setInterestDate] = useState(negotiation?.interestDate ?? "");
  const [expectedTerm, setExpectedTerm] = useState(negotiation?.expectedTerm ?? "");
  const [paymentMethod, setPaymentMethod] = useState(negotiation?.paymentMethod ?? "");
  const [needsFinancing, setNeedsFinancing] = useState(
    negotiation?.needsFinancing == null ? "" : negotiation.needsFinancing ? "sim" : "nao",
  );
  const [notes, setNotes] = useState(negotiation?.notes ?? "");

  const mutation = useMutation({
    mutationFn: () => {
      const dto: UpdateClientNegotiationDto = {
        propertyValue: propertyValue ? Number(propertyValue) : null,
        interestDate: interestDate || null,
        expectedTerm: expectedTerm || null,
        paymentMethod: (paymentMethod || null) as UpdateClientNegotiationDto["paymentMethod"],
        needsFinancing: needsFinancing === "" ? null : needsFinancing === "sim",
        notes: notes || null,
      };
      return updateClientNegotiation(clientId, dto);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar. Tente novamente."),
  });

  return (
    <Modal open onClose={onClose} title="Dados da negociação">
      <form
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (propertyValue && Number(propertyValue) <= 0) {
            setError("O valor do imóvel precisa ser maior que zero.");
            return;
          }
          mutation.mutate();
        }}
      >
        {error && <Banner variant="danger">{error}</Banner>}

        <TextField
          label="Valor do imóvel"
          leading="R$"
          value={propertyValue}
          onChange={(e) => setPropertyValue(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
        />
        <DatePicker label="Data de interesse" value={interestDate} onChange={setInterestDate} />
        <TextField label="Prazo esperado" value={expectedTerm} onChange={(e) => setExpectedTerm(e.target.value)} placeholder="Ex.: 3 meses" />
        <Select
          label="Forma de pagamento pretendida"
          value={paymentMethod}
          onValueChange={setPaymentMethod}
          placeholder="Selecione"
          options={PAYMENT_METHODS.map((p) => ({ value: p, label: PAYMENT_LABELS[p] }))}
        />
        <Select
          label="Precisa de financiamento?"
          value={needsFinancing}
          onValueChange={setNeedsFinancing}
          placeholder="Selecione"
          options={[
            { value: "sim", label: "Sim" },
            { value: "nao", label: "Não" },
          ]}
        />
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

export function FinancialFormModal({
  clientId,
  financial,
  onClose,
}: {
  clientId: string;
  financial: ClientFinancialData | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [incomeType, setIncomeType] = useState(financial?.incomeType ?? "");
  const [monthlyIncome, setMonthlyIncome] = useState(
    financial?.monthlyIncome != null ? String(financial.monthlyIncome) : "",
  );
  const [occupation, setOccupation] = useState(financial?.occupation ?? "");
  const [activityTime, setActivityTime] = useState(financial?.activityTime ?? "");
  const [downPayment, setDownPayment] = useState(
    financial?.downPayment != null ? String(financial.downPayment) : "",
  );
  const [hasFgts, setHasFgts] = useState(
    financial?.hasFgts == null ? "" : financial.hasFgts ? "sim" : "nao",
  );
  const [preferredBank, setPreferredBank] = useState(financial?.preferredBank ?? "");
  const [hasComposition, setHasComposition] = useState(
    financial?.hasIncomeComposition == null ? "" : financial.hasIncomeComposition ? "sim" : "nao",
  );
  const [dependents, setDependents] = useState(
    financial?.dependentsCount != null ? String(financial.dependentsCount) : "",
  );
  const [notes, setNotes] = useState(financial?.notes ?? "");

  const mutation = useMutation({
    mutationFn: () => {
      const dto: UpdateClientFinancialDto = {
        incomeType: (incomeType || null) as UpdateClientFinancialDto["incomeType"],
        monthlyIncome: monthlyIncome ? Number(monthlyIncome) : null,
        occupation: occupation || null,
        activityTime: activityTime || null,
        downPayment: downPayment ? Number(downPayment) : null,
        hasFgts: hasFgts === "" ? null : hasFgts === "sim",
        preferredBank: preferredBank || null,
        hasIncomeComposition: hasComposition === "" ? null : hasComposition === "sim",
        dependentsCount: dependents ? Number(dependents) : null,
        notes: notes || null,
      };
      return updateClientFinancial(clientId, dto);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar. Tente novamente."),
  });

  return (
    <Modal open onClose={onClose} title="Dados financeiros">
      <form
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          mutation.mutate();
        }}
      >
        <div className="rounded-xl bg-surface-sunken p-3 text-caption text-text-muted">
          Área sensível (LGPD). Estes dados não aparecem em listagens nem no Dashboard.
        </div>
        {error && <Banner variant="danger">{error}</Banner>}

        <Select
          label="Tipo de renda"
          value={incomeType}
          onValueChange={setIncomeType}
          placeholder="Selecione"
          options={INCOME_TYPES.map((t) => ({ value: t, label: INCOME_LABELS[t] }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Renda mensal"
            leading="R$"
            value={monthlyIncome}
            onChange={(e) => setMonthlyIncome(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
          />
          <TextField
            label="Entrada disponível"
            leading="R$"
            value={downPayment}
            onChange={(e) => setDownPayment(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
          />
        </div>
        <TextField label="Empresa ou atividade" value={occupation} onChange={(e) => setOccupation(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Tempo de atividade" value={activityTime} onChange={(e) => setActivityTime(e.target.value)} placeholder="Ex.: 3 anos" />
          <TextField
            label="Dependentes"
            value={dependents}
            onChange={(e) => setDependents(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Possui FGTS?"
            value={hasFgts}
            onValueChange={setHasFgts}
            placeholder="Selecione"
            options={[
              { value: "sim", label: "Sim" },
              { value: "nao", label: "Não" },
            ]}
          />
          <Select
            label="Composição de renda?"
            value={hasComposition}
            onValueChange={setHasComposition}
            placeholder="Selecione"
            options={[
              { value: "sim", label: "Sim" },
              { value: "nao", label: "Não" },
            ]}
          />
        </div>
        <TextField label="Instituição preferencial" value={preferredBank} onChange={(e) => setPreferredBank(e.target.value)} />
        <TextField label="Observações financeiras" value={notes} onChange={(e) => setNotes(e.target.value)} />

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
