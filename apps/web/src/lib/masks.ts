/** Máscaras de entrada brasileiras, sem dependências. */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** (11) 90000-0000 ou (11) 4000-0000 */
export function maskPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** 000.000.000-00 */
export function maskCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

/** 00.000.000/0000-00 */
export function maskCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/** 500.000 (agrupamento de milhar pt-BR, sem centavos). */
export function maskMoney(value: string): string {
  const digits = onlyDigits(value).slice(0, 12);
  return digits ? Number(digits).toLocaleString("pt-BR") : "";
}

/** Converte o texto mascarado de volta para número (ou undefined se vazio). */
export function parseMoney(value: string): number | undefined {
  const digits = onlyDigits(value);
  return digits ? Number(digits) : undefined;
}

/** dd/mm/aaaa progressivo. */
export function maskDate(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** 0000 0000 0000 0000 */
export function maskCardNumber(value: string): string {
  const d = onlyDigits(value).slice(0, 19);
  return d.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

/** MM/AA */
export function maskExpiry(value: string): string {
  const d = onlyDigits(value).slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}
