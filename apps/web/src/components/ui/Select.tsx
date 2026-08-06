import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { ICON } from "./icon";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  /** Sempre obrigatório: quando `hideLabel`, ele vira o nome acessível. */
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  /** Texto do estado vazio. Sem ele, não existe opção "em branco". */
  placeholder?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  /** Barra de filtros: o rótulo já está dentro do próprio botão. */
  hideLabel?: boolean;
  /** Altura e tipografia menores, para barras de filtro. */
  compact?: boolean;
  /** Destaque de "filtro aplicado". */
  highlighted?: boolean;
  /** Para o menu não vazar quando o botão fica encostado na borda direita. */
  align?: "left" | "right";
  className?: string;
}

/**
 * Seleção de uma opção, com menu próprio em vez de `<select>` nativo.
 *
 * O nativo abre a lista do sistema operacional, com a cor, a tipografia e o
 * espaçamento dele. Numa tela nossa isso aparece como remendo, e na vitrine,
 * que é a cara do corretor, aparece ainda mais. O custo de não usar o nativo
 * é ter que reimplementar o que ele dá de graça, e é isso que está aqui:
 * teclado completo, `combobox` + `listbox` com estado anunciado, foco que
 * nunca se perde, fechar no Esc e no clique fora.
 *
 * O foco fica sempre no botão e a opção ativa é apontada por
 * `aria-activedescendant`. Mover o foco para dentro da lista parece natural,
 * mas deixa as teclas disputadas entre os dois elementos enquanto o foco
 * viaja, a ponto de um Enter logo após abrir não escolher nada.
 */
