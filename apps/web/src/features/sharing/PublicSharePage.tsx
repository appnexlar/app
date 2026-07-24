import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchPublicShare, whatsappDigits } from "./api";

/**
 * Página pública do imóvel compartilhado, sem login. Mostra só os dados
 * autorizados e registra a visualização (o backend faz isso no GET).
 */
export function PublicSharePage() {
  const { token } = useParams<{ token: string }>();
  const [active, setActive] = useState(0);

  const query = useQuery({
    queryKey: ["public-share", token],
    queryFn: () => fetchPublicShare(token as string),
    enabled: Boolean(token),
    retry: false,
  });

  if (query.isPending) {
    return (
      <Shell>
        <div className="mx-auto max-w-2xl animate-pulse">
          <div className="aspect-[16/10] w-full rounded-2xl bg-black/10" />
          <div className="mt-4 h-6 w-2/3 rounded bg-black/10" />
          <div className="mt-2 h-4 w-1/3 rounded bg-black/10" />
        </div>
      </Shell>
    );
  }

  if (query.isError || !query.data || (!query.data.available && !query.data.unavailableReason)) {
    return (
      <Shell>
        <Unavailable text="Este link não está mais disponível. Entre em contato com o corretor para receber uma nova seleção." />
      </Shell>
    );
  }

  const data = query.data;

  if (!data.available) {
    // Imóvel fora de oferta: fala o motivo real e orienta o próximo passo.
    if (
      data.unavailableReason === "vendido" ||
      data.unavailableReason === "alugado" ||
      data.unavailableReason === "indisponivel"
    ) {
      const reasonText =
        data.unavailableReason === "vendido"
          ? "já foi vendido"
          : data.unavailableReason === "alugado"
            ? "já foi alugado"
            : "não está mais disponível";
      const waLink = data.broker?.whatsapp
        ? `https://wa.me/${whatsappDigits(data.broker.whatsapp)}?text=${encodeURIComponent(
            `Olá! Vi que o imóvel "${data.propertyTitle ?? "que você me enviou"}" ${reasonText}. Pode me enviar opções parecidas?`,
          )}`
        : null;
      return (
        <Shell>
          <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-black/10 bg-white px-6 py-10 text-center shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/5 text-black/40">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 11l9-7 9 7M5 9.5V20a1 1 0 001 1h12a1 1 0 001-1V9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            {data.propertyTitle && (
              <p className="mt-4 text-lg font-semibold text-[#1a1a1a]">{data.propertyTitle}</p>
            )}
            <p className="mt-2 text-[15px] leading-relaxed text-black/70">
              Este imóvel {reasonText}. Mas o corretor pode te mostrar opções parecidas com o que
              você procura.
            </p>
            {data.broker && (
              <div className="mt-6 w-full rounded-2xl border border-black/10 bg-[#f9f8f6] p-4 text-left">
                <p className="text-sm text-black/45">Fale com o corretor</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-[#1a1a1a]">{data.broker.name}</p>
                  {data.broker.verified && <SeloVerificado />}
                </div>
                {data.broker.agencyName && (
                  <p className="text-sm text-black/55">{data.broker.agencyName}</p>
                )}
                {waLink && (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 font-semibold text-white transition-transform active:scale-[0.99]"
                  >
                    Pedir opções parecidas
                  </a>
                )}
              </div>
            )}
          </div>
        </Shell>
      );
    }
    return (
      <Shell>
        <Unavailable
          text={
            data.unavailableReason === "expirado"
              ? "Este link expirou. Entre em contato com o corretor para receber uma nova seleção."
              : "Este link não está mais disponível. Entre em contato com o corretor para receber uma nova seleção."
          }
        />
      </Shell>
    );
  }

  const p = data.property!;
  const broker = data.broker!;
  const photos = p.photos;
  const waLink = broker.whatsapp
    ? `https://wa.me/${whatsappDigits(broker.whatsapp)}?text=${encodeURIComponent(`Olá! Vi o imóvel "${p.title}" e gostaria de mais informações.`)}`
    : null;

  return (
    <Shell>
      <article className="mx-auto max-w-2xl">
        {photos.length > 0 ? (
          <div className="flex flex-col gap-2">
            <img
              src={photos[active]?.url}
              alt={photos[active]?.caption ?? p.title}
              className="aspect-[16/10] w-full rounded-2xl border border-black/5 object-cover"
            />
            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((photo, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActive(i)}
                    className={`h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${i === active ? "border-[#2f6b4f]" : "border-transparent"}`}
                  >
                    <img src={photo.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex aspect-[16/10] w-full items-center justify-center rounded-2xl bg-black/5 text-black/30">
            <svg className="h-12 w-12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 11l9-7 9 7M5 9.5V20a1 1 0 001 1h12a1 1 0 001-1V9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        <header className="mt-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#2f6b4f]">{p.type}</p>
          <h1 className="mt-1 text-2xl font-bold text-[#1a1a1a]">{p.title}</h1>
          {p.locationLine && <p className="mt-1 text-[15px] text-black/55">{p.locationLine}</p>}
          <p className="mt-3 text-2xl font-bold text-[#1a1a1a]">{p.priceLabel}</p>
        </header>

        {p.features.length > 0 && (
          <section className="mt-5">
            <h2 className="text-sm font-semibold text-black/45">Características</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {p.features.map((f) => (
                <li key={f} className="rounded-full bg-black/[0.04] px-3 py-1 text-sm text-black/70">
                  {f}
                </li>
              ))}
            </ul>
          </section>
        )}

        {p.description && (
          <section className="mt-5">
            <h2 className="text-sm font-semibold text-black/45">Descrição</h2>
            <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-black/75">{p.description}</p>
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-sm text-black/45">Fale com o corretor</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-[#1a1a1a]">{broker.name}</p>
            {broker.verified && <SeloVerificado />}
          </div>
          {broker.agencyName && <p className="text-sm text-black/55">{broker.agencyName}</p>}
          {broker.verified && broker.creci && (
            <p className="mt-0.5 text-sm text-black/55">
              CRECI {broker.creci}
              {broker.creciUf ? `/${broker.creciUf}` : ""}
            </p>
          )}
          {waLink ? (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 font-semibold text-white transition-transform active:scale-[0.99]"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.611-.916-2.206-.242-.58-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.05 21.785h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885" />
              </svg>
              Falar no WhatsApp
            </a>
          ) : (
            <p className="mt-3 text-sm text-black/45">Entre em contato pelo canal onde recebeu este link.</p>
          )}
        </section>

        <p className="mt-6 text-center text-xs text-black/35">Imóvel compartilhado via Nexlar</p>
      </article>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh bg-[#f6f5f2] px-4 py-6 text-[#1a1a1a]">{children}</main>;
}

function Unavailable({ text }: { text: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-black/10 bg-white px-6 py-12 text-center shadow-sm">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/5 text-black/40">
        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      <p className="mt-4 text-[15px] leading-relaxed text-black/70">{text}</p>
    </div>
  );
}

/**
 * Selo de corretor verificado. Esta página é o único lugar em que a lead
 * encontra o corretor, muitas vezes sem conhecê-lo: o selo é o sinal de que
 * o CRECI foi conferido por gente, não apenas digitado por ele mesmo.
 *
 * Cores fixas em vez dos tokens do app de propósito: a página pública é
 * servida sozinha e não herda o tema do sistema.
 */
function SeloVerificado() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-[#e8f5ec] px-2 py-0.5 text-xs font-bold text-[#1c7c3f]"
      title="CRECI conferido pela equipe do Nexlar"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M20 6L9 17l-5-5"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Corretor verificado
    </span>
  );
}
