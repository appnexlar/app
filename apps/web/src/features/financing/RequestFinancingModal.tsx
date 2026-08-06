import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FINANCING_EXPIRY_OPTIONS,
  FINANCING_SECTIONS,
  FINANCING_SECTION_LABELS,
  type FinancingExpiryDays,
  type FinancingSection,
  type FinancingSendResult,
} from "@nexlar/shared";
import { ApiError } from "../../lib/http";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { TextField } from "../../components/ui/TextField";
import { createFinancingRequest, sendFinancingRequest } from "./api";

interface RequestFinancingModalProps {
  open: boolean;
  onClose: () => void;
  lead: { id: string; name: string; email: string | null };
  /** Chamado com o link gerado; o pai abre o SendResultModal. */
  onSent: (result: FinancingSendResult) => void;
}

const PRAZO_LABELS: Record<FinancingExpiryDays, string> = {
  3: "3 dias",
  7: "7 dias",
  15: "15 dias",
  30: "30 dias",
};

/**
 * Configura e envia a solicitação de dados para simulação (docs/09).
 *
 * Criar e enviar são um gesto só para o corretor. Se o envio falhar depois de
 * criar, o rascunho fica na lista do bloco com a ação "Gerar link e enviar".
 */
export function RequestFinancingModal({ open, onClose, lead, onSent }: RequestFinancingModalProps) {
  const queryClient = useQueryClient();

  const [secoes, setSecoes] = useState<FinancingSection[]>([...FINANCING_SECTIONS]);
  const [prazo, setPrazo] = useState<FinancingExpiryDays>(7);
  const [mensagem, setMensagem] = useState("");
  const [email, setEmail] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const precisaEmail = !lead.email;

  const enviar = useMutation({
    mutationFn: async () => {
      const request = await createFinancingRequest({
        leadId: lead.id,
        sections: secoes,
        expiresInDays: prazo,
        message: mensagem.trim() || null,
        leadEmail: precisaEmail && email.trim() ? email.trim() : null,
      });
      return sendFinancingRequest(request.code);
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["lead-financing", lead.id] });
      // O envio pode ter gravado o e-mail na ficha; a ficha em cache precisa
      // saber, senão o campo de e-mail reaparece na próxima solicitação.
      void queryClient.invalidateQueries({ queryKey: ["lead"] });
      void queryClient.invalidateQueries({ queryKey: ["client"] });
      fechar();
      onSent(res);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: ["lead-financing", lead.id] });
      setAviso(
        error instanceof ApiError
          ? error.message
          : "Não foi possível enviar a solicitação agora. Tente novamente.",
      );
    },
  });

  function alternarSecao(secao: FinancingSection) {
    setSecoes((atual) =>
      atual.includes(secao) ? atual.filter((s) => s !== secao) : [...atual, secao],
    );
  }

  function fechar() {
    setAviso(null);
    setMensagem("");
    setEmail("");
    setSecoes([...FINANCING_SECTIONS]);
    setPrazo(7);
    onClose();
  }

  return (
    <Modal open={open} onClose={fechar} title="Solicitar dados para simulação">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (secoes.length === 0) {
            setAviso("Escolha pelo menos um bloco de informações.");
            return;
          }
          if (precisaEmail && !email.trim()) {
            setAviso("Informe o e-mail do cliente: é por ele que chega o código de acesso.");
            return;
          }
          enviar.mutate();
        }}
        className="flex flex-col gap-5"
      >
        <p className="text-body-sm text-text-muted">
          {lead.name.split(" ")[0]} preenche os dados por um link seguro e você revisa antes de
          preparar a simulação. Nada é enviado a banco algum.
        </p>

        {aviso && <Banner variant="danger">{aviso}</Banner>}

        <fieldset>
          <legend className="text-label text-text">O que pedir</legend>
          <div className="mt-2 flex flex-col gap-1.5">
            {FINANCING_SECTIONS.map((secao) => (
              <div
                key={secao}
                className="rounded-md border border-border bg-surface px-3.5 py-2.5 transition-colors hover:border-border-strong"
              >
                <Checkbox
                  label={FINANCING_SECTION_LABELS[secao]}
                  checked={secoes.includes(secao)}
                  onChange={() => alternarSecao(secao)}
                />
              </div>
            ))}
          </div>
        </fieldset>

        <Select
          label="Prazo para responder"
          value={String(prazo)}
          options={FINANCING_EXPIRY_OPTIONS.map((d) => ({ value: String(d), label: PRAZO_LABELS[d] }))}
          onValueChange={(v) => setPrazo(Number(v) as FinancingExpiryDays)}
          hint="Depois do prazo o link para de funcionar. Dá para gerar outro."
        />

        {precisaEmail && (
          <TextField
            label="E-mail do cliente"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cliente@email.com"
            hint="A ficha não tem e-mail. O código de acesso do formulário chega por ele."
          />
        )}

        <div>
          <label
            className="flex items-baseline justify-between gap-2 text-label text-text"
            htmlFor="fin-mensagem"
          >
            <span>Mensagem para o cliente</span>
            <span className="font-normal text-caption text-text-subtle">opcional</span>
          </label>
          <textarea
            id="fin-mensagem"
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Ex.: Com esses dados eu já preparo sua simulação na Caixa."
            className="mt-1.5 w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-body text-text placeholder:text-text-subtle focus:border-accent focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-2.5">
          <Button type="submit" variant="accent" fullWidth loading={enviar.isPending}>
            Gerar link seguro
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={fechar}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
