import { useQuery } from "@tanstack/react-query";
import { BrokerStorefront } from "./BrokerStorefront";
import { fetchPreview } from "./publicApi";

/**
 * O conteúdo da prévia, sozinho, para ser carregado dentro de um iframe.
 *
 * Existe por um motivo só: fidelidade. A prévia antes era a vitrine dentro de
 * uma div de 400px, e media query não enxerga div, enxerga janela. No desktop
 * todos os breakpoints `sm:` continuavam ligados, então o "Celular" mostrava o
 * layout de desktop espremido: nome estourando a borda, foto e texto lado a
 * lado, selo quebrado em três linhas. Dentro de um iframe de 390px a janela
 * tem 390px de verdade, e o corretor vê o que o visitante vê.
 */
export function PreviewFramePage() {
  const consulta = useQuery({ queryKey: ["public-page", "preview"], queryFn: fetchPreview });

  if (consulta.isPending) return <div className="min-h-dvh bg-bg" aria-busy="true" />;
  if (consulta.isError || !consulta.data?.page) return null;

  return <BrokerStorefront page={consulta.data.page} interactive={false} />;
}
