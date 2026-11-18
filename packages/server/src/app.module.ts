import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { KeyPackagesModule } from "./key-packages/key-packages.module";
import { GroupsModule } from "./groups/groups.module";
import { WelcomesModule } from "./welcomes/welcomes.module";
import { AuthGuard } from "./auth/auth.guard";
import { HttpThrottlerGuard } from "./common/http-throttler.guard";

// Rate-limit window and budget. Defaults are generous; override per deployment.
// MLS_RATE_TTL is in milliseconds, MLS_RATE_LIMIT is requests per window.
const ttl = process.env.MLS_RATE_TTL ? Number(process.env.MLS_RATE_TTL) : 60_000;
const limit = process.env.MLS_RATE_LIMIT ? Number(process.env.MLS_RATE_LIMIT) : 300;

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl, limit }]),
    KeyPackagesModule,
    GroupsModule,
    WelcomesModule,
  ],
  providers: [
    // Global guards: rate limit first, then require a valid API token (both
    // apply to HTTP only; the WebSocket gateway is left to relay bytes).
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
