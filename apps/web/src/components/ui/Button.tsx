import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./Spinner";

type Variant = "accent" | "primary" | "ghost" | "success" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold text-[15px] " +
  "min-h-[var(--tap-target-min)] px-[18px] transition-[background-color,transform,box-shadow] duration-fast ease-standard " +
  "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 focus-visible:shadow-focus";

const variants: Record<Variant, string> = {
  accent: "bg-accent text-accent-on hover:bg-accent-hover active:bg-[var(--accent-active)]",
  primary: "bg-primary text-primary-on hover:bg-primary-hover active:bg-[var(--primary-active)]",
  ghost:
    "bg-transparent text-text border border-border-strong hover:bg-surface-sunken",
  success: "bg-[var(--success)] text-white hover:bg-[var(--success-fg)] active:bg-[var(--success-fg)]",
  danger: "bg-[var(--danger)] text-white hover:bg-[var(--danger-fg)] active:bg-[var(--danger-fg)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "accent", loading = false, fullWidth = false, disabled, children, className = "", ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${base} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
        {...rest}
      >
        {loading && <Spinner className="h-[18px] w-[18px]" />}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
