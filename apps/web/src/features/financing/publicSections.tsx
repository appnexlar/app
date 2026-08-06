import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import {
  COMMITMENT_TYPES,
  COMMITMENT_TYPE_LABELS,
  DOWN_PAYMENT_SOURCES,
  EMPLOYMENT_SITUATIONS,
  EMPLOYMENT_SITUATION_LABELS,
  FINANCING_GOALS,
  FINANCING_MAX_PARTICIPANTS,
  MARITAL_STATUS_OPTIONS,
  PARTICIPANT_RELATIONS,
  RESIDENCE_SITUATIONS,
  type FinancingPayload,
  type FinancingPublicForm,
  type FinancingSection,
} from "@nexlar/shared";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DatePicker } from "../../components/ui/DatePicker";
import { Select } from "../../components/ui/Select";
import { TextField } from "../../components/ui/TextField";
import { ICON } from "../../components/ui/icon";
import { RELATION_LABELS } from "../clients/labels";
import { maskMoney, parseMoney } from "../../lib/masks";
import { PublicFinancingError, saveFinancingSection } from "./publicApi";

/**
 * As seis etapas do formulário público (docs/09, Fatia D), cada uma com o
 * mesmo motor de salvamento: 1,5s depois da última digitação, sem botão de
 * salvar, e descarga imediata ao sair da etapa para não perder o fim da frase.
 */

export type EstadoSalvo = "parado" | "salvando" | "salvo" | "erro";

export const MARITAL_LABELS: Record<(typeof MARITAL_STATUS_OPTIONS)[number], string> = {
  solteiro: "Solteiro(a)",
  casado: "Casado(a)",
  uniao_estavel: "União estável",
  divorciado: "Divorciado(a)",
  viuvo: "Viúvo(a)",
};

export const RESIDENCE_LABELS: Record<(typeof RESIDENCE_SITUATIONS)[number], string> = {
  alugada: "Moro de aluguel",
  propria: "Casa própria",
  financiada: "Casa própria financiada",
  com_familiares: "Com familiares",
  outra: "Outra situação",
};

export const DOWN_PAYMENT_LABELS: Record<(typeof DOWN_PAYMENT_SOURCES)[number], string> = {
  recursos_proprios: "Dinheiro guardado",
  venda_de_imovel: "Venda de um imóvel",
  ajuda_familiar: "Ajuda da família",
  fgts: "FGTS",
  consorcio: "Consórcio",
  outros: "Outra origem",
};

export const GOAL_LABELS: Record<(typeof FINANCING_GOALS)[number], string> = {
  moradia: "Para morar",
  investimento: "Para investir",
};

export interface SecaoProps {
  token: string;
  form: FinancingPublicForm;
  onForm: (f: FinancingPublicForm) => void;
  onEstado: (e: EstadoSalvo) => void;
  onAviso: (mensagem: string | null) => void;
  /** Chamado depois que o salvamento com conclusão dá certo. */
  onConcluir: () => void;
  concluida: boolean;
}

interface AutosaveOpcoes<T> {
  token: string;
  secao: FinancingSection;
  inicial: T;
  onForm: (f: FinancingPublicForm) => void;
  onEstado: (e: EstadoSalvo) => void;
  onAviso: (mensagem: string | null) => void;
  /**
   * Guarda de rascunho a meio caminho: enquanto devolver uma mensagem, o
   * autosave espera (uma lista com um participante ainda sem nome não deve
   * virar um erro na tela a cada tecla). O concluir usa a mesma régua.
   */
  validar?: (valores: T) => string | null;
}

