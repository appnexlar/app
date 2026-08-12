/**
 * Validação de CPF e CNPJ pelos dígitos verificadores.
 *
 * Conferir só o tamanho não serve para nada: `11111111111` tem onze dígitos e
 * é obviamente inventado. Como o Nextlar guarda CPF de cliente para
 * financiamento e documentação, um número errado aqui vira retrabalho no
 * cartório ou no banco, e o corretor só descobre lá na frente.
 *
 * Isto não prova que o CPF existe nem que é daquela pessoa: prova que o número
 * é bem formado. Consulta na Receita é outra história, e está fora do MVP.
 */

/** Repetição do mesmo dígito (000..., 111...) passa na conta e não é documento. */
function todosIguais(digitos: string): boolean {
  return /^(\d)\1+$/.test(digitos);
}

export function onlyDigits(valor: string): string {
  return valor.replace(/\D/g, "");
}

export function isValidCpf(entrada: string): boolean {
  const cpf = onlyDigits(entrada);
  if (cpf.length !== 11 || todosIguais(cpf)) return false;

  // Cada dígito verificador é o resto da soma ponderada dos anteriores.
  for (const [tamanho, posicao] of [
    [9, 9],
    [10, 10],
  ] as const) {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) {
      soma += Number(cpf[i]) * (tamanho + 1 - i);
    }
    const resto = (soma * 10) % 11;
    const esperado = resto === 10 ? 0 : resto;
    if (esperado !== Number(cpf[posicao])) return false;
  }

  return true;
}

export function isValidCnpj(entrada: string): boolean {
  const cnpj = onlyDigits(entrada);
  if (cnpj.length !== 14 || todosIguais(cnpj)) return false;

  // Os pesos do CNPJ andam de 2 a 9 e reiniciam, diferente do CPF.
  const calcular = (tamanho: number): number => {
    let soma = 0;
    let peso = tamanho - 7;
    for (let i = 0; i < tamanho; i += 1) {
      soma += Number(cnpj[i]) * peso;
      peso -= 1;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return calcular(12) === Number(cnpj[12]) && calcular(13) === Number(cnpj[13]);
}

/** Máscara para exibição: 000.000.000-00. Devolve como veio se não der. */
export function formatCpf(valor: string): string {
  const cpf = onlyDigits(valor);
  if (cpf.length !== 11) return valor;
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

/** Máscara para exibição: 00.000.000/0000-00. */
export function formatCnpj(valor: string): string {
  const cnpj = onlyDigits(valor);
  if (cnpj.length !== 14) return valor;
  return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}