export function Select({
  label,
  value,
  onValueChange,
  options,
  placeholder,
  error,
  hint,
  disabled = false,
  hideLabel = false,
  compact = false,
  highlighted = false,
  align = "left",
  className = "",
}: SelectProps) {
  const itens = placeholder ? [{ value: "", label: placeholder }, ...options] : options;

  const [aberto, setAberto] = useState(false);
  const [emFoco, setEmFoco] = useState(0);
  const [posicao, setPosicao] = useState({ top: 0, left: 0, width: 0, paraCima: false });
  const caixa = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const idBase = useId();
  const idDoRotulo = `${idBase}-rotulo`;
  const idDaLista = `${idBase}-lista`;
  const idDoErro = `${idBase}-erro`;
  const idDaOpcao = (i: number) => `${idBase}-opcao-${i}`;

  const invalido = Boolean(error);
  const indiceAtual = Math.max(
    itens.findIndex((o) => o.value === value),
    0,
  );
  const escolhido = itens[indiceAtual];
  const vazio = !value && Boolean(placeholder);

  const abrir = () => {
    if (disabled) return;
    setEmFoco(indiceAtual);
    setAberto(true);
  };

  const escolher = (i: number) => {
    onValueChange(itens[i].value);
    setAberto(false);
  };

  const ALTURA_MAXIMA = 256;

  /**
   * A lista vive num portal, com posição calculada a partir do botão. Dentro
   * de um modal com rolagem, uma lista `absolute` some cortada pelo overflow
   * do modal: foi exatamente o que aconteceu com o último campo do formulário
   * de tarefa, que abria e não mostrava nada. No portal nenhum contêiner corta,
   * e ainda dá para virar o menu para cima quando falta espaço embaixo.
   */
  useLayoutEffect(() => {
    if (!aberto) return;
    const medir = () => {
      const r = gatilho.current?.getBoundingClientRect();
      if (!r) return;
      const espacoAbaixo = window.innerHeight - r.bottom;
      const paraCima = espacoAbaixo < Math.min(ALTURA_MAXIMA, 200) && r.top > espacoAbaixo;
      setPosicao({
        top: paraCima ? r.top - 4 : r.bottom + 4,
        left: align === "right" ? r.right : r.left,
        width: r.width,
        paraCima,
      });
    };
    medir();
    // Rolar ou redimensionar tira o menu do lugar; fechar é mais honesto do
    // que deixá-lo flutuando ao lado do botão que o abriu.
    const fecha = () => setAberto(false);
    window.addEventListener("scroll", fecha, true);
    window.addEventListener("resize", fecha);
    return () => {
      window.removeEventListener("scroll", fecha, true);
      window.removeEventListener("resize", fecha);
    };
  }, [aberto, align]);

  useEffect(() => {
    if (!aberto) return;
    const foraDaCaixa = (e: MouseEvent) => {
      const alvo = e.target as Node;
      const naLista = document.getElementById(idDaLista)?.contains(alvo);
      if (caixa.current && !caixa.current.contains(alvo) && !naLista) setAberto(false);
    };
    document.addEventListener("mousedown", foraDaCaixa);
    return () => document.removeEventListener("mousedown", foraDaCaixa);
  }, [aberto, idDaLista]);

  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      setAberto(false);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (aberto) escolher(emFoco);
      else abrir();
      return;
    }
    const passo = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (passo !== 0) {
      e.preventDefault();
      if (!aberto) {
        abrir();
        return;
      }
      setEmFoco((i) => (i + passo + itens.length) % itens.length);
      return;
    }
    if (!aberto) return;
    if (e.key === "Home") {
      e.preventDefault();
      setEmFoco(0);
    }
    if (e.key === "End") {
      e.preventDefault();
      setEmFoco(itens.length - 1);
    }
  };

  const corDoBotao = highlighted
    ? "border-accent bg-accent-soft text-accent"
    : invalido
      ? "border-danger bg-surface text-text"
      : `border-border bg-surface ${vazio ? "text-text-subtle" : "text-text"} hover:border-border-strong`;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {!hideLabel && (
        <span id={idDoRotulo} className="text-label text-text">
          {label}
        </span>
      )}

      {/* z-10 com o menu aberto: seções vizinhas costumam criar contexto de
          empilhamento (animações de entrada, por exemplo) e cobririam a lista. */}
      <div ref={caixa} className={`relative ${aberto ? "z-10" : ""}`}>
        <button
          ref={gatilho}
          type="button"
          role="combobox"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={aberto}
          aria-controls={idDaLista}
          aria-activedescendant={aberto ? idDaOpcao(emFoco) : undefined}
          aria-labelledby={hideLabel ? undefined : idDoRotulo}
          aria-label={hideLabel ? label : undefined}
          aria-invalid={invalido}
          aria-describedby={invalido ? idDoErro : undefined}
          onClick={() => (aberto ? setAberto(false) : abrir())}
          onKeyDown={teclado}
          className={`flex w-full items-center gap-2 rounded-md border transition-colors duration-fast focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
            compact
              ? "min-h-11 pl-4 pr-2 text-body-sm font-semibold"
              : "min-h-[var(--tap-target-min)] pl-4 pr-4 text-body"
          } ${corDoBotao}`}
        >
          <span className="min-w-0 flex-1 truncate text-left">{escolhido?.label ?? label}</span>
          <ChevronDown
            size={compact ? ICON.hint : ICON.row}
            aria-hidden="true"
            className={`flex-none transition-transform duration-fast ${aberto ? "rotate-180" : ""} ${
              highlighted ? "text-accent" : "text-text-subtle"
            }`}
          />
        </button>

        {aberto &&
          createPortal(
            <ul
              id={idDaLista}
              role="listbox"
              aria-label={label}
              style={{
                position: "fixed",
                top: posicao.paraCima ? undefined : posicao.top,
                bottom: posicao.paraCima ? window.innerHeight - posicao.top : undefined,
                left: align === "right" ? undefined : posicao.left,
                right: align === "right" ? window.innerWidth - posicao.left : undefined,
                minWidth: posicao.width,
                maxHeight: ALTURA_MAXIMA,
                zIndex: "var(--z-popover)",
              }}
              // O menu absorve o mousedown para ninguém lá fora tratá-lo como
              // "clique fora". Sem isto, escolher o ano dentro do DatePicker
              // fechava o calendário junto, porque a lista vive num portal e,
              // para o calendário, o clique acontecia fora dele.
              onMouseDown={(e) => e.stopPropagation()}
              className="overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg"
            >
            {itens.map((o, i) => {
              const atual = o.value === value;
              return (
                <li
                  key={o.value || "vazio"}
                  id={idDaOpcao(i)}
                  role="option"
                  aria-selected={atual}
                  onClick={() => escolher(i)}
                  onMouseEnter={() => setEmFoco(i)}
                  className={`flex cursor-pointer items-center gap-2 whitespace-nowrap px-4 py-2 text-body-sm transition-colors ${
                    i === emFoco ? "bg-surface-sunken" : ""
                  } ${atual ? "font-semibold text-accent" : "text-text"}`}
                >
                  <Check
                    size={ICON.hint}
                    aria-hidden="true"
                    className={`flex-none ${atual ? "opacity-100" : "opacity-0"}`}
                  />
                  {o.label}
                </li>
              );
            })}
            </ul>,
            document.body,
          )}
      </div>

      {invalido ? (
        <p id={idDoErro} className="text-caption text-[var(--danger-fg)]">
          {error}
        </p>
      ) : (
        hint && <p className="text-caption text-text-subtle">{hint}</p>
      )}
    </div>
  );
}
