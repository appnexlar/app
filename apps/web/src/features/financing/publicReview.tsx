import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { PencilLine, SendHorizonal } from "lucide-react";
import {
  EMPLOYMENT_SITUATION_LABELS,
  FINANCING_SECTION_LABELS,
  financingSubmissionPendencies,
  type FinancingPublicForm,
  type FinancingSection,
  type FinancingSubmitResult,
} from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { ICON } from "../../components/ui/icon";
import { maskCpf } from "../../lib/masks";
import { PublicFinancingError, submitFinancing } from "./publicApi";
import { DOWN_PAYMENT_LABELS, GOAL_LABELS, MARITAL_LABELS } from "./publicSections";

/**
 * A última etapa do cliente (docs/09, Fatia D): conferir o que vai, autorizar
 * o uso e enviar. O envio congela uma versão imutável no backend; por isso a
 * tela deixa claro que depois dele o link se encerra.
 */

const reais = (v: number | null | undefined) =>
  v == null ? null : `R$ ${v.toLocaleString("pt-BR")}`;

const dataBr = (v: string | null | undefined) => {
  if (!v) return null;
  const [ano, mes, dia] = v.split("-");
  return `${dia}/${mes}/${ano}`;
};

/** As linhas de resumo de cada seção: só o que foi preenchido. */
function resumo(form: FinancingPublicForm, secao: FinancingSection): string[] {
  const p = form.payload;
  switch (secao) {
    case "dados_pessoais": {
      const d = p.dados_pessoais;
      return [
        d?.fullName ?? null,
        d?.cpf ? `CPF ${maskCpf(d.cpf)}` : null,
        d?.birthDate ? `Nascimento ${dataBr(d.birthDate)}` : null,
        d?.maritalStatus ? MARITAL_LABELS[d.maritalStatus] : null,
        d?.city ? [d.city, d.state].filter(Boolean).join(" / ") : null,
      ].filter((x): x is string => Boolean(x));
    }
    case "trabalho_renda": {
      const t = p.trabalho_renda;
      const renda = t?.netMonthlyIncome ?? t?.grossMonthlyIncome;
      return [
        t?.situation ? EMPLOYMENT_SITUATION_LABELS[t.situation] : null,
        t?.occupation ?? null,
        renda != null
          ? `Renda ${t?.netMonthlyIncome != null ? "líquida" : "bruta"} de ${reais(renda)}`
          : null,
        t?.otherIncome ? `Outras rendas: ${reais(t.otherIncome)}` : null,
      ].filter((x): x is string => Boolean(x));
    }
    case "participantes": {
      const lista = p.participantes?.participants ?? [];
      if (lista.length === 0) return ["Só você no financiamento"];
      return lista.map((x) => `${x.fullName}${x.monthlyIncome ? ` · ${reais(x.monthlyIncome)}` : ""}`);
    }
    case "entrada_fgts": {
      const e = p.entrada_fgts;
      const fontes = (e?.downPaymentSources ?? []).map((f) => DOWN_PAYMENT_LABELS[f]);
      return [
        e?.downPaymentAmount != null ? `Entrada de ${reais(e.downPaymentAmount)}` : null,
        fontes.length > 0 ? fontes.join(", ") : null,
        e?.fgtsBalance != null ? `FGTS: ${reais(e.fgtsBalance)}` : null,
        e?.maxDesiredInstallment != null ? `Parcela máxima: ${reais(e.maxDesiredInstallment)}` : null,
      ].filter((x): x is string => Boolean(x));
    }
    case "compromissos": {
      const lista = p.compromissos?.commitments ?? [];
      if (lista.length === 0) return ["Nenhum compromisso mensal"];
      const total = lista.reduce((soma, c) => soma + (c.monthlyInstallment ?? 0), 0);
      return [
        `${lista.length} ${lista.length === 1 ? "compromisso" : "compromissos"}`,
        total > 0 ? `${reais(total)} por mês no total` : null,
      ].filter((x): x is string => Boolean(x));
    }
    case "imovel": {
      const im = p.imovel;
      return [
        im?.propertyValue != null ? `Imóvel de ${reais(im.propertyValue)}` : null,
        im?.goal ? GOAL_LABELS[im.goal] : null,
        im?.desiredTermMonths != null ? `Pagar em ${Math.round(im.desiredTermMonths / 12)} anos` : null,
        im?.preferredBank ? `Preferência: ${im.preferredBank}` : null,
        im?.useFgts ? "Vai usar FGTS" : null,
      ].filter((x): x is string => Boolean(x));
    }
  }
}

export function Revisao({
  token,
  form,
  onEditar,
  onEnviado,
}: {
  token: string;
  form: FinancingPublicForm;
  onEditar: (secao: FinancingSection) => void;
  onEnviado: (resultado: FinancingSubmitResult) => void;
}) {
  const [consentiu, setConsentiu] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const pendencias = financingSubmissionPendencies(
    form.payload,
    form.sections,
    form.completedSections,
  );

  const enviar = useMutation({
    mutationFn: () => submitFinancing(token),
    onSuccess: onEnviado,
    onError: (e) =>
      setAviso(e instanceof PublicFinancingError ? e.message : "Não foi possível enviar. Tente de novo."),
  });

  return (
    <div className="flex flex-col gap-4">
      {pendencias.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl bg-warning-soft p-4">
          <p className="text-body-sm font-semibold text-text">Antes de enviar, falta:</p>
          <ul className="flex flex-col gap-1.5">
            {pendencias.map((p, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onEditar(p.section)}
                  className="text-left text-body-sm text-text-muted underline decoration-dotted underline-offset-2 hover:text-text"
                >
                  {p.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {form.sections.map((secao) => {
          const linhas = resumo(form, secao);
          return (
            <section key={secao} className="rounded-2xl bg-surface p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-label font-semibold text-text">
                  {FINANCING_SECTION_LABELS[secao]}
                </h2>
                <button
                  type="button"
                  onClick={() => onEditar(secao)}
                  className="flex min-h-9 items-center gap-1 text-body-sm font-semibold text-accent hover:underline"
                >
                  <PencilLine size={ICON.row} aria-hidden="true" /> Editar
                </button>
              </div>
              {linhas.length > 0 ? (
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {linhas.map((linha, i) => (
                    <li key={i} className="text-body-sm text-text-muted">
                      {linha}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-body-sm text-text-subtle">Nada preenchido ainda.</p>
              )}
            </section>
          );
        })}
      </div>

      {aviso && <Banner variant="danger">{aviso}</Banner>}

      <div className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-sm">
        <Checkbox
          label={`Autorizo ${form.brokerName} a usar estas informações somente para preparar a minha simulação de financiamento. Sei que posso pedir a correção ou a exclusão delas quando quiser.`}
          checked={consentiu}
          onChange={(e) => setConsentiu(e.target.checked)}
        />
        <Button
          type="button"
          variant="accent"
          fullWidth
          disabled={!consentiu || pendencias.length > 0}
          loading={enviar.isPending}
          onClick={() => enviar.mutate()}
        >
          <SendHorizonal size={ICON.action} aria-hidden="true" /> Enviar para {form.brokerName}
        </Button>
        <p className="text-center text-caption text-text-subtle">
          Depois do envio suas respostas ficam registradas com o corretor e este link se encerra.
        </p>
      </div>
    </div>
  );
}
