import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClientPurpose, ClientSummary } from "@nexlar/shared";
import { CLIENT_PURPOSES, CONSENT_TEXT } from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { TextField } from "../../components/ui/TextField";
import { createClient } from "./api";
import { PURPOSE_LABELS } from "./labels";

/**
 * Cadastro de cliente direto, para quem já tinha carteira antes do Nextlar.
 *
 * Pede o mesmo que o cadastro rápido de lead (nome e WhatsApp), mais a
 * finalidade e a ciência da coleta. Motivo da conversão e próxima etapa não
 * são perguntados: quem cadastra alguém direto na lista de clientes já
 * respondeu os dois pelo próprio gesto, e perguntar de novo transformaria em
 * burocracia o que devia ser um cadastro de trinta segundos.
 */
export function NewClientDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (cliente: ClientSummary) => void;
}) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [purpose, setPurpose] = useState<ClientPurpose | "">("");
  const [consent, setConsent] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createClient,
    onSuccess: (cliente) => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      // A pessoa também some do funil de leads, então aquela lista muda junto.
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      onCreated(cliente);
    },
    onError: (e: unknown) => {
      const mensagem = e instanceof Error ? e.message : "Não foi possível cadastrar o cliente.";
      setErro(mensagem);
    },
  });

  function enviar() {
    setErro(null);
    if (fullName.trim().length < 2) return setErro("Informe o nome do cliente.");
    if (phone.trim().length < 8) return setErro("Informe um WhatsApp válido.");
    if (!purpose) return setErro("Escolha se é compra ou locação.");
    if (!consent) return setErro("É preciso confirmar a ciência sobre a coleta de dados.");

    mutation.mutate({
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      purpose,
      consent: true,
    });
  }

  return (
    <Modal open onClose={onClose} title="Cadastrar cliente">
      <form
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1"
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        <p className="text-body-sm text-text-muted">
          Para quem já é seu cliente e ainda não estava aqui. Se a pessoa chegou como lead, use a
          ficha dela para converter e não perder o histórico.
        </p>

        {erro && <Banner variant="danger">{erro}</Banner>}

        <TextField
          label="Nome completo"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Como você chama essa pessoa"
          autoFocus
        />

        <TextField
          label="WhatsApp"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(00) 00000-0000"
          inputMode="tel"
        />

        <TextField
          label="E-mail"
          optionalLabel="opcional"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@email.com"
        />

        <Select
          label="Finalidade do atendimento"
          value={purpose}
          onValueChange={(v) => setPurpose(v as ClientPurpose)}
          placeholder="Selecione"
          options={CLIENT_PURPOSES.map((p) => ({ value: p, label: PURPOSE_LABELS[p] }))}
        />

        {/* A ciência continua obrigatória mesmo sem lead: a ficha do cliente
            guarda CPF, renda e documentos, e é o aceite que sustenta isso. */}
        <div className="rounded-xl bg-surface-sunken p-3.5">
          <p className="text-caption text-text-muted">{CONSENT_TEXT}</p>
          <div className="mt-2.5">
            <Checkbox
              label="Confirmo que a pessoa tem ciência da coleta de dados para esta finalidade."
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button type="submit" variant="accent" disabled={mutation.isPending}>
            {mutation.isPending ? "Cadastrando…" : "Cadastrar cliente"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
