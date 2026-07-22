import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";

interface Option {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  options: Option[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, placeholder, options, id, className = "", value, ...rest }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const errorId = `${selectId}-error`;
    const invalid = Boolean(error);

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="text-label text-text">
          {label}
        </label>

        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            value={value}
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            className={
              "w-full min-h-[var(--tap-target-min)] appearance-none rounded-md border bg-surface px-3.5 pr-10 " +
              "text-body text-text transition-colors duration-fast focus-visible:shadow-focus " +
              "focus-visible:border-[var(--border-focus)] " +
              (value ? "" : "text-text-subtle ") +
              (invalid ? "border-danger " : "border-border ") +
              className
            }
            {...rest}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} className="text-text">
                {opt.label}
              </option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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

Select.displayName = "Select";
