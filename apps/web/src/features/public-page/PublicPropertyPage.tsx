import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchPublicPropertyDetail } from "./publicApi";
import { InterestModal } from "./InterestModal";
import { PropertyDetailBody } from "./PropertyDetailBody";

/**
 * O imóvel aberto para o visitante: galeria, preço, atributos, descrição e o
 * caminho de volta para o corretor. Mesma linguagem visual da vitrine
 * (tokens da marca), mesma regra de privacidade (só o que pode ser público).
 */

const WHATSAPP = "#25D366";


export function PublicPropertyPage() {
  const { slug = "", code = "" } = useParams();
  const [showInterestModal, setShowInterestModal] = useState(false);

  const consulta = useQuery({
    queryKey: ["vitrine", slug, "imovel", code],
    queryFn: () => fetchPublicPropertyDetail(slug, code),
    staleTime: 60_000,
    retry: 1,
  });

  if (consulta.isLoading) return <Esqueleto />;

  const dados = consulta.data;
  if (consulta.isError || !dados?.available || !dados.property || !dados.broker) {
    return <Indisponivel slug={slug} />;
  }

  const { property, broker } = dados;

  return (
    <div className="min-h-dvh bg-bg pb-28 font-sans text-text sm:pb-12">
      {/* Barra de volta: o corretor é o contexto, não a Nextlar. */}
      <header className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4 sm:px-8">
        <Link
          to={`/corretor/${slug}`}
          className="flex items-center gap-2 text-body-sm font-semibold text-text-muted transition-colors hover:text-text"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {broker.name}
        </Link>
        <span className="text-caption font-semibold text-text-subtle">Imóvel #{property.code}</span>
      </header>

      <main className="mx-auto max-w-4xl px-5 sm:px-8">
        <PropertyDetailBody property={property} />

        {/* O corretor, fechando o anúncio. A ação vive aqui no desktop e na
            barra fixa no celular: nunca nos dois, senão são dois botões
            idênticos a um dedo de distância. */}
        <section className="mt-10 flex flex-col items-start gap-4 rounded-2xl bg-primary p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="flex items-center gap-4">
            {broker.photoUrl ? (
              <img src={broker.photoUrl} alt="" className="h-14 w-14 rounded-xl object-cover ring-1 ring-white/25" />
            ) : null}
            <div>
              <p className="text-body-lg font-bold text-primary-on">{broker.name}</p>
              {broker.verified && (
                <p className="flex items-center gap-1 text-caption font-semibold text-white/70">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Corretor verificado
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowInterestModal(true)}
            className="hidden min-h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-body font-bold text-white sm:flex sm:w-auto"
            style={{ backgroundColor: WHATSAPP }}
          >
            Tenho interesse
          </button>
        </section>
      </main>

      {/* Barra fixa no celular, com o código do imóvel já na conversa. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg p-3 sm:hidden">
        <button
          type="button"
          onClick={() => setShowInterestModal(true)}
          className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl text-body-lg font-bold text-white shadow-sm"
          style={{ backgroundColor: WHATSAPP }}
        >
          Tenho interesse neste imóvel
        </button>
      </div>

      {showInterestModal && (
        <InterestModal
          slug={slug}
          propertyCode={property.code}
          propertyTitle={property.title}
          brokerWhatsapp={broker.whatsapp || undefined}
          onClose={() => setShowInterestModal(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estados de borda
// ---------------------------------------------------------------------------

function Esqueleto() {
  return (
    <div className="min-h-dvh bg-bg px-5 pt-16 sm:px-8" aria-busy="true">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <div className="aspect-[16/10] animate-pulse rounded-2xl bg-surface-sunken" />
        <div className="h-8 w-64 animate-pulse rounded-md bg-surface-sunken" />
        <div className="h-4 w-80 animate-pulse rounded-sm bg-surface-sunken" />
      </div>
    </div>
  );
}

/** Vendido, retirado ou endereço errado: aviso educado e o caminho de volta. */
function Indisponivel({ slug }: { slug: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center font-sans">
      <span className="text-h3 font-extrabold tracking-tight text-text-muted">
        nex<span className="text-accent">lar</span>
      </span>
      <h1 className="mt-6 text-h1 text-text">Este imóvel não está mais disponível</h1>
      <p className="mt-2 max-w-sm text-body text-text-muted">
        Ele pode ter sido vendido, alugado ou retirado da página. O corretor pode ter outras opções
        parecidas.
      </p>
      <Link
        to={`/corretor/${slug}`}
        className="mt-6 flex min-h-12 items-center justify-center rounded-md bg-accent px-6 text-body font-bold text-accent-on transition-colors duration-fast hover:bg-accent-hover"
      >
        Ver os imóveis do corretor
      </Link>
    </div>
  );
}
