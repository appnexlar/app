import type { ReactNode } from "react";

type Variant = "danger" | "info" | "success";

const styles: Record<Variant, string> = {
  danger: "border-danger bg-danger-soft text-[var(--danger-fg)]",
  info: "border-info bg-info-soft text-[var(--info-fg)]",
  success: "border-success bg-success-soft text-[var(--success-fg)]",
};

const icons: Record<Variant, ReactNode> = {
  danger: (
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1" fill="currentColor" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 11v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </>
  ),
  success: (
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8.5 12.3l2.4 2.4 4.6-4.9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
};

export function Banner({ variant, children }: { variant: Variant; children: ReactNode }) {
  return (
    <div
      role={variant === "danger" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-md border px-3.5 py-3 text-body-sm ${styles[variant]}`}
    >
      <svg className="mt-0.5 h-[18px] w-[18px] flex-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {icons[variant]}
      </svg>
      <span>{children}</span>
    </div>
  );
}
