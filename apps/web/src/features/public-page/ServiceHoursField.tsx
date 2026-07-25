import { useState } from "react";

/**
 * Horário de atendimento. Digitar uma frase inteira no celular é o tipo de
 * atrito que faz o campo ficar vazio, então os horários comuns viram um toque
 * e o texto livre continua disponível para quem tem uma rotina própria.
 */

const SUGESTOES = [
  "Seg a sex, 9h às 18h",
  "Seg a sáb, 9h às 19h",
  "Todos os dias, 9h às 20h",
  "Sob agendamento",
];

export function ServiceHoursField({
  value,
  onChange,
}: {
  value: string;
  onChange: (proximo: string) => void;
}) {
  // Valor que veio do servidor e não é uma das sugestões já abre no modo
  // livre: o corretor não deve ter que redescobrir onde estava o texto dele.
  const [livre, setLivre] = useState(() => value !== "" && !SUGESTOES.includes(value));

  const escolher = (sugestao: string) => {
    setLivre(false);
    // Tocar de novo na sugestão ativa limpa o campo, que é o jeito de
    // desfazer sem precisar de um botão "limpar" só para isso.
    onChange(value === sugestao ? "" : sugestao);
  };

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={livre ? "pp-horario" : undefined}
        className="flex items-baseline justify-between gap-2 text-label text-text"
      >
        <span>Horário de atendimento</span>
        <span className="font-normal text-caption text-text-subtle">opcional</span>
      </label>

      <div className="flex flex-wrap gap-2">
        {SUGESTOES.map((s) => {
          const ativo = !livre && value === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={ativo}
              onClick={() => escolher(s)}
              className={`min-h-[38px] rounded-full border px-3.5 text-body-sm font-semibold transition-colors ${
                ativo
                  ? "border-accent bg-accent text-accent-on"
                  : "border-border text-text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {s}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={livre}
          onClick={() => {
            setLivre(true);
            // Sair de uma sugestão para o modo livre começa em branco: o
            // corretor está justamente dizendo que o horário dele é outro.
            if (SUGESTOES.includes(value)) onChange("");
          }}
          className={`min-h-[38px] rounded-full border px-3.5 text-body-sm font-semibold transition-colors ${
            livre
              ? "border-accent bg-accent text-accent-on"
              : "border-border text-text-muted hover:border-accent hover:text-accent"
          }`}
        >
          Outro
        </button>
      </div>

      {livre && (
        <input
          id="pp-horario"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={120}
          placeholder="Ex.: Seg a qui, 8h às 17h; sex até 15h"
          className="min-h-[var(--tap-target-min)] w-full rounded-md border border-border bg-surface px-3.5 text-body text-text placeholder:text-text-subtle transition-colors duration-fast focus-visible:border-[var(--border-focus)] focus-visible:shadow-focus focus-visible:outline-none"
        />
      )}
    </div>
  );
}
