import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, PencilLine } from "lucide-react";
import {
  COMMITMENT_TYPE_LABELS,
  EMPLOYMENT_SITUATION_LABELS,
  FINANCING_EXPIRY_OPTIONS,
  FINANCING_SECTION_LABELS,
  FINANCING_STATUS_LABELS,
  type FinancingApproveResult,
  type FinancingExpiryDays,
  type FinancingPayload,
  type FinancingSection,
  type FinancingSendResult,
} from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { ICON } from "../../components/ui/icon";
import { RELATION_LABELS } from "../clients/labels";
import { maskCpf } from "../../lib/masks";
import { approveFinancing, fetchFinancingReview, requestFinancingCorrection } from "./api";
import { STATUS_TONES } from "./FinancingBlock";
import { SendResultModal } from "./SendResultModal";
import { DOWN_PAYMENT_LABELS, GOAL_LABELS, MARITAL_LABELS, RESIDENCE_LABELS } from "./publicSections";

/**
 * Revisão das respostas do cliente (docs/09, Fatia E). Abrir esta tela marca
 * a solicitação como "em revisão" no backend. Daqui o corretor aprova (aplica
 * à ficha e pré-preenche a simulação) ou pede correção com uma nota.
 */
export function FinancingReviewPage() {
  const { code = "" } = useParams<{ code: string }>();
  const queryClient = useQueryClient();
  const [confirmandoAprovacao, setConfirmandoAprovacao] = useState(false);
  const [corrigindo, setCorrigindo] = useState(false);
  const [linkCorrecao, setLinkCorrecao] = useState<FinancingSendResult | null>(null);
  const [aprovado, setAprovado] = useState<FinancingApproveResult | null>(null);

  const consulta = useQuery({
    queryKey: ["financing-review", code],
    queryFn: () => fetchFinancingReview(code),
  });

  // Quem chega da ficha por "Pedir correção" (?acao=correcao) cai com o
  // painel de correção já aberto, uma vez só: fechar depois é decisão da
  // pessoa, não do parâmetro que ficou na URL.
  const [params] = useSearchParams();
  const abriuCorrecao = useRef(false);
  const status = consulta.data?.request.status;
  useEffect(() => {
    if (abriuCorrecao.current) return;
    if (params.get("acao") !== "correcao") return;
    if (status !== "respondida" && status !== "em_revisao") return;
    abriuCorrecao.current = true;
    setCorrigindo(true);
  }, [params, status]);

  const recarregarFicha = () => {
    void queryClient.invalidateQueries({ queryKey: ["financing-review", code] });
    void queryClient.invalidateQueries({ queryKey: ["lead-financing"] });
    void queryClient.invalidateQueries({ queryKey: ["lead"] });
    void queryClient.invalidateQueries({ queryKey: ["client"] });
  };

  const aprovar = useMutation({
    mutationFn: () => approveFinancing(code),
    onSuccess: (res) => {
      setConfirmandoAprovacao(false);
      setAprovado(res);
      recarregarFicha();
    },
  });

  if (consulta.isPending) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4" aria-busy="true">
        <div className="h-20 animate-pulse rounded-2xl bg-surface-sunken" />
        <div className="h-48 animate-pulse rounded-2xl bg-surface-sunken" />
        <div className="h-48 animate-pulse rounded-2xl bg-surface-sunken" />
      </div>
    );
  }

  if (consulta.isError) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Banner variant="danger">
          Não foi possível abrir a revisão. Se o cliente ainda não enviou as respostas, elas
          aparecem aqui assim que chegarem.
        </Banner>
        <Button type="button" variant="ghost" className="self-start" onClick={() => consulta.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const review = consulta.data;
  const { request } = review;
  const emAberto = request.status === "em_revisao" || request.status === "respondida";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <header className="animate-rise flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`rounded-full px-2 py-1 text-caption font-semibold ${STATUS_TONES[request.status]}`}>
            {FINANCING_STATUS_LABELS[request.status]}
          </span>
          <span className="text-body-sm text-text-muted">
            {request.leadName} · versão {review.version}, enviada em {dataHora(review.submittedAt)}
          </span>
        </div>
        {review.versions.length > 1 && (
          <p className="text-caption text-text-subtle">
            {review.versions.length} versões enviadas. Você está vendo a mais recente; as
            anteriores ficam guardadas, imutáveis, com as notas de correção.
          </p>
        )}
      </header>

      {aprovado && (
        <Banner variant="success">
          Aprovada para simulação. {aprovado.updatedFields > 0 && `${aprovado.updatedFields} campos aplicados à ficha de ${request.leadName}`}
          {aprovado.createdParticipants > 0 &&
            `, ${aprovado.createdParticipants} ${aprovado.createdParticipants === 1 ? "participante novo" : "participantes novos"}`}
          {aprovado.updatedFields > 0 || aprovado.createdParticipants > 0 ? ". " : ""}
          Os números do financiamento ficaram guardados como simulação pendente, prontos para
          quando o módulo Simulações entrar.
        </Banner>
      )}
      {request.status === "correcao_solicitada" && !aprovado && (
        <Banner variant="info">
          Correção solicitada. O cliente recebeu um link novo; quando reenviar, a nova versão
          aparece aqui.
        </Banner>
      )}

      {(request.sections as FinancingSection[]).map((secao) => (
        <section key={secao} className="animate-rise rounded-2xl border border-border bg-surface p-4 sm:p-6">
          <h2 className="text-label font-semibold text-text">
            {FINANCING_SECTION_LABELS[secao]}
          </h2>
          <DetalheSecao secao={secao} payload={review.payload} />
        </section>
      ))}

      {emAberto && (
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            type="button"
            variant="accent"
            fullWidth
            className="sm:w-auto"
            onClick={() => setConfirmandoAprovacao(true)}
          >
            <CheckCircle2 size={ICON.action} aria-hidden="true" /> Aprovar para simulação
          </Button>
          <Button
            type="button"
            variant="ghost"
            fullWidth
            className="sm:w-auto"
            onClick={() => setCorrigindo(true)}
          >
            <PencilLine size={ICON.action} aria-hidden="true" /> Pedir correção
          </Button>
        </div>
      )}

      {aprovar.isError && (
        <Banner variant="danger">Não foi possível aprovar agora. Tente novamente.</Banner>
      )}

      <ConfirmDialog
        open={confirmandoAprovacao}
        title="Aprovar para simulação"
        description={`Os dados preenchidos entram na ficha de ${request.leadName}, e o que estiver em branco não apaga nada que você já tinha. Os números do financiamento ficam guardados como simulação pendente, para o módulo Simulações usar quando existir.`}
        confirmLabel={aprovar.isPending ? "Aprovando..." : "Aprovar e aplicar"}
        loading={aprovar.isPending}
        onConfirm={() => aprovar.mutate()}
        onCancel={() => setConfirmandoAprovacao(false)}
      />

      <CorrectionModal
        open={corrigindo}
        code={code}
        sections={request.sections as FinancingSection[]}
        expiresInDays={request.expiresInDays}
        onClose={() => setCorrigindo(false)}
        onSent={(res) => {
          setCorrigindo(false);
          setLinkCorrecao(res);
          recarregarFicha();
        }}
      />

      <SendResultModal result={linkCorrecao} leadName={request.leadName} onClose={() => setLinkCorrecao(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detalhe por seção: tudo o que o cliente respondeu, com rótulo
// ---------------------------------------------------------------------------

const reais = (v: number | null | undefined) =>
  v == null ? null : `R$ ${v.toLocaleString("pt-BR")}`;
const dataBr = (v: string | null | undefined) => {
  if (!v) return null;
  const [ano, mes, dia] = v.split("-");
  return `${dia}/${mes}/${ano}`;
};
const simNao = (v: boolean | null | undefined) => (v == null ? null : v ? "Sim" : "Não");

function DetalheSecao({ secao, payload }: { secao: FinancingSection; payload: FinancingPayload }) {
  if (secao === "participantes") {
    const lista = payload.participantes?.participants ?? [];
    if (lista.length === 0) return <Vazio texto="O cliente vai financiar sozinho." />;
    return (
      <div className="mt-4 flex flex-col gap-4">
        {lista.map((p, i) => (
          <div key={i} className="rounded-xl bg-surface-sunken p-4">
            <p className="text-body-sm font-semibold text-text">
              {p.fullName}{" "}
              <span className="font-normal text-text-muted">· {RELATION_LABELS[p.relation]}</span>
            </p>
            <Linhas
              pares={[
                ["CPF", p.cpf ? maskCpf(p.cpf) : null],
                ["Nascimento", dataBr(p.birthDate)],
                ["Renda mensal", reais(p.monthlyIncome)],
                ["Telefone", p.phone ?? null],
              ]}
            />
          </div>
        ))}
      </div>
    );
  }

  if (secao === "compromissos") {
    const lista = payload.compromissos?.commitments ?? [];
    if (lista.length === 0) return <Vazio texto="Nenhum compromisso mensal declarado." />;
    return (
      <div className="mt-4 flex flex-col gap-4">
        {lista.map((c, i) => (
          <div key={i} className="rounded-xl bg-surface-sunken p-4">
            <p className="text-body-sm font-semibold text-text">{COMMITMENT_TYPE_LABELS[c.type]}</p>
            <Linhas
              pares={[
                ["Com quem", c.institution ?? null],
                ["Parcela mensal", reais(c.monthlyInstallment)],
                ["Parcelas restantes", c.remainingInstallments == null ? null : String(c.remainingInstallments)],
              ]}
            />
          </div>
        ))}
      </div>
    );
  }

  const pares = paresDaSecao(secao, payload);
  if (pares.every(([, v]) => v == null)) return <Vazio texto="Nada preenchido nesta etapa." />;
  return <Linhas pares={pares} />;
}

function paresDaSecao(secao: FinancingSection, p: FinancingPayload): Array<[string, string | null]> {
  switch (secao) {
    case "dados_pessoais": {
      const d = p.dados_pessoais;
      return [
        ["Nome completo", d?.fullName ?? null],
        ["CPF", d?.cpf ? maskCpf(d.cpf) : null],
        ["Nascimento", dataBr(d?.birthDate)],
        ["Estado civil", d?.maritalStatus ? MARITAL_LABELS[d.maritalStatus] : null],
        ["Telefone", d?.phone ?? null],
        ["Endereço", d?.address ?? null],
        ["Cidade", d?.city ? [d.city, d.state].filter(Boolean).join(" / ") : null],
        ["CEP", d?.cep ?? null],
        ["Moradia", d?.residenceSituation ? RESIDENCE_LABELS[d.residenceSituation] : null],
        ["Dependentes", d?.dependentsCount == null ? null : String(d.dependentsCount)],
      ];
    }
    case "trabalho_renda": {
      const t = p.trabalho_renda;
      return [
        ["Situação", t?.situation ? EMPLOYMENT_SITUATION_LABELS[t.situation] : null],
        ["Profissão", t?.occupation ?? null],
        ["Onde trabalha", t?.employer ?? null],
        ["Desde", dataBr(t?.employmentStartDate)],
        ["Renda mensal bruta", reais(t?.grossMonthlyIncome)],
        ["Renda mensal líquida", reais(t?.netMonthlyIncome)],
        ["Outras rendas", reais(t?.otherIncome)],
        ["Origem das outras rendas", t?.otherIncomeSource ?? null],
        ["Consegue comprovar renda", simNao(t?.canProveIncome)],
      ];
    }
    case "entrada_fgts": {
      const e = p.entrada_fgts;
      const fontes = (e?.downPaymentSources ?? [])?.map((f) => DOWN_PAYMENT_LABELS[f]);
      return [
        ["Entrada", reais(e?.downPaymentAmount)],
        ["Origem da entrada", fontes && fontes.length > 0 ? fontes.join(", ") : null],
        ["Saldo de FGTS declarado", reais(e?.fgtsBalance)],
        ["Parcela máxima no orçamento", reais(e?.maxDesiredInstallment)],
      ];
    }
    case "imovel": {
      const im = p.imovel;
      return [
        ["Valor aproximado", reais(im?.propertyValue)],
        ["Objetivo", im?.goal ? GOAL_LABELS[im.goal] : null],
        ["Prazo desejado", im?.desiredTermMonths == null ? null : `${Math.round(im.desiredTermMonths / 12)} anos`],
        ["Banco de preferência", im?.preferredBank ?? null],
        ["Vai usar FGTS", simNao(im?.useFgts)],
        ["Observações", im?.notes ?? null],
      ];
    }
    default:
      return [];
  }
}

function Linhas({ pares }: { pares: Array<[string, string | null]> }) {
  const cheios = pares.filter((par): par is [string, string] => par[1] != null);
  if (cheios.length === 0) return null;
  return (
    <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {cheios.map(([rotulo, valor]) => (
        <div key={rotulo} className="flex flex-col">
          <dt className="text-caption text-text-subtle">{rotulo}</dt>
          <dd className="text-body-sm text-text">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="mt-3 text-body-sm text-text-muted">{texto}</p>;
}

// ---------------------------------------------------------------------------
// Modal de correção
// ---------------------------------------------------------------------------

function CorrectionModal({
  open,
  code,
  sections,
  expiresInDays,
  onClose,
  onSent,
}: {
  open: boolean;
  code: string;
  sections: FinancingSection[];
  expiresInDays: number | null;
  onClose: () => void;
  onSent: (res: FinancingSendResult) => void;
}) {
  const [escolhidas, setEscolhidas] = useState<FinancingSection[]>([]);
  const [nota, setNota] = useState("");
  const [prazo, setPrazo] = useState<FinancingExpiryDays>((expiresInDays as FinancingExpiryDays) ?? 7);
  const [aviso, setAviso] = useState<string | null>(null);

  const enviar = useMutation({
    mutationFn: () =>
      requestFinancingCorrection(code, { sections: escolhidas, note: nota.trim(), expiresInDays: prazo }),
    onSuccess: (res) => {
      setEscolhidas([]);
      setNota("");
      setAviso(null);
      onSent(res);
    },
    onError: () => setAviso("Não foi possível pedir a correção agora. Tente novamente."),
  });

  const alternar = (s: FinancingSection) =>
    setEscolhidas((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]));

  return (
    <Modal open={open} onClose={onClose} title="Pedir correção">
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (escolhidas.length === 0) {
            setAviso("Escolha pelo menos um bloco para o cliente revisar.");
            return;
          }
          if (nota.trim().length < 5) {
            setAviso("Explique para o cliente o que precisa ser ajustado.");
            return;
          }
          enviar.mutate();
        }}
      >
        <p className="text-body-sm text-text-muted">
          O cliente recebe um link novo, com as etapas escolhidas reabertas e a sua explicação. O
          que já foi enviado fica guardado como versão.
        </p>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-label text-text">O que precisa ser revisto?</legend>
          {sections.map((s) => (
            <Checkbox
              key={s}
              label={FINANCING_SECTION_LABELS[s]}
              checked={escolhidas.includes(s)}
              onChange={() => alternar(s)}
            />
          ))}
        </fieldset>

        <div>
          <label className="text-label text-text" htmlFor="fin-nota-correcao">
            Explique para o cliente
          </label>
          <textarea
            id="fin-nota-correcao"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ex.: Confirme a renda líquida com o holerite mais recente."
            className="mt-2 w-full rounded-md border border-border bg-surface px-4 py-2 text-body text-text placeholder:text-text-subtle focus:border-accent focus:outline-none"
          />
        </div>

        <Select
          label="Novo prazo para responder"
          value={String(prazo)}
          options={FINANCING_EXPIRY_OPTIONS.map((d) => ({ value: String(d), label: `${d} dias` }))}
          onValueChange={(v) => setPrazo(Number(v) as FinancingExpiryDays)}
        />

        {aviso && <Banner variant="danger">{aviso}</Banner>}

        <div className="flex flex-col gap-2">
          <Button type="submit" variant="accent" fullWidth loading={enviar.isPending}>
            Gerar link de correção
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
