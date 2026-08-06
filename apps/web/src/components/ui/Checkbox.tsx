import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, id, className = "", ...rest }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const invalid = Boolean(error);

    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="flex cursor-pointer items-start gap-2">
          <span className="relative mt-1 flex-none">
            <input
              ref={ref}
              id={inputId}
              type="checkbox"
              className={"peer h-5 w-5 cursor-pointer appearance-none rounded-[6px] border bg-surface transition-colors focus-visible:shadow-focus checked:border-accent checked:bg-accent " + (invalid ? "border-danger" : "border-border-strong") + " " + className}
              {...rest}
            />
            <svg
              className="pointer-events-none absolute inset-0 m-auto hidden h-3.5 w-3.5 text-accent-on peer-checked:block"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-body-sm text-text">{label}</span>
        </label>
        {invalid && <p className="ml-8 text-caption text-[var(--danger-fg)]">{error}</p>}
      </div>
    );
  },
);

Checkbox.displayName = "Checkbox";
