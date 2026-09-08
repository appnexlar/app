import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * URLs das telas internas. O que aparece na barra de endereço é o código curto
 * (/clientes/1042/selecoes/7), nunca o uuid: é mais limpo, dá para o corretor
 * citar por telefone e não expõe identificador interno.
 *
 * A API aceita as duas formas, então qualquer link antigo com uuid continua
 * abrindo. Quem chega por um deles cai na versão com código pelo hook abaixo.
 */
export type RouteRef = string | number;

// Entidade única (set 2026): tudo vive em /clientes. `leadPath` continua
// existindo como sinônimo para o código antigo não quebrar; /leads/* no
// navegador redireciona para cá (ver LeadsRedirect no App).
export const clientPath = (cliente: RouteRef) => `/clientes/${cliente}`;
export const leadPath = clientPath;
export const leadSharesPath = (cliente: RouteRef) => `/clientes/${cliente}/imoveis-enviados`;
export const selectionPath = (cliente: RouteRef, selection: RouteRef) =>
  `/clientes/${cliente}/selecoes/${selection}`;
export const selectionPreviewPath = (lead: RouteRef, selection: RouteRef) =>
  `${selectionPath(lead, selection)}/previa`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string | undefined): boolean => !!value && UUID.test(value);

/**
 * Troca a URL pela versão com código curto quando a tela foi aberta por um
 * link com uuid. É replace: não suja o histórico e o botão voltar continua
 * levando para onde a pessoa estava.
 *
 * `precisaTrocar` evita a troca enquanto os dados ainda não chegaram.
 */
export function useCanonicalPath(precisaTrocar: boolean, destino: string): void {
  const navigate = useNavigate();
  useEffect(() => {
    if (precisaTrocar) navigate(destino, { replace: true });
  }, [precisaTrocar, destino, navigate]);
}
