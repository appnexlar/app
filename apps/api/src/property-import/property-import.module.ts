import { Module } from "@nestjs/common";
import { PropertiesModule } from "../properties/properties.module";
import { PageFetchService } from "./page-fetch.service";
import { PropertyImportController } from "./property-import.controller";
import { PropertyImportService } from "./property-import.service";
import { UrlSecurityService } from "./url-security.service";

@Module({
  imports: [PropertiesModule],
  controllers: [PropertyImportController],
  providers: [PropertyImportService, PageFetchService, UrlSecurityService],
})
export class PropertyImportModule {}
