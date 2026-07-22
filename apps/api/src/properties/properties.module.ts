import { Module } from "@nestjs/common";
import { PropertiesController } from "./properties.controller";
import { PropertiesService } from "./properties.service";
import { PropertyMediaService } from "./property-media.service";

@Module({
  controllers: [PropertiesController],
  providers: [PropertiesService, PropertyMediaService],
})
export class PropertiesModule {}
