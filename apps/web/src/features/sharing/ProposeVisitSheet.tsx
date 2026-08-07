import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarPlus, Check, Copy } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { ICON } from "../../components/ui/icon";
import { whatsappDigits } from "./api";

/**
 * Folha "Propor visita". A proposta é a ação; o canal é escolha de quem envia.
 * Antes o botão dizia "Propor visita no WhatsApp" e amarrava os dois: quem
 * preferia ligar ou já estava com a lead na linha não tinha o que apertar.
 */
export function ProposeVisitSheet({
  titulo = "Propor visita",
  mensagem,
  leadWhatsapp,
  onClose,
}: {
  titulo?: string;
  /** Mensagem pronta, montada pelo chamador com o contexto real do imóvel. */
  mensagem: string;
  leadWhatsapp: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [copiado, setCopiado] = useState(false);

  function abrirWhatsapp() {
    window.open(
      `https://wa.me/${whatsappDigits(leadWhatsapp)}?text=${encodeURIComponent(mensagem)}`,
      "_blank",
      "noopener",
    );
    onClose();
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(true);
      window.setTimeout(onClose, 900);
    } catch {
      // Sem clipboard (permissão negada): a mensagem continua visível abaixo
      // para seleção manual, então só não fechamos a folha.
      setCopiado(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={titulo}>
      <p className="text-body-sm text-text-muted">Como você quer combinar com a lead?</p>

      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <Opcao onClick={abrirWhatsapp} icone={<WhatsAppGlyph className="h-5 w-5 text-[#25D366]" />}>
          Enviar pelo WhatsApp
        </Opcao>
        <Opcao
          onClick={copiar}
          icone={
            copiado ? (
              <Check size={ICON.row} className="text-[var(--success-fg)]" aria-hidden="true" />
            ) : (
              <Copy size={ICON.row} className="text-text-muted" aria-hidden="true" />
            )
          }
        >
          {copiado ? "Mensagem copiada" : "Copiar a mensagem"}
        </Opcao>
        <Opcao
          onClick={() => {
            onClose();
            navigate("/agenda");
          }}
          icone={<CalendarPlus size={ICON.row} className="text-text-muted" aria-hidden="true" />}
        >
          Marcar direto na agenda
        </Opcao>
      </div>

      {/* A mensagem à vista: o corretor confere (e edita no destino) antes de
          mandar, em vez de descobrir o texto só dentro do WhatsApp. */}
      <p className="mt-4 whitespace-pre-line rounded-xl bg-surface-sunken p-4 text-body-sm text-text-muted">
        {mensagem}
      </p>
    </Modal>
  );
}

function Opcao({
  children,
  onClick,
  icone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icone: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[var(--tap-target-min)] w-full items-center gap-4 border-b border-border px-4 text-left text-body font-medium text-text transition-colors last:border-b-0 hover:bg-surface-sunken"
    >
      <span className="flex w-6 flex-none justify-center">{icone}</span>
      {children}
    </button>
  );
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.611-.916-2.206-.242-.58-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.05 21.785h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885" />
    </svg>
  );
}
