import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { AppModule } from "./app.module";
import type { Env } from "./config/env";

async function bootstrap(): Promise<void> {
  // Precisa ser lido do process.env: o adapter nasce antes do ConfigService.
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // Sem isto o request.ip é sempre o do proxy, e o limite de tentativas
      // por IP não distingue ninguém.
      trustProxy: trustProxyHops > 0 ? trustProxyHops : false,
    }),
  );

  const config = app.get(ConfigService<Env, true>);

  if (config.get("NODE_ENV", { infer: true }) === "production" && trustProxyHops === 0) {
    new Logger("Bootstrap").warn(
      "TRUST_PROXY_HOPS=0 em produção: o limite de tentativas por IP fica desligado " +
        "para não prender todo mundo no IP do proxy. Defina TRUST_PROXY_HOPS=1 na Railway.",
    );
  }

  await app.register(helmet);
  await app.register(cors, {
    origin: config.get("WEB_ORIGIN", { infer: true }) as string,
    credentials: true,
  });
  await app.register(multipart, {
    limits: {
      fileSize:
        Math.max(
          config.get("MEDIA_MAX_PHOTO_MB", { infer: true }),
          config.get("MEDIA_MAX_VIDEO_MB", { infer: true }),
        ) *
        1024 *
        1024,
      files: 10,
    },
  });

  app.setGlobalPrefix("api");

  // A documentação fica fora do ar em produção. Ela lista rota por rota, com
  // formato de payload e de resposta, ou seja, entrega a planta da API pronta
  // para quem quiser sondar. Em desenvolvimento é ferramenta; publicada, é
  // superfície de ataque de graça.
  if (config.get("NODE_ENV", { infer: true }) !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Nexlar API")
      .setDescription("API do Nexlar — gestão para corretores")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = config.get("PORT", { infer: true });
  await app.listen({ port, host: "0.0.0.0" });
  new Logger("Bootstrap").log(`Nexlar API no ar em http://localhost:${port}/api`);
}

void bootstrap();
