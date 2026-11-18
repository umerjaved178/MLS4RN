import { ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * The standard throttler, but only for HTTP requests. Global guards also run on
 * WebSocket message handlers, and the base ThrottlerGuard expects an HTTP
 * request/response, so we skip any non-HTTP context and let it through.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    return super.canActivate(context);
  }
}
