import { useEffect, useState } from "react";
import { fetchMediaBlob } from "./api";

/**
 * Imagem da área privada: busca com o token e exibe via object URL, já que
 * <img> puro não envia Authorization. Mostra um placeholder enquanto carrega.
 */
export function AuthImage({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setObjectUrl(null);
    setFailed(false);
    fetchMediaBlob(src)
      .then((url) => {
        if (active) setObjectUrl(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [src]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-surface-sunken text-text-subtle ${className}`}>
        <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3 15l4.5-4.5L12 15l3-3 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="9" cy="9.5" r="1.4" fill="currentColor" />
        </svg>
      </div>
    );
  }

  if (!objectUrl) {
    return <div className={`animate-pulse bg-surface-sunken ${className}`} aria-hidden="true" />;
  }

  return <img src={objectUrl} alt={alt} className={className} />;
}
