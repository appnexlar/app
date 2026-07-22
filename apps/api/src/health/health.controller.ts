import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators/public.decorator";
import { PrismaService } from "../prisma/prisma.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Verifica se a API está de pé e se o banco responde. Rota pública. */
  @Public()
  @Get()
  async check(): Promise<{ status: string; database: string }> {
    let database = "ok";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = "erro";
    }
    return { status: "ok", database };
  }
}
