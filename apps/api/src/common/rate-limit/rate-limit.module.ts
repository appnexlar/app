import { Global, Module } from "@nestjs/common";
import { RateLimitStore } from "./rate-limit.store";

/** O store é único no processo, por isso global. */
@Global()
@Module({
  providers: [RateLimitStore],
  exports: [RateLimitStore],
})
export class RateLimitModule {}
