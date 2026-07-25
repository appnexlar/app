import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { submitInterest } from "./publicApi";

interface InterestModalProps {
  slug: string;
  propertyCode: number;
  propertyTitle: string;
  brokerWhatsapp?: string;
  onClose: () => void;
}

export function InterestModal({
  slug,
  propertyCode,
  propertyTitle,
  brokerWhatsapp,
  onClose,
}: InterestModalProps) {
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [message, setMessage] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [honeypot, setHoneypot] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      submitInterest(slug, propertyCode, {
        name,
        whatsapp,
        message: message || undefined,
        acceptedTerms,
      }),
    onSuccess: () => {
      if (brokerWhatsapp) {
        const conversaMsg = `Olá, me interessei pelo imóvel ${propertyTitle} (#${propertyCode})`;
        window.open(
          `https://wa.me/55${brokerWhatsapp}?text=${encodeURIComponent(conversaMsg)}`,
          "_blank",
        );
      }
      onClose();
    },
  });

  const formatWhatsapp = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 11) return digits;
    return digits.slice(0, 15);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-bg p-6 sm:p-7 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-h3 font-bold text-text">Tenho interesse</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text transition-colors"
            aria-label="Fechar"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M18 6L6 18M6 6l12 12" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="name" className="block text-body-sm font-semibold text-text mb-1.5">
              Nome completo
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              required
              minLength={2}
              maxLength={80}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="whatsapp" className="block text-body-sm font-semibold text-text mb-1.5">
              WhatsApp
            </label>
            <input
              id="whatsapp"
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(formatWhatsapp(e.target.value))}
              placeholder="(11) 98888-7766"
              required
              minLength={10}
              maxLength={15}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="mt-1 text-caption text-text-muted">Apenas números</p>
          </div>

          <div>
            <label htmlFor="message" className="block text-body-sm font-semibold text-text mb-1.5">
              Mensagem (opcional)
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Deixe uma mensagem para o corretor..."
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              required
              className="mt-1 w-4 h-4 rounded border-border accent-primary"
            />
            <span className="text-body-sm text-text-muted">
              Concordo que o corretor possa entrar em contato comigo via WhatsApp
            </span>
          </label>

          <input type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} hidden />

          <button
            type="submit"
            disabled={mutation.isPending || !acceptedTerms || !name || !whatsapp}
            className="w-full min-h-12 rounded-lg bg-primary text-primary-on font-bold transition-colors hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? "Enviando..." : "Confirmar interesse"}
          </button>

          {mutation.isError && (
            <p className="text-body-sm text-[var(--error-fg)] bg-[var(--error-soft)] rounded-lg p-3">
              {mutation.error instanceof Error ? mutation.error.message : "Erro ao registrar interesse"}
            </p>
          )}
        </form>
      </div>
    </div>,
    document.body,
  );
}
