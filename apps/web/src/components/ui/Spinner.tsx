// Tamanho padrão seguro: sem isso, um <Spinner /> sem classe cai no tamanho
// default gigante do SVG e herda a cor do texto (escura). Quem passa className
// (ex.: Button, campos) sobrescreve tamanho e cor normalmente.
export function Spinner({ className = "h-5 w-5 text-accent" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
