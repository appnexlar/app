import { Check, Circle } from "lucide-react";
import { requisitosDaSenha } from "@nexlar/shared";

/**
 * O que ainda falta na senha, enquanto a pessoa digita.
 *
 * Não muda a segurança: a regra é a mesma do servidor. Muda a experiência,
 * que antes era digitar, clicar e só então descobrir o que estava errado.
 * Cada item vira verde conforme é atendido.
 */
export function PasswordRequirements({
  senha,
  evitar = [],
}: {
  senha: string;
  /** Pedaços que a senha não pode conter (nome, começo do e-mail). */
  evitar?: string[];
}) {
  const itens = requisitosDaSenha(senha, evitar);
  const atendidos = itens.filter((i) => i.ok).length;

  return (
    <ul
      aria-label={`Requisitos da senha: ${atendidos} de ${itens.length} atendidos`}
      className="flex flex-col gap-1 text-caption"
    >
      {itens.map((item) => (
        <li
          key={item.rotulo}
          className={`flex items-center gap-2 ${item.ok ? "text-[var(--success-fg)]" : "text-text-subtle"}`}
        >
          {item.ok ? (
            <Check size={14} aria-hidden="true" className="shrink-0" />
          ) : (
            <Circle size={14} aria-hidden="true" className="shrink-0 opacity-60" />
          )}
          <span>{item.rotulo}</span>
          <span className="sr-only">{item.ok ? "atendido" : "pendente"}</span>
        </li>
      ))}
    </ul>
  );
}
