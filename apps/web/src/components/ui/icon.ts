/**
 * Tamanhos de ícone do sistema.
 *
 * Os ícones vêm do lucide-react (traço 2, grade 24). O que quebrou antes não
 * foi o desenho, foi a falta de regra: cada tela escolhia o tamanho no olho e
 * a mesma barra acabava com ícones de 18, 22 e 24. Aqui existe um lugar só
 * para decidir isso, e a escolha passa a ser por PAPEL, não por número solto.
 *
 * Se um caso novo não couber em nenhum papel, o certo é discutir o papel, não
 * escrever um número avulso no meio do JSX.
 */
export const ICON = {
  /** Barra superior, menu lateral, ações soltas de 40px. */
  bar: 22,
  /** Dentro de botão com rótulo, onde o ícone acompanha o texto. */
  action: 18,
  /** Linha de lista, metadados, chips: apoia a informação, não compete. */
  row: 16,
  /** Setas e sinais de apoio (chevron de navegação, separadores). */
  hint: 14,
  /**
   * Marca (WhatsApp e afins), ao lado de um ícone `action`.
   *
   * Maior de propósito. Marca é desenho cheio e quase sempre circular, e forma
   * circular cheia lê MENOR que uma de contorno com a mesma medida: ao lado de
   * um ícone de 18 o mesmo 18 parece encolhido. A compensação de ~15% iguala o
   * que o olho vê, não o que a régua diz.
   */
  brand: 21,
} as const;
