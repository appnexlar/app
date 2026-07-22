/**
 * Consulta de endereço por CEP via ViaCEP (serviço público dos Correios).
 * Retorna null se o CEP não existir ou a consulta falhar (o corretor preenche
 * na mão). Não trafega dado sensível: só o CEP digitado.
 */
export interface CepAddress {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

export async function lookupCep(cep: string): Promise<CepAddress | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (data.erro) return null;
    return {
      street: data.logradouro ?? "",
      neighborhood: data.bairro ?? "",
      city: data.localidade ?? "",
      state: data.uf ?? "",
    };
  } catch {
    return null;
  }
}
