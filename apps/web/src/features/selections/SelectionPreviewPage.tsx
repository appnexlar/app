import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { PublicSelectionPageResponse } from "@nexlar/shared";
import { http } from "../../lib/http";
import { selectionPath } from "../../lib/routes";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { AuthImage } from "../properties/AuthImage";
import { usePageEntityLabel } from "../shell/ShellContext";
import { BrokerFooter, ItemCard } from "./PublicSelectionPage";

/**
 * Prévia autenticada da seleção: a página EXATAMENTE como a lead verá, com os
 * dados reais do rascunho, sem contar acesso e sem ações clicáveis. Não é
 * indexável nem pública: exige login e só o dono enxerga.
 */
export function SelectionPreviewPage() {
  const { id: leadId, selectionId } = useParams<{ id: string; selectionId: string }>();
  const navigate = useNavigate();
  usePageEntityLabel("Prévia da seleção");

  const consulta = useQuery({
    queryKey: ["selection-preview", selectionId],
    queryFn: () => http.get<PublicSelectionPageResponse>(`/selections/${selectionId}/preview`),
  });

  if (consulta.isPending) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4" aria-busy="true">
        <div className="h-40 animate-pulse rounded-2xl bg-surface-sunken" />
        <div className="h-72 animate-pulse rounded-2xl bg-surface-sunken" />
      </div>
    );
  }

  const dados = consulta.data;
  if (consulta.isError || !dados?.selection) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Banner variant="danger">Não foi possível carregar a prévia.</Banner>
        <Button type="button" variant="ghost" className="self-start" onClick={() => navigate(-1)}>
          Voltar
        </Button>
      </div>
    );
  }

  const sel = dados.selection;
  const destaques = sel.items.filter((i) => i.highlight);
  const demais = sel.items.filter((i) => !i.highlight);
  const authImg = (src: string, alt: string) => (
    <AuthImage src={src} alt={alt} className="h-full w-full object-cover" />
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-accent-soft px-4 py-3">
        <p className="text-body-sm font-semibold text-accent">
          Prévia: é assim que {sel.leadFirstName} vai ver. As ações ficam ativas só no link real.
        </p>
        <Button type="button" variant="ghost" className="-my-1 shrink-0" onClick={() => navigate(-1)}>
          Voltar
        </Button>
      </div>

      {/* A página da lead, emoldurada. */}
      <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
        <header className="bg-primary px-5 pb-10 pt-8 text-primary-on">
          <p className="text-caption font-bold uppercase tracking-wide text-white/60">
            Seleção de imóveis
          </p>
          <h1 className="mt-2 text-h1">{sel.leadFirstName ? `Olá, ${sel.leadFirstName}!` : "Olá!"}</h1>
          <p className="mt-2 max-w-xl text-body-lg text-white/85">
            {sel.message ??
              `${sel.broker.name} preparou ${sel.itemCount === 1 ? "uma opção" : `${sel.itemCount} opções`} pensando no que você procura.`}
          </p>
          <p className="mt-4 text-body-sm text-white/60">
            {sel.itemCount === 1 ? "1 imóvel" : `${sel.itemCount} imóveis`}
            {sel.expiresAtLabel && ` · disponível até ${sel.expiresAtLabel}`}
          </p>
        </header>

        <div className="bg-bg px-4 pb-6">
          {destaques.length > 0 && (
            <section className="mt-5">
              <h2 className="text-caption font-extrabold uppercase tracking-wide text-accent">
                Destaques para você
              </h2>
              <div className="mt-3 flex flex-col gap-4">
                {destaques.map((item) => (
                  <ItemCard key={item.itemId} item={item} readOnly renderImage={authImg} />
                ))}
              </div>
            </section>
          )}
          {demais.length > 0 && (
            <section className="mt-5">
              {destaques.length > 0 && (
                <h2 className="text-caption font-extrabold uppercase tracking-wide text-text-subtle">
                  Mais opções
                </h2>
              )}
              <div className="mt-3 flex flex-col gap-4">
                {demais.map((item) => (
                  <ItemCard key={item.itemId} item={item} readOnly renderImage={authImg} />
                ))}
              </div>
            </section>
          )}
          <BrokerFooter broker={sel.broker} />
        </div>
      </div>

      <Button
        type="button"
        className="self-start"
        onClick={() => navigate(selectionPath(leadId ?? "", selectionId ?? ""))}
      >
        Continuar a montagem
      </Button>
    </div>
  );
}
