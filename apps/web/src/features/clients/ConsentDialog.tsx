import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { Checkbox } from "../../components/ui/Checkbox";
import { registerConsent } from "./api";

interface ConsentDialogProps {
  clientId: string;
  clientName: string;
  onClose: () => void;
  /** Chamado depois de registrar: abre o formulário que a pessoa queria. */
  onRegistered: () => void;
}

/**
 * Ciência da coleta de dados adicionais (LGPD). Aparece uma vez, antes do
 * primeiro dado pessoal ou financeiro da ficha, e nunca antes disso: quem
 * está em atendimento não precisa ouvir falar de LGPD. Registrar não
 * bloqueia etapa nenhuma; só destrava os formulários protegidos.
 */
export function ConsentDialog({ clientId, clientName, onClose, onRegistered }: ConsentDialogProps) {
  const queryClient = useQueryClient();
  const [ciente, setCiente] = useState(false);
  const primeiroNome = clientName.split(" ")[0];

  const registrar = useMutation({
    mutationFn: () => registerConsent(clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead"] });
      onRegistered();
    },
  });

  return (
    <Modal open onClose={onClose} title="Antes do primeiro dado">
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-text-muted">
          A partir daqui a ficha passa a guardar dados pessoais e financeiros de {primeiroNome}: CPF,
          endereço, renda, documentos. Pela LGPD, a pessoa precisa saber que isso está sendo
          guardado e para quê.
        </p>
        <div className="rounded-xl bg-surface-sunken p-3.5">
          <p className="text-caption font-semibold uppercase tracking-wide text-text-subtle">
            O que você diz para a pessoa
          </p>
          <p className="mt-1.5 text-body-sm text-text">
            "Vou guardar seus dados na minha ferramenta só para conduzir esta negociação: análise,
            proposta, financiamento ou locação. Você pode pedir para eu apagar quando quiser."
          </p>
        </div>

        {registrar.isError && (
          <Banner variant="danger">Não foi possível registrar agora. Tente novamente.</Banner>
        )}

        <Checkbox
          id="consent-ciente"
          checked={ciente}
          onChange={(e) => setCiente(e.target.checked)}
          label={`${primeiroNome} está ciente e concordou com a coleta.`}
        />

        <div className="flex gap-3">
          <Button type="button" variant="ghost" fullWidth onClick={onClose}>
            Agora não
          </Button>
          <Button
            type="button"
            fullWidth
            disabled={!ciente}
            loading={registrar.isPending}
            onClick={() => registrar.mutate()}
          >
            Registrar ciência
          </Button>
        </div>
        <p className="text-caption text-text-subtle">
          Fica registrado com data e hora na aba Privacidade. Nada muda na etapa do atendimento.
        </p>
      </div>
    </Modal>
  );
}
