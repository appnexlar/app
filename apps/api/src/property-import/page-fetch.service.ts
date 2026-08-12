import { Injectable, Logger } from "@nestjs/common";
import { Agent, request } from "undici";
import { ImportFailedError } from "./import-errors";
import { UrlSecurityService, type SafeUrl } from "./url-security.service";

export interface FetchedPage {
  html: string;
  finalUrl: string;
  httpStatus: number;
}

/** Teto de resposta: anúncio real fica na casa dos KB; 3 MB já é generoso. */
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const HOP_TIMEOUT_MS = 10_000;
/** Identificado de propósito: quem quiser bloquear a Nextlar consegue. */
const USER_AGENT = "NextlarImport/1.0 (+https://nextlar.app)";

const INACESSIVEL =
  "Não conseguimos acessar este anúncio. Ele pode ter saído do ar ou o site pode estar bloqueando a leitura. Você pode tentar de novo ou cadastrar manualmente.";

/**
 * Busca a página do anúncio dentro das regras do porteiro (UrlSecurityService).
 *
 * Cada salto de redirect é uma URL nova e passa pela validação de novo. A
 * conexão é pinada nos IPs que o porteiro resolveu: o `lookup` custom devolve
 * esses endereços em vez de consultar o DNS de novo, então um DNS malicioso
 * não consegue trocar o alvo entre a validação e a conexão (rebinding).
 * Cookies nunca são enviados nem guardados.
 */
@Injectable()
export class PageFetchService {
  private readonly logger = new Logger(PageFetchService.name);

  constructor(private readonly security: UrlSecurityService) {}

  async fetch(rawUrl: string): Promise<FetchedPage> {
    let current = rawUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const safe = await this.security.validate(current);
      const { statusCode, headers, body } = await this.requestPinned(safe);

      if (statusCode >= 301 && statusCode <= 308 && statusCode !== 304) {
        await body.dump();
        const location = firstHeader(headers.location);
        if (!location) throw new ImportFailedError("inacessivel", INACESSIVEL);
        current = new URL(location, safe.url).toString();
        continue;
      }

      if (statusCode !== 200) {
        await body.dump();
        this.logger.warn(`Importação falhou: ${safe.url.hostname} respondeu ${statusCode}`);
        throw new ImportFailedError("inacessivel", INACESSIVEL);
      }

      const contentType = firstHeader(headers["content-type"]) ?? "";
      if (!/text\/html|application\/xhtml/i.test(contentType)) {
        await body.dump();
        throw new ImportFailedError(
          "nao_html",
          "Este link não leva a uma página de anúncio. Cole o endereço da página do imóvel.",
        );
      }

      const buffer = await this.readCapped(body);
      return {
        html: decodeHtml(buffer, contentType),
        finalUrl: safe.url.toString(),
        httpStatus: statusCode,
      };
    }

    throw new ImportFailedError("inacessivel", INACESSIVEL);
  }

  private async requestPinned(safe: SafeUrl) {
    const { addresses } = safe;
    const agent = new Agent({
      connect: {
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        },
        timeout: HOP_TIMEOUT_MS,
      },
      headersTimeout: HOP_TIMEOUT_MS,
      bodyTimeout: HOP_TIMEOUT_MS,
      // Sem seguir redirect aqui: cada salto volta ao laço e é revalidado.
    });

    try {
      return await request(safe.url, {
        method: "GET",
        dispatcher: agent,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml",
          "accept-language": "pt-BR,pt;q=0.9",
        },
      });
    } catch (error) {
      this.logger.warn(`Importação falhou ao conectar em ${safe.url.hostname}: ${String(error)}`);
      throw new ImportFailedError("inacessivel", INACESSIVEL);
    } finally {
      // Fecha depois que a resposta terminar de ser lida; não bloqueia o retorno.
      void agent.close();
    }
  }

  private async readCapped(body: AsyncIterable<Buffer | Uint8Array>): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of body) {
      size += chunk.length;
      if (size > MAX_BYTES) {
        throw new ImportFailedError(
          "muito_grande",
          "Esta página é pesada demais para importar. Você pode cadastrar o imóvel manualmente.",
        );
      }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Decodifica o HTML respeitando o charset: cabeçalho > meta da página. Sites
 * imobiliários antigos ainda servem ISO-8859-1 (o JK Macedo é um), e ler
 * latin1 como UTF-8 transforma "Mairiporã" em lixo. Sem charset declarado,
 * tenta UTF-8 e cai para latin1 se aparecer caractere de substituição.
 */
export function decodeHtml(buffer: Buffer, contentType?: string | null): string {
  let label = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1];
  if (!label) {
    const head = buffer.subarray(0, 4096).toString("latin1");
    label =
      /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ??
      /<meta[^>]+content=["'][^"']*charset=([\w-]+)/i.exec(head)?.[1];
  }
  if (label) {
    try {
      return new TextDecoder(label).decode(buffer);
    } catch {
      // Charset desconhecido: segue para a heurística abaixo.
    }
  }
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  return utf8.includes("�") ? new TextDecoder("iso-8859-1").decode(buffer) : utf8;
}
