import { AuthImage } from "../../features/properties/AuthImage";

/**
 * Foto de perfil que sabe de onde a imagem vem: URL interna da API (bucket
 * privado, precisa do token, via AuthImage) ou URL externa (ex.: foto do
 * Google) num <img> comum. Sem foto, cai nas iniciais.
 */
export function AvatarPhoto({
  src,
  name,
  className = "h-16 w-16",
}: {
  src: string | null;
  name: string;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  if (!src) {
    return (
      <span
        className={`flex flex-none items-center justify-center rounded-full bg-primary text-h3 font-bold text-primary-on ${className}`}
      >
        {initials || "?"}
      </span>
    );
  }

  if (src.startsWith("/api/")) {
    return (
      <span className={`block flex-none overflow-hidden rounded-full ${className}`}>
        <AuthImage src={src} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span className={`block flex-none overflow-hidden rounded-full ${className}`}>
      <img src={src} alt="" className="h-full w-full object-cover" />
    </span>
  );
}
