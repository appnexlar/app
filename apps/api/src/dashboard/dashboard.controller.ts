import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { DashboardSummary } from "@nexlar/shared";
import { CurrentBroker } from "../common/decorators/current-broker.decorator";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({ summary: "Resumo do dia, alertas, métricas e conversões do corretor" })
  summary(@CurrentBroker("brokerId") brokerId: string): Promise<DashboardSummary> {
    return this.dashboard.summary(brokerId);
  }
}
