import { Link } from "react-router-dom";
import type { PublicBrokerPageView, PublicPropertyCard } from "@nexlar/shared";
import { PublicListingSection } from "./PublicListingSection";
import { waLink } from "./publicApi";

/**
 * A vitrine que o visitante vê. Componente puro: recebe a view pronta e
 * desenha; quem busca dados são as rotas (pública e prévia).
 *
 * Usa o design system da Nexlar (tokens semânticos), não uma paleta própria:
 * a página é a marca aparecendo para quem ainda não é cliente, então tem que
 * ser o Azul Noite e o Laranja Nexlar, não uma variação inventada.
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
  const mensagemGeral = `Olá, ${page.name}! Vi sua página na Nexlar e gostaria de conversar sobre imóveis.`;

  return (
    <div className="min-h-dvh bg-bg font-sans text-text">
      {/* ============================================ Faixa hero em Azul Noite */}
      <header
        className="relative overflow-hidden bg-primary pb-12 sm:pb-16"
        style={{
          // Profundidade no Azul Noite + um brilho do Laranja Nexlar contido no
          // canto superior, longe do texto (atrás do texto ele lava a leitura).
          backgroundImage:
            "radial-gradient(38rem 22rem at 92% -12%, color-mix(in srgb, var(--brand-orange-500) 42%, transparent), transparent 70%)," +
            "linear-gradient(180deg, var(--brand-navy-800), var(--brand-navy-950))",
        }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 pt-5 sm:px-8">
          <span className="text-body-sm font-extrabold tracking-tight text-white/85">
            nex<span className="text-accent">lar</span>
          </span>
          {page.agencyName && (
            <span className="truncate text-caption font-medium text-white/60">{page.agencyName}</span>
          )}
        </div>

        <div className="mx-auto mt-10 flex max-w-4xl flex-col items-start gap-6 px-5 sm:mt-14 sm:flex-row sm:items-center sm:gap-10 sm:px-8">
          {/* Foto em squircle: mais editorial que o círculo de rede social. */}
          {page.photoUrl ? (
            <img
              src={page.photoUrl}
              alt={`Foto de ${page.name}`}
              className="h-28 w-28 flex-none rounded-2xl object-cover shadow-lg ring-1 ring-white/25 sm:h-40 sm:w-40"
            />
          ) : (
            <span className="flex h-28 w-28 flex-none items-center justify-center rounded-2xl bg-accent text-h1 font-extrabold text-accent-on shadow-lg ring-1 ring-white/25 sm:h-40 sm:w-40">
              {iniciais(page.name)}
            </span>
          )}

          <div className="min-w-0">
            {page.verified && (
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-success px-3 py-1 text-caption font-bold text-white">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Corretor verificado{page.creci && ` · CRECI ${page.creci}${page.creciUf ? `/${page.creciUf}` : ""}`}
              </p>
            )}

            <h1 className="text-[2.6rem] font-extrabold leading-tight tracking-tight text-primary-on sm:text-6xl">
              {page.name}
            </h1>

            {page.headline && (
              <p className="mt-3 max-w-xl text-body-lg leading-snug text-white/90 sm:text-h3 sm:font-normal">
                {page.headline}
              </p>
            )}

            <LinhaDeAtuacao page={page} />
          </div>
        </div>

        {/* CTAs dentro do escuro, onde têm mais força. */}
        <div className="mx-auto mt-8 flex max-w-4xl flex-col gap-3 px-5 sm:flex-row sm:px-8">
          {page.whatsapp && (
            <a
              href={waLink(page.whatsapp, mensagemGeral)}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[52px] items-center justify-center gap-2.5 rounded-xl px-7 text-body-lg font-bold text-white shadow-md transition-transform duration-base ease-standard hover:scale-[1.015]"
              style={{ backgroundColor: WHATSAPP }}
            >
              <IconeWhatsApp />
              Chamar no WhatsApp
            </a>
          )}
          {page.totalProperties > 0 && (
            <a
              href="#imoveis"
              className="flex min-h-[52px] items-center justify-center rounded-xl border border-white/25 px-7 text-body-lg font-semibold text-primary-on transition-colors duration-fast hover:bg-white/10"
            >
              Ver imóveis ({page.totalProperties})
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 pb-28 sm:px-8 sm:pb-16">
        {/* ------------------------------------------------------------ Sobre */}
        {page.bio && (
          <section className="mt-10 sm:mt-14">
            <Eyebrow>Sobre</Eyebrow>
            <p className="mt-3 max-w-2xl whitespace-pre-line text-h3 font-normal leading-normal text-text sm:text-h2 sm:font-normal">
              {page.bio}
            </p>
          </section>
        )}

        {/* ---------------------------------------------------------- Imóveis */}
        {interactive ? (
          <PublicListingSection slug={page.slug} whatsapp={page.whatsapp} brokerName={page.name} />
        ) : (
          page.properties.length > 0 && (
            <section id="imoveis" className="mt-12 scroll-mt-6 sm:mt-16">
              <Eyebrow>Imóveis</Eyebrow>
              <div className="mt-2 flex items-baseline justify-between gap-4">
                <h2 className="text-display text-text">Selecionados para você</h2>
                <span className="flex-none text-body-sm font-semibold text-text-muted">
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

      {/* Barra fixa no celular: o contato sempre a um polegar de distância. */}
      {page.whatsapp && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg p-3 backdrop-blur sm:hidden">
          <a
            href={waLink(page.whatsapp, mensagemGeral)}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[52px] items-center justify-center gap-2.5 rounded-xl text-body-lg font-bold text-white shadow-sm"
            style={{ backgroundColor: WHATSAPP }}
          >
            <IconeWhatsApp />
            Chamar {primeiroNome(page.name)} no WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pedaços
// ---------------------------------------------------------------------------

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption font-extrabold uppercase tracking-wide text-accent">{children}</p>
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
    <div className="mt-4 flex flex-col gap-1.5 text-body-sm font-medium text-white/80">
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
    <div className="relative aspect-[16/11] overflow-hidden bg-surface-sunken">
      {p.coverUrl ? (
        <img
          src={p.coverUrl}
          alt={p.title}
          loading="lazy"
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

  return (
    <li className="group overflow-hidden rounded-xl bg-surface shadow-sm transition-shadow duration-base ease-standard hover:shadow-lg">
      {clickable ? <Link to={detalheUrl}>{foto}</Link> : foto}

      <div className="flex flex-col gap-1 p-5">
        <p className="text-h1 text-text">{p.priceLabel}</p>
        <h3 className="text-body font-semibold leading-snug text-text">
          {clickable ? (
            <Link to={detalheUrl} className="hover:text-accent">
              {p.title}
            </Link>
          ) : (
            p.title
          )}
        </h3>
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

        {clickable ? (
          <Link
            to={detalheUrl}
            className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary text-body-sm font-bold text-primary-on transition-colors duration-fast hover:bg-primary-hover"
          >
            Ver imóvel
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ) : (
          whatsapp && (
            <a
              href={waLink(whatsapp, `Olá, ${brokerName}! Vi o imóvel #${p.code} (${p.title}) na sua página da Nexlar e gostaria de mais informações.`)}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary text-body-sm font-bold text-primary-on transition-colors duration-fast hover:bg-primary-hover"
            >
              Tenho interesse
            </a>
          )
        )}
      </div>
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
      className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-accent-soft text-accent transition-colors duration-fast hover:bg-accent hover:text-accent-on"
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
