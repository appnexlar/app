/**
 * O endereço público do site, lido do próprio navegador.
 *
 * Existe porque domínio escrito na mão envelhece: quando a marca mudou de
 * Nexlar para Nextlar, dois textos continuaram mostrando o endereço antigo
 * para o corretor copiar. O host de onde a página foi servida é sempre a
 * verdade, em produção e no ambiente local, e nunca precisa ser editado de
 * novo.
 */
export const siteHost = (): string => window.location.host;

/** O endereço da vitrine do corretor, do jeito que se mostra na tela (sem https). */
export const enderecoDaVitrine = (slug: string): string => `${siteHost()}/corretor/${slug}`;
