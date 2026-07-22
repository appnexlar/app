import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Readable } from "node:stream";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Env } from "../config/env";

/**
 * Guarda os arquivos privados do corretor (fotos, plantas, documentos).
 *
 * Dois modos, escolhidos pelo STORAGE_DRIVER:
 *   local: grava em disco. É o de desenvolvimento.
 *   s3:    grava em bucket compatível com S3. É o de produção, hoje no
 *          Storage do Supabase.
 *
 * Por que existe: em produção o disco do servidor é apagado a cada publicação,
 * então foto enviada sumiria no deploy seguinte.
 *
 * O caminho do arquivo é o mesmo nos dois modos
 * (brokers/{id}/properties/{id}/images/{mediaId}.jpg), então o storagePath
 * guardado no banco não muda e nada precisa ser migrado ao trocar de modo.
 *
 * Segurança: o bucket é privado e nenhum arquivo tem URL pública. Quem serve o
 * conteúdo é sempre a API, depois de conferir que aquele arquivo é mesmo do
 * corretor autenticado.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: "local" | "s3";
  private readonly bucket: string;
  private s3?: S3Client;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.driver = this.config.get("STORAGE_DRIVER", { infer: true });
    this.bucket = this.config.get("S3_BUCKET", { infer: true });
    if (this.driver === "s3") {
      this.s3 = new S3Client({
        endpoint: this.config.get("S3_ENDPOINT", { infer: true }),
        region: this.config.get("S3_REGION", { infer: true }),
        credentials: {
          accessKeyId: this.config.get("S3_ACCESS_KEY", { infer: true }),
          secretAccessKey: this.config.get("S3_SECRET_KEY", { infer: true }),
        },
        // O Supabase, como a maioria dos compatíveis com S3, espera o bucket no
        // caminho da URL e não como subdomínio.
        forcePathStyle: true,
      });
      this.logger.log(`Storage em bucket "${this.bucket}"`);
    } else {
      this.logger.log(
        `Storage em disco local ("${this.config.get("STORAGE_DIR", { infer: true })}"). ` +
          "Em produção use STORAGE_DRIVER=s3, senão os arquivos somem a cada deploy.",
      );
    }
  }

  async put(path: string, buffer: Buffer, mimeType: string): Promise<void> {
    if (this.driver === "local") {
      const destino = this.absolute(path);
      await mkdir(dirname(destino), { recursive: true });
      await writeFile(destino, buffer);
      return;
    }
    await this.s3!.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: path,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
  }

  async getStream(path: string): Promise<Readable> {
    if (this.driver === "local") {
      return createReadStream(this.absolute(path));
    }
    const saida = await this.s3!.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: path }),
    );
    return saida.Body as Readable;
  }

  /** Some com o arquivo. Silencioso se ele já não existir, para a exclusão ser idempotente. */
  async remove(path: string): Promise<void> {
    try {
      if (this.driver === "local") {
        await unlink(this.absolute(path));
        return;
      }
      await this.s3!.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: path }),
      );
    } catch (erro) {
      this.logger.warn(`Não consegui apagar "${path}": ${(erro as Error).message}`);
    }
  }

  private absolute(path: string): string {
    return resolve(this.config.get("STORAGE_DIR", { infer: true }), path);
  }
}
