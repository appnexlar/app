import { useEffect, useState } from "react";

/**
 * Atrasa a propagação de um valor. Serve para busca ao vivo em lista que filtra
 * no servidor: o campo responde na hora, mas a chamada só sai quando a pessoa
 * para de digitar, em vez de uma requisição por tecla.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
