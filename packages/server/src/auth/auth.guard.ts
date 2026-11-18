import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

/**
 * Bearer-token auth for the HTTP endpoints.
 *
 * Set `MLS_API_TOKENS` to a comma-separated list of accepted tokens, and every
 * HTTP request must then carry `Authorization: Bearer <token>` with one of them,
 * or it is rejected with 401. With the env var unset, auth is disabled (handy
 * for the demo and tests) and a warning is logged once at startup.
 *
 * This is intentionally minimal. A real deployment would authenticate individual
 * users and bind a token to an identity, so it could also verify that the caller
 * owns the `userId` it publishes key packages or welcomes under. See the project
 * security model for what the SDK does and does not cover.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private static warned = false;

  canActivate(context: ExecutionContext): boolean {
    // Only guard HTTP; the WebSocket gateway relays already-encrypted bytes and
    // is handled separately.
    if (context.getType() !== "http") return true;

    const tokens = AuthGuard.tokens();
    if (tokens.length === 0) {
      if (!AuthGuard.warned) {
        AuthGuard.warned = true;
        // eslint-disable-next-line no-console
        console.warn("[auth] MLS_API_TOKENS is unset; HTTP endpoints are unauthenticated.");
      }
      return true;
    }

    const request = context.switchToHttp().getRequest<{ headers?: Record<string, string | undefined> }>();
    const header = request.headers?.authorization ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (match && tokens.includes(match[1].trim())) return true;

    throw new UnauthorizedException("missing or invalid API token");
  }

  private static tokens(): string[] {
    return (process.env.MLS_API_TOKENS ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
}
