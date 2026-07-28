import { useEffect, useRef, useState } from "react";
import type { PublicPropertyDetail } from "@nexlar/shared";

/**
 * O corpo do anúncio público: galeria, cabeçalho, chips, descrição, ficha
 * técnica, condições de locação, vídeos e links. Nasceu na página da vitrine
 * (/corretor/:slug/imovel/:code) e é o mesmo na seleção personalizada
 * (/selecao/:token): a lead merece exatamente a mesma página caprichada.
 * Quem envolve decide o contexto (voltar, CTA, corretor).
 */

const FINALIDADE_LABEL: Record<string, string> = {
  venda: "Venda",
  locacao: "Locação",
  venda_locacao: "Venda ou locação",
  temporada: "Temporada",
};

export function PropertyDetailBody({
  property,
  extraBadge,
}: {
  property: PublicPropertyDetail;
  /** Selo adicional ao lado da finalidade (ex.: "Escolhido para você"). */
  extraBadge?: string | null;
}) {
  const atributos = [
    property.bedrooms != null
      ? `${property.bedrooms} ${property.bedrooms === 1 ? "quarto" : "quartos"}`
      : null,
    property.bathrooms != null
      ? `${property.bathrooms} ${property.bathrooms === 1 ? "banheiro" : "banheiros"}`
      : null,
    property.parkingSpots != null
      ? `${property.parkingSpots} ${property.parkingSpots === 1 ? "vaga" : "vagas"}`
      : null,
    property.area != null ? `${property.area} m²` : null,
    property.furnished ? "Mobiliado" : null,
  ].filter(Boolean);

  const condicoes = [
    property.acceptsFinancing ? "Aceita financiamento" : null,
    property.acceptsFgts ? "Aceita FGTS" : null,
    property.acceptsTrade ? "Aceita permuta" : null,
    property.priceNegotiable ? "Valor negociável" : null,
  ].filter(Boolean);

  return (
    <>
      <Galeria detail={property} />

      {/* Cabeçalho do anúncio. Espaçamentos na régua de 8: 8 entre linhas
          irmãs, 16 entre blocos, 24 entre seções. */}
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary px-3 py-1 text-caption font-bold uppercase tracking-wide text-primary-on">
              {FINALIDADE_LABEL[property.purpose] ?? property.purpose}
            </span>
            {property.highlighted && (
              <span className="rounded-full bg-accent px-3 py-1 text-caption font-bold uppercase tracking-wide text-accent-on">
                Destaque
              </span>
            )}
            {extraBadge && (
              <span className="rounded-full bg-accent-soft px-3 py-1 text-caption font-bold uppercase tracking-wide text-accent">
                {extraBadge}
              </span>
            )}
          </div>
          <h1 className="mt-4 text-h1 text-text sm:text-display">{property.title}</h1>
          {property.locationLine && (
            <p className="mt-2 flex items-center gap-2 text-body-sm text-text-muted">
              <svg className="h-4 w-4 flex-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 21s-6.5-5.2-6.5-10a6.5 6.5 0 0113 0c0 4.8-6.5 10-6.5 10z" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="12" cy="11" r="2.3" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              {property.locationLine}
            </p>
          )}
          {(property.condoName || property.reference) && (
            <p className="mt-1 pl-6 text-body-sm text-text-muted">
              {[property.condoName, property.reference].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        <div className="text-left sm:text-right">
          <p className="text-display text-text">{property.priceLabel}</p>
          {(property.condoFeeLabel || property.iptuLabel) && (
            <p className="mt-1 text-body-sm text-text-muted">
              {[
                property.condoFeeLabel && `Cond. ${property.condoFeeLabel}`,
                property.iptuLabel && `IPTU ${property.iptuLabel}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </div>

      {/* Atributos e condições, em chips escaneáveis. */}
      {(atributos.length > 0 || condicoes.length > 0) && (
        <div className="mt-6 flex flex-wrap gap-2">
          {atributos.map((a) => (
            <span key={a} className="rounded-md bg-surface px-3 py-1.5 text-body-sm font-semibold text-text shadow-xs">
              {a}
            </span>
          ))}
          {condicoes.map((c) => (
            <span key={c} className="rounded-md bg-success-soft px-3 py-1.5 text-body-sm font-semibold text-[var(--success-fg)]">
              {c}
            </span>
          ))}
        </div>
      )}

      {property.description && (
        <section className="mt-8 max-w-2xl">
          <h2 className="text-caption font-extrabold uppercase tracking-wide text-accent">Sobre o imóvel</h2>
          <p className="mt-2 whitespace-pre-line text-body-lg leading-normal text-text">
            {property.description}
          </p>
        </section>
      )}

      {/* Ficha técnica: tudo que o corretor preencheu no cadastro, incluindo
          as comodidades. Uma seção só, para o visitante não caçar informação
          em dois lugares. */}
      {property.specs.length > 0 && (
        <section className="mt-8">
          <h2 className="text-caption font-extrabold uppercase tracking-wide text-accent">
            Ficha do imóvel
          </h2>
          <div className="mt-3 flex flex-col gap-6">
            {property.specs.map((grupo) => (
              <div key={grupo.title}>
                <h3 className="text-body-sm font-bold text-text">{grupo.title}</h3>

                {grupo.kind === "itens" ? (
                  <ul className="mt-2.5 flex flex-wrap gap-2">
                    {grupo.items.map((item) => (
                      <li
                        key={item.label}
                        className="flex items-center gap-1.5 rounded-full border border-border bg-surface py-1.5 pl-2.5 pr-3.5 text-body-sm text-text"
                      >
                        <svg
                          className="h-3.5 w-3.5 flex-none text-accent"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M20 6L9 17l-5-5"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {item.label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <dl className="mt-1 grid gap-x-8 sm:grid-cols-2">
                    {grupo.items.map((item) => (
                      <div
                        key={item.label}
                        className="flex items-baseline justify-between gap-3 border-b border-border py-2.5"
                      >
                        <dt className="text-body-sm text-text-muted">{item.label}</dt>
                        <dd className="text-right text-body-sm font-semibold tabular-nums text-text">
                          {item.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Condições de aluguel: o que a pessoa precisa saber antes de chamar. */}
      {property.rentTerms && (
        <section className="mt-8">
          <h2 className="text-caption font-extrabold uppercase tracking-wide text-accent">
            Condições da locação
          </h2>
          <dl className="mt-3 grid gap-x-6 sm:grid-cols-2">
            {[
              { label: "Garantias aceitas", value: property.rentTerms.guaranteeTypes },
              {
                label: "Prazo mínimo",
                value:
                  property.rentTerms.minTermMonths != null
                    ? `${property.rentTerms.minTermMonths} ${
                        property.rentTerms.minTermMonths === 1 ? "mês" : "meses"
                      }`
                    : null,
              },
              { label: "Outras taxas", value: property.rentTerms.otherFees },
              { label: "Disponível a partir de", value: property.rentTerms.availableFromLabel },
            ]
              .filter((i) => i.value)
              .map((i) => (
                <div
                  key={i.label}
                  className="flex items-baseline justify-between gap-3 border-b border-border py-2"
                >
                  <dt className="text-body-sm text-text-muted">{i.label}</dt>
                  <dd className="text-right text-body-sm font-semibold text-text">{i.value}</dd>
                </div>
              ))}
          </dl>
          {property.rentTerms.notes && (
            <p className="mt-3 whitespace-pre-line text-body-sm text-text-muted">
              {property.rentTerms.notes}
            </p>
          )}
        </section>
      )}

      {property.videos.length > 0 && (
        <section className="mt-8">
          <h2 className="text-caption font-extrabold uppercase tracking-wide text-accent">Vídeos</h2>
          <div className="mt-3 flex flex-col gap-3">
            {property.videos.map((v) => (
              <video
                key={v.url}
                src={v.url}
                controls
                preload="metadata"
                className="w-full rounded-2xl bg-surface-sunken"
              >
                <track kind="captions" />
              </video>
            ))}
          </div>
        </section>
      )}

      {property.links.length > 0 && (
        <section className="mt-8">
          <h2 className="text-caption font-extrabold uppercase tracking-wide text-accent">
            Tour virtual e mais
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {property.links.map((l) => (
              <li key={l.url}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 text-body-sm font-semibold text-text transition-colors hover:border-accent hover:text-accent"
                >
                  <span className="truncate">{l.caption || "Abrir link"}</span>
                  <svg className="h-4 w-4 flex-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M7 17L17 7M17 7H9m8 0v8"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Galeria
// ---------------------------------------------------------------------------

/**
 * Rola um container até a posição pedida, com animação quando o navegador
 * animar. Nem todo navegador executa `behavior: "smooth"` programático (Safari
 * antigo e alguns embutidos ignoram em silêncio), e aí o carrossel ficaria
 * parado. A conferência atrasada garante o destino sem atropelar quem anima.
 */
function rolarPara(el: HTMLElement, left: number): void {
  const destino = Math.max(0, left);
  el.scrollTo({ left: destino, behavior: "smooth" });
  window.setTimeout(() => {
    if (Math.abs(el.scrollLeft - destino) > 4) el.scrollLeft = destino;
  }, 400);
}

/**
 * Carrossel de fotos. O deslize é o do próprio navegador (scroll horizontal com
 * encaixe), que no celular dá inércia e resposta ao toque de graça, coisa que
 * nenhuma reimplementação em JS entrega igual. O índice é lido do scroll, então
 * arrastar, clicar na miniatura e usar o teclado convergem para o mesmo estado.
 */
export function Galeria({ detail }: { detail: PublicPropertyDetail }) {
  const trilho = useRef<HTMLDivElement>(null);
  const miniaturas = useRef<HTMLDivElement>(null);
  const [indice, setIndice] = useState(0);
  const fotos = detail.photos;

  // Imóvel trocou: volta para a primeira foto, sem animação de arrasto.
  useEffect(() => {
    setIndice(0);
    trilho.current?.scrollTo({ left: 0 });
  }, [detail.code]);

  const irPara = (i: number) => {
    const alvo = Math.max(0, Math.min(i, fotos.length - 1));
    const el = trilho.current;
    if (!el) return;
    rolarPara(el, alvo * el.clientWidth);
    setIndice(alvo);
  };

  // A tira de miniaturas segue a foto ativa. Sem isto, quem passa da quarta
  // foto continua vendo as quatro primeiras e acha que o álbum acabou ali.
  // A posição é calculada e aplicada com scrollTo em vez de scrollIntoView:
  // parte dos navegadores ignora o scrollIntoView suave dentro de um container
  // rolável, e aí a tira simplesmente não andava.
  useEffect(() => {
    const tira = miniaturas.current;
    const alvo = tira?.querySelector<HTMLElement>(`[data-indice="${indice}"]`);
    if (!tira || !alvo) return;
    const deslocamento = alvo.getBoundingClientRect().left - tira.getBoundingClientRect().left;
    const centro = (tira.clientWidth - alvo.clientWidth) / 2;
    rolarPara(tira, tira.scrollLeft + deslocamento - centro);
  }, [indice]);

  // Esconder a barra de rolagem deixou a tira limpa, mas também tirou a única
  // pista de que existe mais coisa fora da vista. O esmaecido devolve a pista:
  // aparece só do lado em que ainda há foto para ver.
  const [sobra, setSobra] = useState({ esquerda: false, direita: false });
  const medirSobra = () => {
    const el = miniaturas.current;
    if (!el) return;
    const fim = el.scrollWidth - el.clientWidth;
    setSobra({ esquerda: el.scrollLeft > 4, direita: el.scrollLeft < fim - 4 });
  };
  useEffect(medirSobra, [indice, fotos.length]);

  if (fotos.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-surface-sunken text-text-subtle sm:aspect-[16/10]">
        <svg className="h-12 w-12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 10.5L12 4l8 6.5M5.5 9.5V20h13V9.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="group relative">
        <div
          ref={trilho}
          tabIndex={0}
          role="region"
          aria-label={`Fotos do imóvel, ${fotos.length} no total`}
          onScroll={(e) => {
            const el = e.currentTarget;
            const novoIndice = Math.round(el.scrollLeft / el.clientWidth);
            if (novoIndice !== indice) setIndice(novoIndice);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") irPara(indice + 1);
            if (e.key === "ArrowLeft") irPara(indice - 1);
          }}
          className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-2xl bg-surface-sunken"
        >
          {fotos.map((foto, i) => (
            <img
              key={foto.url}
              src={foto.url}
              alt={foto.caption ?? `${detail.title}, foto ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              draggable={false}
              className="aspect-[4/3] w-full flex-none snap-center object-cover sm:aspect-[16/10]"
            />
          ))}
        </div>

        {fotos.length > 1 && (
          <>
            {/* Setas só onde não há dedo para arrastar. */}
            <Seta lado="esquerda" disabled={indice === 0} onClick={() => irPara(indice - 1)} />
            <Seta
              lado="direita"
              disabled={indice === fotos.length - 1}
              onClick={() => irPara(indice + 1)}
            />
            <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-caption font-bold tabular-nums text-white backdrop-blur-sm">
              {indice + 1} / {fotos.length}
            </span>
          </>
        )}
      </div>

      {fotos.length > 1 && (
        <div className="relative">
          {sobra.esquerda && (
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-bg to-transparent" />
          )}
          {sobra.direita && (
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-bg to-transparent" />
          )}
          <div
            ref={miniaturas}
            onScroll={medirSobra}
            className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1"
          >
            {fotos.map((foto, i) => (
              <button
                key={foto.url}
                type="button"
                data-indice={i}
                onClick={() => irPara(i)}
                aria-label={`Ver foto ${i + 1} de ${fotos.length}`}
                aria-current={i === indice}
                className={`h-16 w-24 flex-none overflow-hidden rounded-lg transition-all duration-fast ${
                  i === indice
                    ? "ring-2 ring-accent ring-offset-2 ring-offset-bg"
                    : "opacity-60 hover:opacity-100"
                }`}
              >
                <img src={foto.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Seta de navegação da galeria: aparece no hover, some no celular. */
function Seta({
  lado,
  disabled,
  onClick,
}: {
  lado: "esquerda" | "direita";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={lado === "esquerda" ? "Foto anterior" : "Próxima foto"}
      className={`absolute top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-sm transition-opacity duration-fast hover:bg-black/65 focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-0 group-hover:opacity-100 sm:flex ${
        lado === "esquerda" ? "left-3" : "right-3"
      }`}
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d={lado === "esquerda" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
