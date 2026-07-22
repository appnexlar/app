import { Global, Module } from "@nestjs/common";
import { StorageService } from "./storage.service";

/** Global: quem precisa de arquivo só injeta o StorageService, sem importar módulo. */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
