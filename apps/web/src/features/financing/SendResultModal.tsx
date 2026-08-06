import { useMemo, useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import type { FinancingSendResult } from "@nexlar/shared";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { ICON } from "../../components/ui/icon";

interface SendResultModalProps {
  result: FinancingSendResult | null;
  leadName: string;
  onClose: () => void;
}

/**
 * O link seguro, exibido UMA única vez (o banco só guarda o hash). Por isso
 * esta tela insiste no WhatsApp e no copiar antes de fechar. Serve ao primeiro
 * envio e ao "gerar novo link" de expirada/revogada.
 */
export function SendResultModal({ result, leadName, onClose }: SendResultModalProps) {
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const linkCompleto = useMemo(
    () => (result ? `${window.location.origin}${result.publicPath}` : ""),
    [result],
  );

  function fechar() {
    setCopiado(false);
    setAviso(null);
    onClose();
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(linkCompleto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setAviso("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  }

  return (
    <Modal open={result !== null} onClose={fechar} title="Link pronto para enviar">
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-text-muted">
          {leadName.split(" ")[0]} recebe o código de acesso por e-mail ao abrir. Por segurança,
          este link não aparece de novo: se perder, revogue e gere outro.
        </p>

        <p className="break-all rounded-md border border-border bg-surface-sunken px-3.5 py-3 font-mono text-body-sm text-text">
          {linkCompleto}
        </p>

        {aviso && <Banner variant="danger">{aviso}</Banner>}

        <div className="flex flex-col gap-2.5">
          {result?.whatsappUrl && (
            <a
              href={result.whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[var(--tap-target-min)] items-center justify-center gap-2 rounded-md bg-[#25D366] px-5 text-body font-bold text-white transition-opacity hover:opacity-90"
            >
              <MessageCircle size={ICON.action} aria-hidden="true" />
              Enviar pelo WhatsApp
            </a>
          )}
          <Button type="button" variant="ghost" fullWidth onClick={copiar}>
            {copiado ? (
              <>
                <Check size={ICON.action} aria-hidden="true" /> Link copiado
              </>
            ) : (
              <>
                <Copy size={ICON.action} aria-hidden="true" /> Copiar link
              </>
            )}
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={fechar}>
            Concluir
          </Button>
        </div>
      </div>
    </Modal>
  );
}
