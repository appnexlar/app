import { Module } from "@nestjs/common";
import { PropertiesController } from "./properties.controller";
import { PropertiesService } from "./properties.service";
import { PropertyMediaService } from "./property-media.service";

@Module({
  controllers: [PropertiesController],
  providers: [PropertiesService, PropertyMediaService],
  // A importação por URL cria o rascunho pelos MESMOS serviços do cadastro
  // manual: nada entra no banco por um caminho paralelo.
  exports: [PropertiesService],
})
export class PropertiesModule {}
