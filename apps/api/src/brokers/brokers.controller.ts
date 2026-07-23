import { Body, Controller, Get, Patch } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { updateProfileSchema, type BrokerProfile, type UpdateProfileDto } from "@nexlar/shared";
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
}
