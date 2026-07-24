import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  submitCreciSchema,
  updateProfileSchema,
  type BrokerProfile,
  type UpdateProfileDto,
} from "@nexlar/shared";
import { CurrentBroker } from "../common/decorators/current-broker.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { BrokersService } from "./brokers.service";

@ApiTags("brokers")
@Controller("brokers")
export class BrokersController {
  constructor(private readonly brokers: BrokersService) {}

  @Get("me")
  @ApiOperation({ summary: "Devolve o perfil do corretor autenticado" })
  getMe(@CurrentBroker("brokerId") brokerId: string): Promise<BrokerProfile> {
    return this.brokers.getMe(brokerId);
  }

  @Patch("me")
  @ApiOperation({ summary: "Atualiza o perfil do corretor autenticado" })
  updateMe(
    @CurrentBroker("brokerId") brokerId: string,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto,
  ): Promise<BrokerProfile> {
    return this.brokers.updateMe(brokerId, dto);
  }

  /**
   * Envio do CRECI para conferência manual. Multipart porque vem o documento
   * junto: o número e a UF são campos de texto no mesmo formulário.
   */
  @Post("me/creci")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Envia CRECI e documento para verificação" })
  async submitCreci(
    @CurrentBroker("brokerId") brokerId: string,
    @Req() req: FastifyRequest,
  ): Promise<BrokerProfile> {
    const file = await req.file();
    if (!file) throw new BadRequestException("Anexe a foto ou o PDF do seu CRECI.");

    const campo = (nome: string): string | undefined => {
      const bruto = file.fields[nome];
      const unico = Array.isArray(bruto) ? bruto[0] : bruto;
      return unico && "value" in unico ? String(unico.value) : undefined;
    };

    const dto = new ZodValidationPipe(submitCreciSchema).transform({
      creci: campo("creci") ?? "",
      creciUf: campo("creciUf") ?? "",
    });

    return this.brokers.submitCreci(brokerId, dto, {
      filename: file.filename,
      mimeType: file.mimetype,
      buffer: await file.toBuffer(),
    });
  }

  @Get("me/creci/documento")
  @ApiOperation({ summary: "Devolve o documento de CRECI do próprio corretor" })
  async getCreciDocument(
    @CurrentBroker("brokerId") brokerId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { stream, mimeType } = await this.brokers.getCreciDocument(brokerId);
    // Documento pessoal: nada de cache compartilhado no caminho.
    void reply
      .header("Content-Type", mimeType)
      .header("Cache-Control", "private, no-store")
      .send(stream);
  }
}
