import { Module } from "@nestjs/common";
import { PropertyPublicationService } from "./property-publication.service";
import { PublicBrokerPageController } from "./public-broker-page.controller";
import { PublicBrokerPageService } from "./public-broker-page.service";
import { PublicPageController } from "./public-page.controller";
import { PublicPageService } from "./public-page.service";
import { PublicInterestService } from "./public-interest.service";
import { NotificationModule } from "../notification/notification.module";
import { LeadsModule } from "../leads/leads.module";

@Module({
  imports: [NotificationModule, LeadsModule],
  controllers: [PublicPageController, PublicBrokerPageController],
  providers: [PublicPageService, PropertyPublicationService, PublicBrokerPageService, PublicInterestService],
  exports: [PublicPageService, PropertyPublicationService],
})
export class PublicPageModule {}