function useAutosaveSecao<T>({ token, secao, inicial, onForm, onEstado, onAviso, validar }: AutosaveOpcoes<T>) {
  const [valores, setValores] = useState<T>(inicial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sujo = useRef(false);

  const salvar = useMutation({
    mutationFn: (completed?: boolean) =>
      saveFinancingSection(token, { section: secao, data: valores, completed }),
    onMutate: () => {
      sujo.current = false;
      onEstado("salvando");
    },
    onSuccess: (novo) => {
      onEstado("salvo");
      onAviso(null);
      onForm(novo);
    },
    onError: (e) => {
      onEstado("erro");
      onAviso(e instanceof PublicFinancingError ? e.message : "Não foi possível salvar. Tente de novo.");
    },
  });

  const salvarRef = useRef(salvar.mutate);
  salvarRef.current = salvar.mutate;
  const validarRef = useRef(validar);
  validarRef.current = validar;
  const valoresRef = useRef(valores);
  valoresRef.current = valores;

  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    sujo.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (validarRef.current?.(valoresRef.current)) return; // espera ficar válido
      salvarRef.current(undefined);
    }, 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valores]);

  // Sair da etapa não pode perder a última frase: descarrega o que estiver
  // pendente na hora, sem esperar o 1,5s.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (sujo.current && !validarRef.current?.(valoresRef.current)) {
        salvarRef.current(undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const concluir = (onDepois: () => void) => {
    const problema = validar?.(valores);
    if (problema) {
      onAviso(problema);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    salvar.mutate(true, { onSuccess: onDepois });
  };

  const set = <K extends keyof T>(campo: K, valor: T[K]) => setValores((v) => ({ ...v, [campo]: valor }));

  return { valores, setValores, set, concluir, salvando: salvar.isPending };
}

/** Campo de dinheiro em reais, com máscara de milhar pt-BR. */
function CampoDinheiro({
  label,
  valor,
  onChange,
  hint,
  opcional,
}: {
  label: string;
  valor: number | null | undefined;
  onChange: (v: number | null) => void;
  hint?: string;
  opcional?: boolean;
}) {
  return (
    <TextField
      label={`${label} (R$)`}
      inputMode="numeric"
      value={valor == null ? "" : maskMoney(String(valor))}
      onChange={(e) => onChange(parseMoney(e.target.value) ?? null)}
      placeholder="0"
      hint={hint}
      optionalLabel={opcional ? "opcional" : undefined}
    />
  );
}

function BotaoConcluir({
  concluida,
  salvando,
  onClick,
}: {
  concluida: boolean;
  salvando: boolean;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="accent" fullWidth loading={salvando} onClick={onClick}>
      {concluida ? "Continuar" : "Concluir e continuar"}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// 1. Sobre você
// ---------------------------------------------------------------------------

type DadosPessoais = NonNullable<FinancingPayload["dados_pessoais"]>;

export function SecaoDadosPessoais(props: SecaoProps) {
  const d = props.form.payload.dados_pessoais;
  const { valores, set, concluir, salvando } = useAutosaveSecao<DadosPessoais>({
    token: props.token,
    secao: "dados_pessoais",
    onForm: props.onForm,
    onEstado: props.onEstado,
    onAviso: props.onAviso,
    inicial: {
      fullName: d?.fullName ?? props.form.leadFullName,
      cpf: d?.cpf ?? null,
      birthDate: d?.birthDate ?? null,
      nationality: d?.nationality ?? null,
      maritalStatus: d?.maritalStatus ?? null,
      propertyRegime: d?.propertyRegime ?? null,
      phone: d?.phone ?? null,
      email: d?.email ?? null,
      address: d?.address ?? null,
      city: d?.city ?? null,
      state: d?.state ?? null,
      cep: d?.cep ?? null,
      residenceSituation: d?.residenceSituation ?? null,
      dependentsCount: d?.dependentsCount ?? null,
    },
  });

  return (
    <>
      <div className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-sm">
        <TextField
          label="Nome completo"
          value={valores.fullName ?? ""}
          onChange={(e) => set("fullName", e.target.value)}
          autoComplete="name"
        />
        <TextField
          label="CPF"
          inputMode="numeric"
          value={valores.cpf ?? ""}
          onChange={(e) => set("cpf", e.target.value || null)}
          placeholder="000.000.000-00"
        />
        <DatePicker
          label="Data de nascimento"
          value={valores.birthDate ?? ""}
          onChange={(v) => set("birthDate", v || null)}
          maxYear={new Date().getFullYear()}
        />
        <Select
          label="Estado civil"
          value={valores.maritalStatus ?? ""}
          placeholder="Escolha"
          options={MARITAL_STATUS_OPTIONS.map((m) => ({ value: m, label: MARITAL_LABELS[m] }))}
          onValueChange={(v) => set("maritalStatus", (v || null) as DadosPessoais["maritalStatus"])}
        />
        <TextField
          label="Telefone"
          inputMode="tel"
          autoComplete="tel"
          value={valores.phone ?? ""}
          onChange={(e) => set("phone", e.target.value || null)}
          placeholder="(11) 99999-9999"
        />
        <TextField
          label="Endereço"
          value={valores.address ?? ""}
          onChange={(e) => set("address", e.target.value || null)}
          autoComplete="street-address"
          placeholder="Rua, número e complemento"
        />
        <div className="grid grid-cols-[1fr_88px] gap-3">
          <TextField
            label="Cidade"
            value={valores.city ?? ""}
            onChange={(e) => set("city", e.target.value || null)}
          />
          <TextField
            label="UF"
            maxLength={2}
            value={valores.state ?? ""}
            onChange={(e) => set("state", e.target.value.toUpperCase() || null)}
          />
        </div>
        <TextField
          label="CEP"
          inputMode="numeric"
          autoComplete="postal-code"
          value={valores.cep ?? ""}
          onChange={(e) => set("cep", e.target.value || null)}
          placeholder="00000-000"
        />
        <Select
          label="Situação de moradia"
          value={valores.residenceSituation ?? ""}
          placeholder="Escolha"
          options={RESIDENCE_SITUATIONS.map((r) => ({ value: r, label: RESIDENCE_LABELS[r] }))}
          onValueChange={(v) =>
            set("residenceSituation", (v || null) as DadosPessoais["residenceSituation"])
          }
        />
        <TextField
          label="Quantos dependentes você tem?"
          inputMode="numeric"
          value={valores.dependentsCount == null ? "" : String(valores.dependentsCount)}
          onChange={(e) => {
            const so = e.target.value.replace(/\D/g, "");
            set("dependentsCount", so === "" ? null : Number(so));
          }}
          optionalLabel="opcional"
        />
      </div>
      <BotaoConcluir concluida={props.concluida} salvando={salvando} onClick={() => concluir(props.onConcluir)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. Trabalho e renda
// ---------------------------------------------------------------------------

type TrabalhoRenda = NonNullable<FinancingPayload["trabalho_renda"]>;

export function SecaoTrabalhoRenda(props: SecaoProps) {
  const t = props.form.payload.trabalho_renda;
  const { valores, set, concluir, salvando } = useAutosaveSecao<TrabalhoRenda>({
    token: props.token,
    secao: "trabalho_renda",
    onForm: props.onForm,
    onEstado: props.onEstado,
    onAviso: props.onAviso,
    inicial: {
      situation: t?.situation ?? null,
      occupation: t?.occupation ?? null,
      employer: t?.employer ?? null,
      employmentStartDate: t?.employmentStartDate ?? null,
      grossMonthlyIncome: t?.grossMonthlyIncome ?? null,
      netMonthlyIncome: t?.netMonthlyIncome ?? null,
      otherIncome: t?.otherIncome ?? null,
      otherIncomeSource: t?.otherIncomeSource ?? null,
      canProveIncome: t?.canProveIncome ?? null,
    },
  });

  const semTrabalho = valores.situation === "desempregado";

  return (
    <>
      <div className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-sm">
        <Select
          label="Situação de trabalho"
          value={valores.situation ?? ""}
          placeholder="Escolha"
          options={EMPLOYMENT_SITUATIONS.map((s) => ({
            value: s,
            label: EMPLOYMENT_SITUATION_LABELS[s],
          }))}
          onValueChange={(v) => set("situation", (v || null) as TrabalhoRenda["situation"])}
        />
        {!semTrabalho && (
          <>
            <TextField
              label="Profissão"
              value={valores.occupation ?? ""}
              onChange={(e) => set("occupation", e.target.value || null)}
              placeholder="Ex.: professora, motorista, vendedor"
            />
            <TextField
              label="Onde você trabalha"
              value={valores.employer ?? ""}
              onChange={(e) => set("employer", e.target.value || null)}
              optionalLabel="opcional"
            />
            <DatePicker
              label="Trabalha lá desde"
              value={valores.employmentStartDate ?? ""}
              onChange={(v) => set("employmentStartDate", v || null)}
              maxYear={new Date().getFullYear()}
              optionalLabel="opcional"
            />
          </>
        )}
        <CampoDinheiro
          label="Renda mensal bruta"
          valor={valores.grossMonthlyIncome}
          onChange={(v) => set("grossMonthlyIncome", v)}
          hint="Antes dos descontos."
        />
        <CampoDinheiro
          label="Renda mensal líquida"
          valor={valores.netMonthlyIncome}
          onChange={(v) => set("netMonthlyIncome", v)}
          hint="O que cai na conta."
        />
        <CampoDinheiro
          label="Outras rendas"
          valor={valores.otherIncome}
          onChange={(v) => set("otherIncome", v)}
          opcional
        />
        {valores.otherIncome != null && valores.otherIncome > 0 && (
          <TextField
            label="De onde vem essa renda?"
            value={valores.otherIncomeSource ?? ""}
            onChange={(e) => set("otherIncomeSource", e.target.value || null)}
            placeholder="Ex.: aluguel, pensão, freelance"
          />
        )}
        <Checkbox
          label="Consigo comprovar renda (holerite, extrato ou imposto de renda)"
          checked={valores.canProveIncome === true}
          onChange={(e) => set("canProveIncome", e.target.checked)}
        />
      </div>
      <BotaoConcluir concluida={props.concluida} salvando={salvando} onClick={() => concluir(props.onConcluir)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Outros participantes
// ---------------------------------------------------------------------------

type Participantes = NonNullable<FinancingPayload["participantes"]>;
type Participante = Participantes["participants"][number];

const PARTICIPANTE_VAZIO: Participante = {
  fullName: "",
  cpf: null,
  birthDate: null,
  relation: "conjuge",
  occupation: null,
  monthlyIncome: null,
  phone: null,
  email: null,
};

export function SecaoParticipantes(props: SecaoProps) {
  const p = props.form.payload.participantes;
  const [removendo, setRemovendo] = useState<number | null>(null);
  const { valores, setValores, concluir, salvando } = useAutosaveSecao<Participantes>({
    token: props.token,
    secao: "participantes",
    onForm: props.onForm,
    onEstado: props.onEstado,
    onAviso: props.onAviso,
    inicial: { participants: p?.participants ?? [] },
    validar: (v) =>
      v.participants.some((x) => x.fullName.trim().length < 2)
        ? "Informe o nome de cada participante ou remova o cartão vazio."
        : null,
  });

  const atualizar = (indice: number, mudanca: Partial<Participante>) =>
    setValores((v) => ({
      participants: v.participants.map((x, i) => (i === indice ? { ...x, ...mudanca } : x)),
    }));

  return (
    <>
      <div className="flex flex-col gap-4">
        {valores.participants.length === 0 && (
          <div className="rounded-2xl bg-surface p-5 text-body-sm text-text-muted shadow-sm">
            Alguém vai compor a renda com você, como cônjuge ou familiar? Se for financiar
            sozinho(a), é só concluir esta etapa.
          </div>
        )}
        {valores.participants.map((participante, i) => (
          <div key={i} className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-label font-semibold text-text">Participante {i + 1}</p>
              <button
                type="button"
                onClick={() => setRemovendo(i)}
                className="flex min-h-9 items-center gap-1 text-body-sm font-semibold text-[var(--danger-fg)] hover:underline"
              >
                <Trash2 size={ICON.row} aria-hidden="true" /> Remover
              </button>
            </div>
            <TextField
              label="Nome completo"
              value={participante.fullName}
              onChange={(e) => atualizar(i, { fullName: e.target.value })}
            />
            <Select
              label="Relação com você"
              value={participante.relation}
              options={PARTICIPANT_RELATIONS.map((r) => ({ value: r, label: RELATION_LABELS[r] }))}
              onValueChange={(v) => atualizar(i, { relation: v as Participante["relation"] })}
            />
            <TextField
              label="CPF"
              inputMode="numeric"
              value={participante.cpf ?? ""}
              onChange={(e) => atualizar(i, { cpf: e.target.value || null })}
              placeholder="000.000.000-00"
              optionalLabel="opcional"
            />
            <DatePicker
              label="Data de nascimento"
              value={participante.birthDate ?? ""}
              onChange={(v) => atualizar(i, { birthDate: v || null })}
              maxYear={new Date().getFullYear()}
              optionalLabel="opcional"
            />
            <CampoDinheiro
              label="Renda mensal"
              valor={participante.monthlyIncome}
              onChange={(v) => atualizar(i, { monthlyIncome: v })}
            />
            <TextField
              label="Telefone"
              inputMode="tel"
              value={participante.phone ?? ""}
              onChange={(e) => atualizar(i, { phone: e.target.value || null })}
              optionalLabel="opcional"
            />
          </div>
        ))}
        {valores.participants.length < FINANCING_MAX_PARTICIPANTS && (
          <Button
            type="button"
            variant="ghost"
            fullWidth
            onClick={() => setValores((v) => ({ participants: [...v.participants, PARTICIPANTE_VAZIO] }))}
          >
            <Plus size={ICON.action} aria-hidden="true" /> Adicionar participante
          </Button>
        )}
      </div>
      <BotaoConcluir concluida={props.concluida} salvando={salvando} onClick={() => concluir(props.onConcluir)} />
      <ConfirmDialog
        open={removendo !== null}
        title="Remover participante?"
        description="Os dados deste participante saem do formulário."
        confirmLabel="Remover"
        danger
        onConfirm={() => {
          setValores((v) => ({ participants: v.participants.filter((_, i) => i !== removendo) }));
          setRemovendo(null);
        }}
        onCancel={() => setRemovendo(null)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// 4. Entrada e FGTS
// ---------------------------------------------------------------------------

type EntradaFgts = NonNullable<FinancingPayload["entrada_fgts"]>;

export function SecaoEntradaFgts(props: SecaoProps) {
  const e = props.form.payload.entrada_fgts;
  const { valores, set, concluir, salvando } = useAutosaveSecao<EntradaFgts>({
    token: props.token,
    secao: "entrada_fgts",
    onForm: props.onForm,
    onEstado: props.onEstado,
    onAviso: props.onAviso,
    inicial: {
      downPaymentAmount: e?.downPaymentAmount ?? null,
      downPaymentSources: e?.downPaymentSources ?? [],
      fgtsBalance: e?.fgtsBalance ?? null,
      reserveAmount: e?.reserveAmount ?? null,
      maxDesiredInstallment: e?.maxDesiredInstallment ?? null,
      notes: e?.notes ?? null,
    },
  });

  const fontes = valores.downPaymentSources ?? [];
  const alternarFonte = (fonte: (typeof DOWN_PAYMENT_SOURCES)[number]) =>
    set(
      "downPaymentSources",
      fontes.includes(fonte) ? fontes.filter((f) => f !== fonte) : [...fontes, fonte],
    );

  return (
    <>
      <div className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-sm">
        <CampoDinheiro
          label="Quanto você tem para dar de entrada"
          valor={valores.downPaymentAmount}
          onChange={(v) => set("downPaymentAmount", v)}
          hint="Se ainda não tiver nada guardado, pode responder 0."
        />
        <fieldset className="flex flex-col gap-2.5">
          <legend className="text-label text-text">
            De onde vem a entrada?{" "}
            <span className="font-normal text-caption text-text-subtle">marque o que valer</span>
          </legend>
          {DOWN_PAYMENT_SOURCES.map((fonte) => (
            <Checkbox
              key={fonte}
              label={DOWN_PAYMENT_LABELS[fonte]}
              checked={fontes.includes(fonte)}
              onChange={() => alternarFonte(fonte)}
            />
          ))}
        </fieldset>
        {fontes.includes("fgts") && (
          <CampoDinheiro
            label="Saldo aproximado do FGTS"
            valor={valores.fgtsBalance}
            onChange={(v) => set("fgtsBalance", v)}
            hint="O que você declarar aqui; ninguém consulta seu FGTS."
          />
        )}
        <CampoDinheiro
          label="Parcela máxima que cabe no seu orçamento"
          valor={valores.maxDesiredInstallment}
          onChange={(v) => set("maxDesiredInstallment", v)}
          opcional
        />
      </div>
      <BotaoConcluir concluida={props.concluida} salvando={salvando} onClick={() => concluir(props.onConcluir)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// 5. Compromissos financeiros
// ---------------------------------------------------------------------------

type Compromissos = NonNullable<FinancingPayload["compromissos"]>;
type Compromisso = Compromissos["commitments"][number];

export function SecaoCompromissos(props: SecaoProps) {
  const c = props.form.payload.compromissos;
  const [removendo, setRemovendo] = useState<number | null>(null);
  const { valores, setValores, concluir, salvando } = useAutosaveSecao<Compromissos>({
    token: props.token,
    secao: "compromissos",
    onForm: props.onForm,
    onEstado: props.onEstado,
    onAviso: props.onAviso,
    inicial: { commitments: c?.commitments ?? [] },
  });

  const atualizar = (indice: number, mudanca: Partial<Compromisso>) =>
    setValores((v) => ({
      commitments: v.commitments.map((x, i) => (i === indice ? { ...x, ...mudanca } : x)),
    }));

  return (
    <>
      <div className="flex flex-col gap-4">
        {valores.commitments.length === 0 && (
          <div className="rounded-2xl bg-surface p-5 text-body-sm text-text-muted shadow-sm">
            Parcelas que você paga todo mês: financiamento de carro, empréstimo, consignado,
            pensão. Sem nada disso, é só concluir a etapa. Responder com sinceridade evita
            surpresa na análise do banco.
          </div>
        )}
        {valores.commitments.map((compromisso, i) => (
          <div key={i} className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-label font-semibold text-text">Compromisso {i + 1}</p>
              <button
                type="button"
                onClick={() => setRemovendo(i)}
                className="flex min-h-9 items-center gap-1 text-body-sm font-semibold text-[var(--danger-fg)] hover:underline"
              >
                <Trash2 size={ICON.row} aria-hidden="true" /> Remover
              </button>
            </div>
            <Select
              label="Tipo"
              value={compromisso.type}
              options={COMMITMENT_TYPES.map((t) => ({ value: t, label: COMMITMENT_TYPE_LABELS[t] }))}
              onValueChange={(v) => atualizar(i, { type: v as Compromisso["type"] })}
            />
            <TextField
              label="Com quem"
              value={compromisso.institution ?? ""}
              onChange={(e) => atualizar(i, { institution: e.target.value || null })}
              placeholder="Banco, loja ou pessoa"
              optionalLabel="opcional"
            />
            <CampoDinheiro
              label="Parcela mensal"
              valor={compromisso.monthlyInstallment}
              onChange={(v) => atualizar(i, { monthlyInstallment: v })}
            />
            <TextField
              label="Quantas parcelas faltam?"
              inputMode="numeric"
              value={
                compromisso.remainingInstallments == null
                  ? ""
                  : String(compromisso.remainingInstallments)
              }
              onChange={(e) => {
                const so = e.target.value.replace(/\D/g, "").slice(0, 3);
                atualizar(i, { remainingInstallments: so === "" ? null : Number(so) });
              }}
              optionalLabel="opcional"
            />
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          fullWidth
          onClick={() =>
            setValores((v) => ({
              commitments: [
                ...v.commitments,
                {
                  type: "emprestimo",
                  institution: null,
                  monthlyInstallment: null,
                  remainingBalance: null,
                  remainingInstallments: null,
                  notes: null,
                },
              ],
            }))
          }
        >
          <Plus size={ICON.action} aria-hidden="true" /> Adicionar compromisso
        </Button>
      </div>
      <BotaoConcluir concluida={props.concluida} salvando={salvando} onClick={() => concluir(props.onConcluir)} />
      <ConfirmDialog
        open={removendo !== null}
        title="Remover compromisso?"
        description="Este compromisso sai do formulário."
        confirmLabel="Remover"
        danger
        onConfirm={() => {
          setValores((v) => ({ commitments: v.commitments.filter((_, i) => i !== removendo) }));
          setRemovendo(null);
        }}
        onCancel={() => setRemovendo(null)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// 6. Imóvel e objetivo
// ---------------------------------------------------------------------------

type Imovel = NonNullable<FinancingPayload["imovel"]>;

const PRAZOS_ANOS = [5, 10, 15, 20, 25, 30, 35] as const;

export function SecaoImovel(props: SecaoProps) {
  const im = props.form.payload.imovel;
  const { valores, set, concluir, salvando } = useAutosaveSecao<Imovel>({
    token: props.token,
    secao: "imovel",
    onForm: props.onForm,
    onEstado: props.onEstado,
    onAviso: props.onAviso,
    inicial: {
      propertyValue: im?.propertyValue ?? null,
      goal: im?.goal ?? null,
      desiredTermMonths: im?.desiredTermMonths ?? null,
      preferredBank: im?.preferredBank ?? null,
      useFgts: im?.useFgts ?? null,
      notes: im?.notes ?? null,
    },
  });

  return (
    <>
      <div className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-sm">
        <CampoDinheiro
          label="Valor aproximado do imóvel"
          valor={valores.propertyValue}
          onChange={(v) => set("propertyValue", v)}
          hint="Se ainda não tiver um imóvel em vista, uma faixa de valor já ajuda."
        />
        <Select
          label="O imóvel é"
          value={valores.goal ?? ""}
          placeholder="Escolha"
          options={FINANCING_GOALS.map((g) => ({ value: g, label: GOAL_LABELS[g] }))}
          onValueChange={(v) => set("goal", (v || null) as Imovel["goal"])}
        />
        <Select
          label="Em quanto tempo pretende pagar"
          value={valores.desiredTermMonths == null ? "" : String(valores.desiredTermMonths)}
          placeholder="Escolha"
          options={PRAZOS_ANOS.map((anos) => ({ value: String(anos * 12), label: `${anos} anos` }))}
          onValueChange={(v) => set("desiredTermMonths", v ? Number(v) : null)}
        />
        <TextField
          label="Tem banco de preferência?"
          value={valores.preferredBank ?? ""}
          onChange={(e) => set("preferredBank", e.target.value || null)}
          placeholder="Ex.: Caixa, Itaú, Bradesco"
          optionalLabel="opcional"
        />
        <Checkbox
          label="Pretendo usar o FGTS na compra"
          checked={valores.useFgts === true}
          onChange={(e) => set("useFgts", e.target.checked)}
        />
        <div>
          <label
            className="flex items-baseline justify-between gap-2 text-label text-text"
            htmlFor="fin-imovel-notas"
          >
            <span>Algo mais que o corretor deva saber?</span>
            <span className="font-normal text-caption text-text-subtle">opcional</span>
          </label>
          <textarea
            id="fin-imovel-notas"
            value={valores.notes ?? ""}
            onChange={(e) => set("notes", e.target.value || null)}
            rows={3}
            maxLength={300}
            placeholder="Ex.: já visitei um apartamento no bairro X e gostei."
            className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-body text-text placeholder:text-text-subtle focus:border-accent focus:outline-none"
          />
        </div>
      </div>
      <BotaoConcluir concluida={props.concluida} salvando={salvando} onClick={() => concluir(props.onConcluir)} />
    </>
  );
}

export const SECAO_COMPONENTES: Record<FinancingSection, (props: SecaoProps) => JSX.Element> = {
  dados_pessoais: SecaoDadosPessoais,
  trabalho_renda: SecaoTrabalhoRenda,
  participantes: SecaoParticipantes,
  entrada_fgts: SecaoEntradaFgts,
  compromissos: SecaoCompromissos,
  imovel: SecaoImovel,
};

/** Uma frase de orientação por etapa, no lugar de formulário mudo. */
export const SECAO_SUBTITULOS: Record<FinancingSection, string> = {
  dados_pessoais: "Preencha o que souber. Tudo é salvo sozinho, e dá para voltar depois pelo mesmo link.",
  trabalho_renda: "É com isso que o banco calcula quanto pode financiar. Valores aproximados servem.",
  participantes: "Quem entra junto no financiamento soma renda e aumenta o valor aprovado.",
  entrada_fgts: "Entrada e FGTS diminuem o valor financiado e a parcela.",
  compromissos: "O banco desconta essas parcelas da sua renda na análise.",
  imovel: "Conte o plano: valor, prazo e como pretende usar o imóvel.",
};
