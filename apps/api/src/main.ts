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
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const config = app.get(ConfigService<Env, true>);

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

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Nexlar API")
    .setDescription("API do Nexlar — gestão para corretores")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  const port = config.get("PORT", { infer: true });
  await app.listen({ port, host: "0.0.0.0" });
  new Logger("Bootstrap").log(`Nexlar API no ar em http://localhost:${port}/api`);
}

void bootstrap();
