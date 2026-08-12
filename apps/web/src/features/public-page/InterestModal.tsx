import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { submitInterest, waLink } from "./publicApi";

interface InterestModalProps {
  slug: string;
  /** Com imóvel: interesse. Sem imóvel: pedido de conversa pela vitrine. */
  propertyCode?: number;
  propertyTitle?: string;
  brokerWhatsapp?: string;
  onClose: () => void;
}

/**
 * A porta de entrada de lead da vitrine. Existe porque o caminho anterior era
 * um link direto para o WhatsApp: o visitante saía, o corretor ganhava uma
 * conversa solta e o Nextlar não ficava com nada. Aqui a pessoa vira lead
 * (com origem "Página pública" e consentimento registrado) e SÓ ENTÃO segue
 * para a conversa que ela queria ter.
 */
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
  const [aviso, setAviso] = useState<string | null>(null);

  const sobreImovel = propertyCode !== undefined;

  const mutation = useMutation({
    mutationFn: () =>
      submitInterest(slug, propertyCode, {
        name,
        whatsapp,
        message: message || undefined,
        acceptedTerms,
        // Ia sem isto antes, então a armadilha de robô não pegava nada.
        honeypot,
      }),
    onSuccess: () => {
      if (brokerWhatsapp) {
        const conversaMsg = sobreImovel
          ? `Olá, me interessei pelo imóvel ${propertyTitle} (#${propertyCode})`
          : `Olá! Vi sua página e gostaria de falar com você.`;
        // Navegação na mesma aba, não window.open: aba nova aberta depois de
        // um await não é mais gesto do usuário e o Safari do iPhone bloqueia,
        // o que deixaria a pessoa preenchendo o formulário e não indo a lugar
        // nenhum, que é justamente o que não pode acontecer aqui.
        window.location.href = waLink(brokerWhatsapp, conversaMsg);
        return;
      }
      onClose();
    },
  });

  const formatWhatsapp = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 11) return digits;
    return digits.slice(0, 15);
  };

  /**
   * O que falta preencher, em português. A validação do navegador resolveria,
   * mas ela fala o idioma do aparelho do visitante, e esta é a porta de
   * entrada de uma página em português: alguém com o celular em inglês leria
   * "Please fill out this field" no meio da vitrine.
   */
  const primeiraPendencia = (): { campo: string; aviso: string } | null => {
    if (name.trim().length < 2) return { campo: "name", aviso: "Informe seu nome." };
    if (whatsapp.replace(/\D/g, "").length < 10)
      return { campo: "whatsapp", aviso: "Informe seu WhatsApp com DDD." };
    if (!acceptedTerms)
      return { campo: "aceite", aviso: "Marque o aceite para o corretor poder responder." };
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pendencia = primeiraPendencia();
    if (pendencia) {
      setAviso(pendencia.aviso);
      document.getElementById(pendencia.campo)?.focus();
      return;
    }
    setAviso(null);
    mutation.mutate();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-bg p-6 sm:p-7 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-h3 font-bold text-text">
            {sobreImovel ? "Tenho interesse" : "Falar com o corretor"}
          </h2>
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

        {/* Diz de saída o que vai acontecer: quem pede conversa espera cair no
            WhatsApp, e formulário que não avisa parece pedágio. */}
        <p className="-mt-4 mb-5 text-body-sm text-text-muted">
          {sobreImovel
            ? "Deixe seu contato e a conversa abre no WhatsApp do corretor."
            : "Deixe seu contato e abrimos a conversa no WhatsApp do corretor."}
        </p>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div>
            <label htmlFor="name" className="block text-body-sm font-semibold text-text mb-1.5">
              Nome
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

          {/* O aceite fica num alvo grande e com fundo próprio: antes era uma
              caixinha de 13px, menor que a ponta do dedo, e é ela que destrava
              o botão. Errar o toque aqui é perder o contato inteiro. */}
          <label className="-mx-2 flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface">
            <input
              id="aceite"
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => {
                setAcceptedTerms(e.target.checked);
                if (e.target.checked) setAviso(null);
              }}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-border accent-primary"
            />
            <span className="text-body-sm text-text-muted">
              Concordo que o corretor possa entrar em contato comigo via WhatsApp
            </span>
          </label>

          <input type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} hidden />

          {aviso && (
            <p role="alert" className="-mb-1 text-body-sm font-semibold text-[var(--error-fg)]">
              {aviso}
            </p>
          )}

          {/* Desabilitado só enquanto envia. Antes o botão nascia apagado e não
              dizia o que faltava, então quem esquecia de marcar o aceite via
              um botão morto e ia embora. Habilitado, o toque dispara a
              validação do navegador, que aponta o campo e explica. */}
          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full min-h-12 rounded-lg bg-primary text-primary-on font-bold transition-colors hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? "Abrindo conversa..." : "Continuar no WhatsApp"}
          </button>

          {mutation.isError && (
            <p className="text-body-sm text-[var(--error-fg)] bg-[var(--error-soft)] rounded-lg p-3">
              {mutation.error instanceof Error ? mutation.error.message : "Erro ao registrar contato"}
            </p>
          )}
        </form>
      </div>
    </div>,
    document.body,
  );
}
