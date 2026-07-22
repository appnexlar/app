import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  /** Texto de apoio abaixo do campo, exibido quando não há erro. */
  hint?: string;
  /** Rótulo opcional à direita do label (ex.: "opcional"). */
  optionalLabel?: string;
  /** Elemento à direita dentro do campo (ex.: botão mostrar/ocultar senha). */
  trailing?: ReactNode;
  /** Prefixo fixo dentro do campo (ex.: "R$"). */
  leading?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, hint, optionalLabel, trailing, leading, id, className = "", ...rest }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const invalid = Boolean(error);

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="flex items-baseline justify-between gap-2 text-label text-text">
          <span>{label}</span>
          {optionalLabel && (
            <span className="font-normal text-caption text-text-subtle">{optionalLabel}</span>
          )}
        </label>

        <div className="relative">
          {leading && (
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-body text-text-subtle">
              {leading}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            className={
              "w-full min-h-[var(--tap-target-min)] rounded-md border bg-surface px-3.5 " +
              "text-body text-text placeholder:text-text-subtle transition-colors duration-fast " +
              "focus-visible:shadow-focus focus-visible:border-[var(--border-focus)] " +
              (leading ? "pl-10 " : "") +
              (trailing ? "pr-11 " : "") +
              (invalid ? "border-danger " : "border-border ") +
              className
            }
            {...rest}
          />
          {trailing && (
            <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>
          )}
        </div>

        {invalid ? (
          <p id={errorId} className="text-caption text-[var(--danger-fg)]">
            {error}
          </p>
        ) : (
          hint && <p className="text-caption text-text-subtle">{hint}</p>
        )}
      </div>
    );
  },
);

TextField.displayName = "TextField";
