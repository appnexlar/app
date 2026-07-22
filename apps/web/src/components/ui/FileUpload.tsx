import { useEffect, useId, useRef, useState } from "react";

interface FileUploadProps {
  label: string;
  hint?: string;
  error?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  /** Tipos MIME aceitos. */
  accept?: string;
  /** Tamanho máximo em MB. */
  maxSizeMB?: number;
  onValidationError?: (message: string) => void;
}

const DEFAULT_ACCEPT = "application/pdf,image/jpeg,image/png";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUpload({
  label,
  hint,
  error,
  file,
  onChange,
  accept = DEFAULT_ACCEPT,
  maxSizeMB = 10,
  onValidationError,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Miniatura para imagens; revogada ao trocar/desmontar.
  useEffect(() => {
    if (file && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [file]);

  const accepted = accept.split(",").map((t) => t.trim());

  function validateAndSet(candidate: File | undefined) {
    if (!candidate) return;
    if (accepted.length && !accepted.includes(candidate.type)) {
      onValidationError?.("Formato não aceito. Envie PDF, JPG ou PNG.");
      return;
    }
    if (candidate.size > maxSizeMB * 1024 * 1024) {
      onValidationError?.(`Arquivo muito grande. Máximo de ${maxSizeMB} MB.`);
      return;
    }
    onChange(candidate);
  }

  const invalid = Boolean(error);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-label text-text">{label}</span>

      {file ? (
        <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-3 shadow-xs">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              className="h-12 w-12 flex-none rounded-md object-cover"
            />
          ) : (
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-md bg-primary-soft text-primary">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-semibold text-text">{file.name}</p>
            <p className="text-caption text-text-muted">{formatSize(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remover documento"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-sunken hover:text-danger"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            validateAndSet(e.dataTransfer.files?.[0]);
          }}
          className={
            "flex flex-col items-center gap-2 rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors focus-visible:shadow-focus " +
            (dragging
              ? "border-accent bg-accent-soft"
              : invalid
                ? "border-danger bg-surface"
                : "border-border-strong bg-surface hover:border-accent hover:bg-accent-soft")
          }
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 16V4m0 0L8 8m4-4l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-body-sm font-semibold text-text">Enviar documento</span>
          <span className="text-caption text-text-subtle">
            Toque para escolher · PDF, JPG ou PNG até {maxSizeMB} MB
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => validateAndSet(e.target.files?.[0])}
      />

      {invalid ? (
        <p className="text-caption text-[var(--danger-fg)]">{error}</p>
      ) : (
        hint && <p className="text-caption text-text-subtle">{hint}</p>
      )}
    </div>
  );
}
