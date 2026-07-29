import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CRECI_STATUS_LABELS, type BrokerProfile } from "@nexlar/shared";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { TextField } from "../../components/ui/TextField";
import { Select } from "../../components/ui/Select";
import { FileUpload } from "../../components/ui/FileUpload";
import { UFS } from "../../lib/brazil";
import { useAuth } from "../auth/AuthContext";
import { submitCreci } from "./api";

/**
 * Verificação de CRECI: opcional, e por isso a tela vende o benefício em vez
 * de cobrar o documento. Quem não envia usa o Nexlar inteiro do mesmo jeito.
 *
 * O corretor nunca muda o próprio status. Ele envia, e a conferência é
 * manual: é justamente isso que dá valor ao selo que a lead vê.
 */
export function CreciCard({ broker }: { broker: BrokerProfile }) {
  const { atualizarBroker } = useAuth();
  const status = broker.creciStatus;

  if (status === "aprovado") {
    return (
      <Cartao>
        <div className="flex items-start gap-3">
          <SeloVerificado />
          <div className="min-w-0">
            <h3 className="text-body font-semibold text-text">Corretor verificado</h3>
            <p className="mt-1 text-body-sm text-text-muted">
              CRECI {broker.creci}
              {broker.creciUf ? `/${broker.creciUf}` : ""}, conferido pela nossa equipe.
              O selo aparece para suas leads na página dos imóveis que você envia.
            </p>
          </div>
        </div>
      </Cartao>
    );
  }

  if (status === "pendente") {
    return (
      <Cartao>
        <h3 className="text-body font-semibold text-text">CRECI em análise</h3>
        <p className="mt-1 text-body-sm text-text-muted">
          Recebemos seu documento e estamos conferindo. Costuma levar até um dia
          útil. Você continua usando o Nexlar normalmente enquanto isso.
        </p>
        <p className="mt-3 text-caption text-text-subtle">
          Enviado: CRECI {broker.creci}
          {broker.creciUf ? `/${broker.creciUf}` : ""}
        </p>
      </Cartao>
    );
  }

  return (
    <Cartao>
      <h3 className="text-body font-semibold text-text">
        {status === "recusado" ? "Envie seu CRECI de novo" : "Ganhe o selo de corretor verificado"}
      </h3>

      {status === "recusado" ? (
        <div className="mt-3">
          <Banner variant="danger">
            {broker.creciRejectionReason ??
              "Não conseguimos confirmar o CRECI enviado. Confira os dados e o documento."}
          </Banner>
        </div>
      ) : (
        <p className="mt-1 text-body-sm text-text-muted">
          É opcional, mas vale a pena: quem envia o CRECI e passa pela conferência
          ganha um selo que aparece para a lead na página dos imóveis enviados. É o
          que mostra, para quem não te conhece, que do outro lado tem um corretor
          de verdade.
        </p>
      )}

      <FormularioEnvio
        onSucesso={(perfil) => atualizarBroker(perfil)}
        rotulo={status === "recusado" ? "Reenviar para análise" : "Enviar para análise"}
      />
    </Cartao>
  );
}

function FormularioEnvio({
  onSucesso,
  rotulo,
}: {
  onSucesso: (perfil: BrokerProfile) => void;
  rotulo: string;
}) {
  const [creci, setCreci] = useState("");
  const [creciUf, setCreciUf] = useState("");
  const [documento, setDocumento] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string>();

  const envio = useMutation({ mutationFn: submitCreci, onSuccess: onSucesso });

  const enviar = () => {
    if (!documento) {
      setErroArquivo("Anexe a foto ou o PDF do seu CRECI.");
      return;
    }
    envio.mutate({ creci: creci.trim(), creciUf, documento });
  };

  const podeEnviar = creci.trim().length >= 2 && creciUf.length === 2 && documento !== null;

  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <TextField
          label="Número do CRECI"
          placeholder="Ex.: 123456-F"
          value={creci}
          onChange={(e) => setCreci(e.target.value)}
        />
        <div className="w-32">
          <Select
            label="Estado"
            placeholder="UF"
            options={UFS}
            value={creciUf}
            onValueChange={setCreciUf}
          />
        </div>
      </div>

      <FileUpload
        label="Documento do CRECI"
        hint="Foto ou PDF da sua carteira ou certidão. Guardado em área privada, usado só para a conferência."
        file={documento}
        onChange={(f) => {
          setDocumento(f);
          setErroArquivo(undefined);
        }}
        onValidationError={setErroArquivo}
        error={erroArquivo}
      />

      {envio.isError && (
        <Banner variant="danger">
          {envio.error instanceof Error
            ? envio.error.message
            : "Não foi possível enviar agora. Tente novamente."}
        </Banner>
      )}

      <Button
        type="button"
        variant="accent"
        className="self-start"
        disabled={!podeEnviar}
        loading={envio.isPending}
        onClick={enviar}
      >
        {rotulo}
      </Button>
    </div>
  );
}

function SeloVerificado() {
  return (
    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-success-soft text-[var(--success-fg)]">
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M20 6L9 17l-5-5"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function Cartao({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      {children}
    </section>
  );
}

export { CRECI_STATUS_LABELS };
