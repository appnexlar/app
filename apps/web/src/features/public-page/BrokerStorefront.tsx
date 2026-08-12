import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { PublicBrokerPageView, PublicPropertyCard } from "@nexlar/shared";
import { AuthImage } from "../properties/AuthImage";
import { PublicListingSection } from "./PublicListingSection";
import { InterestModal } from "./InterestModal";
import { waLink } from "./publicApi";

/**
 * A vitrine que o visitante vê. Recebe a view pronta e desenha; quem busca
 * dados são as rotas (pública e prévia). O único estado próprio é a folha de
 * contato, que é interface, não dado.
 *
 * Usa o design system da Nextlar (tokens semânticos), não uma paleta própria:
 * a página é a marca aparecendo para quem ainda não é cliente, então tem que
 * ser o Azul Noite e o Laranja Nextlar, não uma variação inventada.
 *
 * Única cor de fora: o verde do WhatsApp, que é marca de terceiro e precisa
 * ser reconhecível. Fica isolado nesta constante.
 */
const WHATSAPP = "#25D366";

const FOCO_LABEL: Record<string, string> = {
  venda: "Venda",
  locacao: "Locação",
  ambos: "Venda e locação",
};

const FINALIDADE_LABEL: Record<string, string> = {
  venda: "Venda",
  locacao: "Locação",
  venda_locacao: "Venda ou locação",
  temporada: "Temporada",
};

