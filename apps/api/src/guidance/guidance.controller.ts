import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  saveDiagnosisSchema,
  type GuidanceChecklist,
  type GuidanceState,
  type HelpContent,
  type OnboardingStatus,
  type SaveDiagnosisDto,
} from "@nexlar/shared";
import { CurrentBroker } from "../common/decorators/current-broker.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { GuidanceService } from "./guidance.service";
import { HelpContentService } from "./help-content";

/**
 * API da experiência guiada (Jornada 2). Tudo isolado por corretor: o
 * `brokerId` vem sempre do token, nunca do corpo ou da URL, então um corretor
 * jamais lê ou mexe no progresso de outro (GUI-07, §20).
 */
@ApiTags("guidance")
@ApiBearerAuth()
@Controller("guidance")
export class GuidanceController {
  constructor(
    private readonly guidance: GuidanceService,
    private readonly help: HelpContentService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Estado da experiência guiada: recomendação, checklist e diagnóstico" })
  getState(@CurrentBroker("brokerId") brokerId: string): Promise<GuidanceState> {
    return this.guidance.getState(brokerId);
  }

  @Get("help")
  @ApiOperation({ summary: "Conteúdo de ajuda contextual de uma tela" })
  getHelp(@Query("route") route = ""): HelpContent | null {
    return this.help.getForRoute(route);
  }

  @Get("checklist")
  @ApiOperation({ summary: "Checklist de primeiros passos, concluído por ação real" })
  getChecklist(@CurrentBroker("brokerId") brokerId: string): Promise<GuidanceChecklist> {
    return this.guidance.getChecklist(brokerId);
  }

  @Get("onboarding")
  @ApiOperation({ summary: "Diagnóstico inicial e estado do primeiro acesso" })
  getOnboarding(@CurrentBroker("brokerId") brokerId: string): Promise<OnboardingStatus> {
    return this.guidance.getOnboarding(brokerId);
  }

  @Post("first-access")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Marca que a recepção de primeiro acesso já foi vista" })
  async markFirstAccess(@CurrentBroker("brokerId") brokerId: string): Promise<void> {
    await this.guidance.markFirstAccess(brokerId);
  }

  @Post("onboarding")
  @ApiOperation({ summary: "Salva o diagnóstico inicial (ou registra que foi pulado)" })
  saveDiagnosis(
    @CurrentBroker("brokerId") brokerId: string,
    @Body(new ZodValidationPipe(saveDiagnosisSchema)) dto: SaveDiagnosisDto,
  ): Promise<OnboardingStatus> {
    return this.guidance.saveDiagnosis(brokerId, dto);
  }

  @Post(":key/dismiss")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Fecha uma orientação" })
  async dismiss(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("key") key: string,
  ): Promise<void> {
    await this.guidance.dismiss(brokerId, key);
  }

  @Post(":key/skip")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Deixa uma orientação para depois" })
  async skip(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("key") key: string,
  ): Promise<void> {
    await this.guidance.skip(brokerId, key);
  }

  @Post(":key/reopen")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Reabre uma orientação dispensada" })
  async reopen(
    @CurrentBroker("brokerId") brokerId: string,
    @Param("key") key: string,
  ): Promise<void> {
    await this.guidance.reopen(brokerId, key);
  }
}
