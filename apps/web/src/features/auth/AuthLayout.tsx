import { useEffect, useState, type ReactNode } from "react";
import { CalendarCheck, LayoutGrid, Link2, Users } from "lucide-react";

interface AuthLayoutProps {
  children: ReactNode;
  /**
   * Quando true, mostra a letra miúda dos Termos e da Política embaixo do
   * cartão. Fica de fora das telas em que o aceite é um passo do formulário,
   * para a pessoa não ler duas vezes a mesma coisa em versões diferentes.
   */
  legal?: boolean;
}

/**
 * Estrutura das telas de autenticação: um cartão central dividido em dois.
 * À esquerda, a vitrine do produto (só no desktop); à direita, o formulário.
 *
 * A vitrine hoje é texto: as funções do sistema se apresentando em rodízio,
 * no molde das telas de entrada de produto que giram os destaques embaixo.
 * O painel é um bloco independente de propósito, para depois receber imagem
 * ou vídeo sem mexer no resto.
 *
 * No celular só existe o formulário, sem cartão e sem moldura: em 375px a
 * decisão precisa estar acima da dobra, e vitrine é luxo de tela grande.
 */
export function AuthLayout({ children, legal = false }: AuthLayoutProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-bg px-6 py-10 lg:bg-surface-sunken">
      <div className="w-full max-w-[440px] lg:max-w-[920px]">
        <div className="lg:grid lg:grid-cols-[1.05fr_1fr] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-surface lg:shadow-md">
          <ShowcasePanel />

          <div className="lg:flex lg:flex-col lg:justify-center lg:p-10">
            {/* No desktop a marca já está no painel; duas juntas viram eco. */}
            <img
              src="/logo-wordmark.svg"
              alt="Nextlar"
              className="mx-auto mb-8 h-14 w-auto lg:hidden"
            />
            {children}
          </div>
        </div>

        {legal && <LegalFootnote />}
      </div>
    </div>
  );
}

/**
 * As funções que giram na vitrine. Cada uma é uma tela real do sistema, não
 * promessa de marketing: quem entrar vai encontrar exatamente isso.
 */
const DESTAQUES = [
  {
    icone: Users,
    chave: "leads",
    titulo: "Cada lead no lugar certo",
    texto:
      "Cadastre um lead em segundos, só com nome e WhatsApp, e acompanhe cada um no funil até o fechamento.",
  },
  {
    icone: LayoutGrid,
    chave: "selecoes",
    titulo: "Seleções que vendem por você",
    texto:
      "Monte uma seleção de imóveis para cada cliente e envie um link único. Você vê o que ele curtiu e responde na hora.",
  },
  {
    icone: Link2,
    chave: "pagina",
    titulo: "Sua página pública de corretor",
    texto:
      "Sua vitrine com seus imóveis, seu WhatsApp e o selo de CRECI verificado, pronta para colocar no perfil do Instagram.",
  },
  {
    icone: CalendarCheck,
    chave: "agenda",
    titulo: "Visitas sem vaivém de horário",
    texto:
      "O cliente escolhe um horário livre da sua agenda e a visita já entra marcada, com lembrete para os dois lados.",
  },
] as const;

/** Quanto tempo cada destaque fica no ar antes de passar a vez. */
const RODIZIO_MS = 6000;

/**
 * O painel da esquerda: fundo navy da marca com os destaques em rodízio.
 * Clicar num marcador escolhe o destaque na mão e pausa o rodízio, porque
 * quem clicou quer ler, e a tela trocando sozinha embaixo do olho é o jeito
 * mais rápido de perder essa pessoa.
 */
function ShowcasePanel() {
  const [ativo, setAtivo] = useState(0);
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (pausado) return;
    // Sem rodízio para quem pediu menos movimento ao sistema operacional.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setAtivo((i) => (i + 1) % DESTAQUES.length),
      RODIZIO_MS,
    );
    return () => window.clearInterval(timer);
  }, [pausado]);

  const destaque = DESTAQUES[ativo];
  const Icone = destaque.icone;

  return (
    <aside className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:justify-between lg:p-10">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 15% 10%, var(--brand-navy-700) 0%, var(--primary) 45%, var(--primary-active) 100%)",
        }}
      />
      {/* Traço quente da marca, para o painel não ser um bloco chapado. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full opacity-25 blur-3xl"
        style={{ background: "var(--accent)" }}
      />

      <img src="/logo-white.svg" alt="" aria-hidden="true" className="relative h-12 w-auto self-start" />

      {/* aria-live anuncia a troca para leitores de tela sem roubar o foco. */}
      <div className="relative" aria-live="polite">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
          <Icone className="h-6 w-6 text-text-on-brand" aria-hidden="true" />
        </span>
        <h2 className="mt-6 text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-text-on-brand">
          {destaque.titulo}
        </h2>
        <p className="mt-3 max-w-sm text-body leading-relaxed text-[var(--brand-navy-100)]">
          {destaque.texto}
        </p>
      </div>

      {/* Marcadores: um traço por destaque, o ativo aceso em laranja. */}
      <div className="relative flex gap-2" role="tablist" aria-label="Destaques do Nextlar">
        {DESTAQUES.map((d, i) => (
          <button
            key={d.chave}
            type="button"
            role="tab"
            aria-selected={i === ativo}
            aria-label={d.titulo}
            onClick={() => {
              setAtivo(i);
              setPausado(true);
            }}
            className="group flex h-6 flex-1 items-center focus-visible:shadow-focus"
          >
            <span
              className={
                "h-1 w-full rounded-full transition-colors duration-base " +
                (i === ativo ? "bg-accent" : "bg-white/20 group-hover:bg-white/35")
              }
            />
          </button>
        ))}
      </div>
    </aside>
  );
}

/** Divisor entre o caminho do Google e a alternativa por e-mail. */
export function OrDivider({ label = "ou" }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-4" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="text-caption text-text-subtle">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * A letra miúda exigida pela LGPD, no rodapé.
 *
 * Aqui ela é aviso, não consentimento: a prova que vale é o checkbox da
 * primeira etapa do cadastro, que grava data e versão do texto no banco. Este
 * rodapé existe para que os links estejam à mão antes de a pessoa clicar em
 * qualquer botão, e não escondidos três telas adiante.
 */
export function LegalFootnote() {
  return (
    <p className="mx-auto mt-8 max-w-[360px] text-center text-caption leading-relaxed text-text-subtle">
      Ao continuar, você concorda com os{" "}
      <a
        href="/termos"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-text-muted underline underline-offset-2 transition-colors hover:text-text"
      >
        Termos de Uso
      </a>{" "}
      e com a{" "}
      <a
        href="/privacidade"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-text-muted underline underline-offset-2 transition-colors hover:text-text"
      >
        Política de Privacidade
      </a>{" "}
      do Nextlar.
    </p>
  );
}