export function BrokerStorefront({
  page,
  interactive = true,
}: {
  page: PublicBrokerPageView;
  /** Falso na prévia: a listagem vira estática e os cards não navegam. */
  interactive?: boolean;
}) {
  const mensagemGeral = `Olá, ${page.name}! Vi sua página na Nextlar e gostaria de conversar sobre imóveis.`;
  // A folha de contato: aberta pelos CTAs de conversa. Na prévia o corretor
  // está olhando a própria página, então não faz sentido virar lead de si.
  const [contatoAberto, setContatoAberto] = useState(false);
  const podeCapturar = interactive && Boolean(page.whatsapp);
  const ctaDoHero = useRef<HTMLDivElement>(null);
  const heroVisivel = useEstaNaTela(ctaDoHero);

  return (
    <div className="min-h-dvh bg-bg font-sans text-text">
      {/* ============================================ Faixa hero em Azul Noite */}
      <header
        // Alturas encolhidas no mobile (foto, respiros) para a tira de imóveis
        // começar a aparecer ainda na primeira tela. No desktop sobra espaço,
        // então lá o hero mantém a escala original.
        className="relative overflow-hidden bg-primary pb-8 sm:pb-14"
        style={{
          // Profundidade no Azul Noite + um brilho do Laranja Nextlar contido no
          // canto superior, longe do texto (atrás do texto ele lava a leitura).
          backgroundImage:
            "radial-gradient(38rem 22rem at 92% -12%, color-mix(in srgb, var(--brand-orange-500) 42%, transparent), transparent 70%)," +
            "linear-gradient(180deg, var(--brand-navy-800), var(--brand-navy-950))",
        }}
      >
        {/* O canto mais nobre da página é de quem a página é. A assinatura da
            Nextlar continua existindo, no rodapé, onde assinatura de plataforma
            pertence. Aqui em cima fica a imobiliária, quando há, e o nome do
            corretor quando ele trabalha por conta. */}
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-5 pt-5 sm:px-8">
          {page.agencyLogoUrl ? (
            <img
              src={page.agencyLogoUrl}
              alt={page.agencyName ?? "Imobiliária"}
              className="h-7 w-auto max-w-[9rem] object-contain"
            />
          ) : (
            <span className="truncate text-body-sm font-bold tracking-tight text-white/85">
              {page.agencyName ?? page.name}
            </span>
          )}
        </div>

        <div className="mx-auto mt-5 flex max-w-4xl flex-col items-start gap-4 px-5 sm:mt-14 sm:flex-row sm:items-center sm:gap-10 sm:px-8">
          {/* Foto em squircle: mais editorial que o círculo de rede social. */}
          {page.photoUrl ? (
            <FotoDaVitrine
              src={page.photoUrl}
              alt={`Foto de ${page.name}`}
              doDono={!interactive}
              className="h-[4.5rem] w-[4.5rem] flex-none rounded-2xl object-cover shadow-lg ring-1 ring-white/25 sm:h-40 sm:w-40"
            />
          ) : (
            <span className="flex h-[4.5rem] w-[4.5rem] flex-none items-center justify-center rounded-2xl bg-accent text-h1 font-extrabold text-accent-on shadow-lg ring-1 ring-white/25 sm:h-40 sm:w-40">
              {iniciais(page.name)}
            </span>
          )}

          <div className="min-w-0">
            {page.verified && (
              <p className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-success px-3 py-1 text-caption font-bold text-white sm:mb-3">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Corretor verificado{page.creci && ` · CRECI ${page.creci}${page.creciUf ? `/${page.creciUf}` : ""}`}
              </p>
            )}

            <h1 className="text-[2.15rem] font-extrabold leading-tight tracking-tight text-primary-on sm:text-6xl">
              {page.name}
            </h1>

            {page.headline && (
              <p className="mt-2 max-w-xl text-body leading-snug text-white/90 sm:mt-3 sm:text-h3 sm:font-normal">
                {page.headline}
              </p>
            )}

            <LinhaDeAtuacao page={page} />
          </div>
        </div>

        {/* CTAs dentro do escuro, onde têm mais força. */}
        <div
          ref={ctaDoHero}
          className="mx-auto mt-5 flex max-w-4xl flex-col gap-2.5 px-5 sm:mt-8 sm:flex-row sm:gap-3 sm:px-8"
        >
          {/* Antes isto era um link direto para o WhatsApp: quem tocava saía da
              vitrine e o corretor ficava sem lead, sem origem e sem funil.
              Agora passa pela folha de contato, que registra e só então leva à
              conversa. Na prévia continua link, para o corretor testar. */}
          {page.whatsapp &&
            (podeCapturar ? (
              <button
                type="button"
                onClick={() => setContatoAberto(true)}
                className="flex min-h-12 items-center justify-center gap-2.5 rounded-md px-7 text-body-lg font-bold text-white shadow-md sm:min-h-[52px] transition-transform duration-base ease-standard hover:scale-[1.015]"
                style={{ backgroundColor: WHATSAPP }}
              >
                <IconeWhatsApp />
                Chamar no WhatsApp
              </button>
            ) : (
              <a
                href={waLink(page.whatsapp, mensagemGeral)}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-12 items-center justify-center gap-2.5 rounded-md px-7 text-body-lg font-bold text-white shadow-md sm:min-h-[52px] transition-transform duration-base ease-standard hover:scale-[1.015]"
                style={{ backgroundColor: WHATSAPP }}
              >
                <IconeWhatsApp />
                Chamar no WhatsApp
              </a>
            ))}
          {page.totalProperties > 0 && (
            <a
              href="#imoveis"
              className="flex min-h-12 items-center justify-center rounded-md border border-white/25 px-7 text-body-lg font-semibold text-primary-on sm:min-h-[52px] transition-colors duration-fast hover:bg-white/10"
            >
              Ver imóveis ({page.totalProperties})
            </a>
          )}
        </div>

        <TiraDeDestaques page={page} clickable={interactive} />
      </header>

      <main className="mx-auto max-w-4xl px-5 pb-28 sm:px-8 sm:pb-16">
        {/* ---------------------------------------------------------- Imóveis */}
        {/* Vêm antes da biografia de propósito: quem abre a vitrine de um
            corretor veio ver imóvel. A história dele importa, mas depois, na
            hora de decidir se confia em quem está vendendo. */}
        {interactive ? (
          <PublicListingSection slug={page.slug} whatsapp={page.whatsapp} brokerName={page.name} />
        ) : (
          page.properties.length > 0 && (
            <section id="imoveis" className="mt-12 scroll-mt-6 sm:mt-16">
              <Eyebrow>Imóveis</Eyebrow>
              <div className="mt-2 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <h2 className="text-h1 text-text sm:text-display">Selecionados para você</h2>
                <span className="text-body-sm font-semibold text-text-muted sm:flex-none">
                  {page.totalProperties} {page.totalProperties === 1 ? "imóvel" : "imóveis"}
                </span>
              </div>
              <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
                {page.properties.map((p) => (
                  <CartaoPublico
                    key={p.code}
                    property={p}
                    slug={page.slug}
                    whatsapp={page.whatsapp}
                    brokerName={page.name}
                    clickable={false}
                  />
                ))}
              </ul>
            </section>
          )
        )}

        {/* ------------------------------------------------------------ Sobre */}
        {page.bio && (
          <section className="mt-12 sm:mt-16">
            <Eyebrow>Sobre</Eyebrow>
            <p className="mt-3 max-w-2xl whitespace-pre-line text-h3 font-normal leading-normal text-text sm:text-h2 sm:font-normal">
              {page.bio}
            </p>
          </section>
        )}

        {/* ---------------------------------------------------------- Contato */}
        {/* Uma decisão, não uma ficha: o WhatsApp já é o herói da página
            (hero, cards, barra fixa), então aqui ficam só os OUTROS canais,
            como botões de um toque. Ninguém precisa ler um número de telefone;
            precisa tocar nele. */}
        <section className="mt-12 sm:mt-16">
          <Eyebrow>Contato</Eyebrow>
          <div className="mt-3 rounded-2xl bg-surface p-6 shadow-md sm:p-8">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="text-h1 text-text">Fale com {primeiroNome(page.name)}</h2>
              {(page.serviceHours || page.languages.length > 0) && (
                <p className="text-body-sm text-text-muted">
                  {[
                    page.serviceHours,
                    page.languages.length > 1 ? page.languages.join(" e ").toLowerCase() : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>

            {/* Só ícones: o botão grande de WhatsApp já existe no hero e na
                barra fixa; aqui ele é um canal entre os outros. 44px + gap-2.5
                garante os cinco canais numa linha só até em 320px de tela. */}
            <div className="mt-5 flex flex-wrap gap-2.5">
              {page.whatsapp && (
                <BotaoCanal
                  icone="whatsapp"
                  rotulo={`WhatsApp ${formatarTelefone(page.whatsapp)}`}
                  href={waLink(page.whatsapp, mensagemGeral)}
                />
              )}
              {page.phone && (
                <BotaoCanal icone="telefone" rotulo={`Ligar para ${formatarTelefone(page.phone)}`} href={`tel:+55${page.phone}`} />
              )}
              {page.email && (
                <BotaoCanal icone="email" rotulo={`Escrever para ${page.email}`} href={`mailto:${page.email}`} />
              )}
              {page.instagram && (
                <BotaoCanal
                  icone="instagram"
                  rotulo={`Instagram ${instagramBonito(page.instagram)}`}
                  href={instagramUrl(page.instagram)}
                />
              )}
              {page.website && (
                <BotaoCanal icone="site" rotulo={`Abrir o site ${page.website.replace(/^https?:\/\//, "")}`} href={page.website} />
              )}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- Rodapé */}
        <footer className="mt-14 border-t border-border pt-6 text-center text-caption text-text-muted">
          <p>
            Página de {page.name}
            {page.agencyName && ` · ${page.agencyName}`}
          </p>
          <p className="mt-1.5">
            Criada com{" "}
            <span className="font-extrabold tracking-tight text-text">
              nex<span className="text-accent">lar</span>
            </span>
          </p>
        </footer>
      </main>

      {/* Barra fixa no celular: o contato sempre a um polegar de distância.
          Só entra quando o botão do hero sai da tela. Os dois juntos eram o
          mesmo convite duas vezes, e o de baixo ainda comia altura útil
          justamente na tela em que o visitante decide se fica. */}
      {page.whatsapp && !heroVisivel && (
        <div className="animate-rise fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg p-3 backdrop-blur sm:hidden">
          {podeCapturar ? (
            <button
              type="button"
              onClick={() => setContatoAberto(true)}
              className="flex w-full min-h-[52px] items-center justify-center gap-2.5 rounded-md text-body-lg font-bold text-white shadow-sm"
              style={{ backgroundColor: WHATSAPP }}
            >
              <IconeWhatsApp />
              Chamar {primeiroNome(page.name)} no WhatsApp
            </button>
          ) : (
            <a
              href={waLink(page.whatsapp, mensagemGeral)}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[52px] items-center justify-center gap-2.5 rounded-md text-body-lg font-bold text-white shadow-sm"
              style={{ backgroundColor: WHATSAPP }}
            >
              <IconeWhatsApp />
              Chamar {primeiroNome(page.name)} no WhatsApp
            </a>
          )}
        </div>
      )}

      {contatoAberto && page.whatsapp && (
        <InterestModal
          slug={page.slug}
          brokerWhatsapp={page.whatsapp}
          onClose={() => setContatoAberto(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pedaços
// ---------------------------------------------------------------------------

/** Se o elemento está na tela agora. Usado para não repetir o mesmo CTA. */
function useEstaNaTela(alvo: React.RefObject<HTMLElement>): boolean {
  const [visivel, setVisivel] = useState(true);

  useEffect(() => {
    const no = alvo.current;
    if (!no) return;
    const observador = new IntersectionObserver(([entrada]) => setVisivel(entrada.isIntersecting));
    observador.observe(no);
    return () => observador.disconnect();
  }, [alvo]);

  return visivel;
}

/**
 * Imagem da vitrine. Na página pública é `<img>` puro, como deve ser. Na
 * prévia as URLs apontam para as rotas do dono (a pública só serve página no
 * ar), e `<img>` não manda Authorization, então ali quem carrega é o AuthImage.
 */
function FotoDaVitrine({
  src,
  alt,
  className,
  doDono,
}: {
  src: string;
  alt: string;
  className: string;
  doDono: boolean;
}) {
  if (doDono) return <AuthImage src={src} alt={alt} className={className} />;
  return <img src={src} alt={alt} loading="lazy" className={className} />;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption font-extrabold uppercase tracking-wide text-accent">{children}</p>
  );
}

/**
 * Imóveis ainda dentro do hero. Antes da primeira tela terminar, o visitante
 * via só a apresentação do corretor: para chegar num imóvel ele tinha que
 * passar pela biografia, pelo título da seção, pela busca e por três filtros.
 * Quem abre a página de um corretor veio ver imóvel; a tira responde a isso na
 * hora, e o resto da listagem continua logo abaixo para quem quer procurar.
 *
 * Destaques primeiro, e no máximo quatro: aqui é vitrine de calçada, não
 * catálogo. A rolagem horizontal deixa o quarto cartão meio visível, que é o
 * que diz "tem mais" sem precisar escrever.
 */
function TiraDeDestaques({
  page,
  clickable,
}: {
  page: PublicBrokerPageView;
  clickable: boolean;
}) {
  const vitrine = [...page.properties]
    .sort((a, b) => Number(b.highlighted) - Number(a.highlighted))
    .slice(0, 4);
  const tira = useRef<HTMLUListElement>(null);
  const { paraTras, paraFrente, rolar } = useRolagemDaTira(tira);
  if (vitrine.length === 0) return null;

  return (
    <div className="mt-6 sm:mt-10">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 sm:px-8">
        <p className="text-caption font-extrabold uppercase tracking-wide text-white/60">
          {vitrine.some((p) => p.highlighted) ? "Em destaque" : "Da carteira"}
        </p>
        {/* Setas só no desktop. No celular o dedo já rola a tira e a borda do
            cartão seguinte diz que tem mais; com mouse não existe pista
            nenhuma, porque a barra de rolagem está escondida de propósito. */}
        <div className="hidden gap-1.5 sm:flex">
          <SetaDaTira direcao="tras" habilitada={paraTras} onClick={() => rolar(-1)} />
          <SetaDaTira direcao="frente" habilitada={paraFrente} onClick={() => rolar(1)} />
        </div>
      </div>
      {/* O padding no scroller, e não no pai, para o primeiro cartão alinhar
          com o texto e o último não colar na borda ao fim da rolagem.
          O `scroll-px` é o par obrigatório disso: sem ele o snap ignora o
          respiro, gruda o primeiro cartão na borda da tela e a tira já nasce
          rolada 20px, com a seta de voltar acesa sem ter para onde voltar. */}
      <ul
        ref={tira}
        className="mx-auto flex max-w-4xl snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 pt-2.5 sm:scroll-px-8 sm:px-8 sm:pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {vitrine.map((p) => (
          <CartaoDeCalcada key={p.code} property={p} slug={page.slug} clickable={clickable} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Estado das setas da tira: se ainda dá para ir para trás ou para frente, e a
 * função que rola. Mede a rolagem real em vez de contar cartões, porque
 * quantos cabem depende da largura da janela.
 */
function useRolagemDaTira(tira: React.RefObject<HTMLUListElement>) {
  const [paraTras, setParaTras] = useState(false);
  const [paraFrente, setParaFrente] = useState(false);

  useEffect(() => {
    const el = tira.current;
    if (!el) return;
    // A folga de 4px evita a seta piscar por arredondamento de subpixel no
    // fim da rolagem, quando scrollLeft nunca chega exatamente ao limite.
    const medir = () => {
      setParaTras(el.scrollLeft > 4);
      setParaFrente(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => {
      el.removeEventListener("scroll", medir);
      observador.disconnect();
    };
  }, [tira]);

  const rolar = (sentido: 1 | -1) => {
    const el = tira.current;
    if (!el) return;
    // Um cartão por clique (largura do primeiro item + o gap de 12px), que é
    // o passo que o snap vai respeitar de qualquer forma.
    const passo = (el.firstElementChild?.getBoundingClientRect().width ?? 240) + 12;
    el.scrollBy({ left: passo * sentido, behavior: "smooth" });
  };

  return { paraTras, paraFrente, rolar };
}

function SetaDaTira({
  direcao,
  habilitada,
  onClick,
}: {
  direcao: "tras" | "frente";
  habilitada: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!habilitada}
      aria-label={direcao === "tras" ? "Ver imóveis anteriores" : "Ver mais imóveis"}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 text-white transition-colors duration-fast hover:bg-white/15 focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d={direcao === "tras" ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6"}
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/** Cartão compacto da tira: foto, preço e uma linha. Nada mais cabe aqui. */
function CartaoDeCalcada({
  property: p,
  slug,
  clickable,
}: {
  property: PublicPropertyCard;
  slug: string;
  clickable: boolean;
}) {
  const conteudo = (
    <>
      <div className="relative aspect-[3/2] overflow-hidden bg-white/10 sm:aspect-[4/3]">
        {p.coverUrl ? (
          <FotoDaVitrine
            src={p.coverUrl}
            alt={p.title}
            doDono={!clickable}
            className="h-full w-full object-cover transition-transform duration-500 ease-standard group-hover:scale-[1.05]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/40">
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 10.5L12 4l8 6.5M5.5 9.5V20h13V9.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </div>
        )}
        {p.highlighted && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-accent px-2.5 py-0.5 text-caption font-bold uppercase tracking-wide text-accent-on">
            Destaque
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <p className="text-body font-bold leading-tight text-white">{p.priceLabel}</p>
        <p className="truncate text-caption text-white/65">
          {[p.type, p.locationLine].filter(Boolean).join(" · ")}
        </p>
      </div>
    </>
  );

  const classe =
    "group block w-[15rem] flex-none snap-start overflow-hidden rounded-xl bg-white/[0.07] ring-1 ring-white/15 transition-colors duration-fast hover:bg-white/[0.12]";

  return (
    <li className="flex-none">
      {clickable ? (
        <Link to={`/corretor/${slug}/imovel/${p.code}`} className={classe}>
          {conteudo}
        </Link>
      ) : (
        <div className={classe}>{conteudo}</div>
      )}
    </li>
  );
}

function LinhaDeAtuacao({ page }: { page: PublicBrokerPageView }) {
  const onde = [page.mainCity, ...page.regions.filter((r) => r !== page.mainCity)].filter(Boolean);
  const oQue = [
    page.focus ? FOCO_LABEL[page.focus] : null,
    page.propertyTypes.length > 0 ? page.propertyTypes.join(", ") : null,
  ].filter(Boolean);

  if (onde.length === 0 && oQue.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-1 text-body-sm font-medium text-white/80 sm:mt-4 sm:gap-1.5">
      {onde.length > 0 && (
        <p className="flex items-center gap-1.5">
          <svg className="h-4 w-4 flex-none text-accent" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 21s-6.5-5.2-6.5-10a6.5 6.5 0 0113 0c0 4.8-6.5 10-6.5 10z" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="12" cy="11" r="2.3" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          {onde.slice(0, 4).join(" · ")}
        </p>
      )}
      {oQue.length > 0 && <p className="text-white/70">{oQue.join(" · ")}</p>}
    </div>
  );
}

export function CartaoPublico({
  property: p,
  slug,
  whatsapp,
  brokerName,
  clickable = true,
}: {
  property: PublicPropertyCard;
  slug: string;
  whatsapp: string | null;
  brokerName: string;
  /** Falso na prévia: o detalhe só existe com a página no ar. */
  clickable?: boolean;
}) {
  const atributos = [
    p.bedrooms != null ? `${p.bedrooms} ${p.bedrooms === 1 ? "quarto" : "quartos"}` : null,
    p.bathrooms != null ? `${p.bathrooms} ${p.bathrooms === 1 ? "banheiro" : "banheiros"}` : null,
    p.parkingSpots != null ? `${p.parkingSpots} ${p.parkingSpots === 1 ? "vaga" : "vagas"}` : null,
    p.area != null ? `${p.area} m²` : null,
  ].filter(Boolean);

  const detalheUrl = `/corretor/${slug}/imovel/${p.code}`;

  const foto = (
    <div className="relative aspect-[16/10] overflow-hidden bg-surface-sunken">
      {p.coverUrl ? (
        <FotoDaVitrine
          src={p.coverUrl}
          alt={p.title}
          doDono={!clickable}
          className="h-full w-full object-cover transition-transform duration-500 ease-standard group-hover:scale-[1.04]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-text-subtle">
          <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 10.5L12 4l8 6.5M5.5 9.5V20h13V9.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      {/* Chips sobre a foto: finalidade sempre, destaque quando é. */}
      <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
        <span className="rounded-full bg-primary px-3 py-1 text-caption font-bold uppercase tracking-wide text-primary-on backdrop-blur-sm">
          {FINALIDADE_LABEL[p.purpose] ?? p.purpose}
        </span>
        {p.highlighted && (
          <span className="rounded-full bg-accent px-3 py-1 text-caption font-bold uppercase tracking-wide text-accent-on">
            Destaque
          </span>
        )}
      </div>
    </div>
  );

  /**
   * O card inteiro é o link. Antes só a foto, o título e um botão "Ver imóvel"
   * levavam ao detalhe, e aquele botão custava uns 56px em cada card, numa
   * lista onde a altura é o recurso escasso: com ela, quatro imóveis viravam
   * quatro telas. Card clicável é o gesto que a pessoa já tenta primeiro.
   */
  const corpo = (
    <>
      {foto}

      <div className="flex flex-col gap-1 p-4">
        <p className="text-h2 text-text">{p.priceLabel}</p>
        <h3 className="text-body font-semibold leading-snug text-text">{p.title}</h3>
        {p.locationLine && (
          <p className="flex items-center gap-1 text-body-sm text-text-muted">
            <svg className="h-3.5 w-3.5 flex-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 21s-6.5-5.2-6.5-10a6.5 6.5 0 0113 0c0 4.8-6.5 10-6.5 10z" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="12" cy="11" r="2.3" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            {p.locationLine}
          </p>
        )}

        {atributos.length > 0 && (
          <p className="mt-1 text-body-sm font-medium text-text-muted">{atributos.join("  ·  ")}</p>
        )}

        {/* Na prévia não há detalhe para abrir, então o card mantém o botão de
            conversa que o corretor conhece. */}
        {!clickable && whatsapp && (
          <a
            href={waLink(whatsapp, `Olá, ${brokerName}! Vi o imóvel #${p.code} (${p.title}) na sua página da Nextlar e gostaria de mais informações.`)}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary text-body-sm font-bold text-primary-on transition-colors duration-fast hover:bg-primary-hover"
          >
            Tenho interesse
          </a>
        )}
      </div>
    </>
  );

  const moldura =
    "group block overflow-hidden rounded-xl bg-surface shadow-sm transition-shadow duration-base ease-standard hover:shadow-lg";

  return (
    <li>
      {clickable ? (
        <Link to={detalheUrl} className={moldura}>
          {corpo}
        </Link>
      ) : (
        <div className={moldura}>{corpo}</div>
      )}
    </li>
  );
}

const ICONES: Record<string, React.ReactNode> = {
  relogio: (
    <>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  // O glifo reconhecível do WhatsApp, preenchido (o mesmo dos botões grandes).
  // fill no path porque o svg do BotaoCanal é fill="none" para os traçados.
  whatsapp: (
    <path
      fill="currentColor"
      d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.7.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.2-.4.6-1.3 0-.2 0-.3-.1-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.5-.3z"
    />
  ),
  telefone: (
    <path
      d="M7 4h3l1.5 4-2 1.5a11 11 0 005 5L16 12.5l4 1.5v3a2 2 0 01-2.2 2A16 16 0 015 6.2 2 2 0 017 4z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  ),
  email: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.5 7l7.5 6 7.5-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  instagram: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16.8" cy="7.2" r="1.1" fill="currentColor" />
    </>
  ),
  site: (
    <>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.7 5.2 3.7 8.5s-1.3 6.2-3.7 8.5c-2.4-2.3-3.7-5.2-3.7-8.5s1.3-6.2 3.7-8.5z" stroke="currentColor" strokeWidth="1.7" />
    </>
  ),
};

/**
 * Um canal, um toque. O ícone carrega o significado; o rótulo completo (com o
 * número, o e-mail, o @) vai no aria-label e no tooltip, para acessibilidade
 * e para quem quiser conferir antes de tocar.
 */
function BotaoCanal({
  icone,
  rotulo,
  href,
}: {
  icone: keyof typeof ICONES;
  rotulo: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer"
      aria-label={rotulo}
      title={rotulo}
      className="flex h-11 w-11 flex-none items-center justify-center rounded-md bg-accent-soft text-accent transition-colors duration-fast hover:bg-accent hover:text-accent-on"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {ICONES[icone]}
      </svg>
    </a>
  );
}

function IconeWhatsApp() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.7.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.2-.4.6-1.3 0-.2 0-.3-.1-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.5-.3z" />
    </svg>
  );
}

function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function primeiroNome(nome: string): string {
  return nome.split(/\s+/)[0] ?? nome;
}

function formatarTelefone(digits: string): string {
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

function instagramBonito(valor: string): string {
  if (valor.startsWith("@")) return valor;
  return `@${valor.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "").replace(/^@/, "")}`;
}

function instagramUrl(valor: string): string {
  if (valor.startsWith("http")) return valor;
  return `https://instagram.com/${valor.replace(/^@/, "")}`;
}
