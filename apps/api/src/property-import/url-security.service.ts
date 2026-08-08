import { Injectable } from "@nestjs/common";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ImportFailedError } from "./import-errors";

export interface ResolvedAddress {
  address: string;
  family: number;
}

/** URL aprovada + endereços resolvidos. A conexão usa EXATAMENTE estes IPs. */
export interface SafeUrl {
  url: URL;
  addresses: ResolvedAddress[];
}

const BLOQUEADA =
  "Este link não pode ser importado. Cole o endereço público do anúncio, como ele aparece no navegador.";

/**
 * Porteiro anti-SSRF da importação por URL.
 *
 * A URL vem do usuário e o servidor vai conectar nela, então o alvo nunca
 * pode ser a própria rede: só http/https nas portas padrão, e o DNS é
 * resolvido AQUI, antes de conectar. Todo endereço resolvido precisa ser
 * público; a conexão depois usa exatamente esses IPs (ver PageFetchService),
 * o que fecha a janela de rebinding entre validar e conectar. Redirect conta
 * como URL nova e passa por esta porta de novo.
 */
@Injectable()
export class UrlSecurityService {
  /** Resolutor injetável: os testes trocam por um DNS falso, sem rede. */
  resolve: (hostname: string) => Promise<ResolvedAddress[]> = async (hostname) =>
    dnsLookup(hostname, { all: true, verbatim: true });

  async validate(raw: string): Promise<SafeUrl> {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ImportFailedError(
        "url_invalida",
        "Isso não parece um link válido. Confira o endereço e cole de novo.",
      );
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new ImportFailedError(
        "url_invalida",
        "Só conseguimos importar links que começam com http ou https.",
      );
    }
    // Credencial embutida (http://user:senha@host) é truque, não anúncio.
    if (url.username || url.password) {
      throw new ImportFailedError("url_bloqueada", BLOQUEADA);
    }
    // Porta fora do padrão é onde moram serviços internos expostos por engano.
    if (url.port && url.port !== "80" && url.port !== "443") {
      throw new ImportFailedError("url_bloqueada", BLOQUEADA);
    }

    // URL.hostname mantém colchetes no IPv6 literal.
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const literalFamily = isIP(host);

    const addresses: ResolvedAddress[] = literalFamily
      ? [{ address: host, family: literalFamily }]
      : await this.resolveOrFail(host);

    for (const { address } of addresses) {
      if (isPrivateAddress(address)) {
        throw new ImportFailedError("url_bloqueada", BLOQUEADA);
      }
    }

    return { url, addresses };
  }

  private async resolveOrFail(hostname: string): Promise<ResolvedAddress[]> {
    let addresses: ResolvedAddress[];
    try {
      addresses = await this.resolve(hostname);
    } catch {
      throw new ImportFailedError(
        "inacessivel",
        "Não encontramos este site. Confira o endereço e tente de novo.",
      );
    }
    if (addresses.length === 0) {
      throw new ImportFailedError(
        "inacessivel",
        "Não encontramos este site. Confira o endereço e tente de novo.",
      );
    }
    return addresses;
  }
}

/**
 * Endereço que nunca pode ser alvo de uma importação: loopback, redes
 * privadas, link-local (inclui o metadata endpoint de nuvem 169.254.169.254),
 * CGNAT, faixas de teste/documentação, multicast e reservados.
 */
export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateV4(ip);
  if (family === 6) return isPrivateV6(ip);
  // Não é IP reconhecível: trate como perigoso.
  return true;
}

function isPrivateV4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true; // "esta rede", privada, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // link-local + metadata de nuvem
  if (a === 172 && b >= 16 && b <= 31) return true; // privada 172.16/12
  if (a === 192 && b === 0) return true; // 192.0.0/24 e 192.0.2/24 (teste)
  if (a === 192 && b === 168) return true; // privada
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark 198.18/15
  if (a === 198 && b === 51) return true; // documentação 198.51.100/24
  if (a === 203 && b === 0) return true; // documentação 203.0.113/24
  if (a >= 224) return true; // multicast e reservados
  return false;
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // Mapeado para IPv4 (::ffff:10.0.0.1): vale a regra do IPv4 embutido.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPrivateV4(mapped[1]);
  if (lower === "::" || lower === "::1") return true; // não especificado, loopback
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
  if (/^fe[89ab]/.test(lower)) return true; // link-local fe80::/10
  if (lower.startsWith("ff")) return true; // multicast
  if (lower.startsWith("2001:db8")) return true; // documentação
  if (lower.startsWith("64:ff9b")) return true; // NAT64: esconde um IPv4
  return false;
}
