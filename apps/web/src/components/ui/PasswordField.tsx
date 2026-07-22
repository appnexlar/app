import { forwardRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { TextField } from "./TextField";

interface PasswordFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ label, error, hint, ...rest }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <TextField
        ref={ref}
        label={label}
        error={error}
        hint={hint}
        type={visible ? "text" : "password"}
        trailing={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-subtle transition-colors hover:text-text focus-visible:shadow-focus"
          >
            {visible ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <path d="M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A9.6 9.6 0 0112 5c5 0 9 4 9 7a10.9 10.9 0 01-2.2 3M6.3 6.3A11.2 11.2 0 003 12c0 3 4 7 9 7a9.8 9.8 0 003.7-.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            )}
          </button>
        }
        {...rest}
      />
    );
  },
);

PasswordField.displayName = "PasswordField";
