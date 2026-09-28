import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';

const ISSUER = 'PropChain';
const TICKET_TTL_SECONDS = 60;
const TICKET_TYPE = 'ws-ticket';

export interface WsTicketPayload {
  sub: string;
  sid: string;
  dfp: string;
  type: string;
  jti: string;
}

/**
 * Issues and verifies short-lived WebSocket handshake tickets (issue #1294).
 *
 * REST callers authenticate with a bearer access token. Instead of putting that
 * long-lived token in a socket query string, the client exchanges it for a
 * 60-second ticket bound to the caller's session and device. The gateway
 * verifies the ticket and checks the session is still active before accepting
 * the socket.
 */
@Injectable()
export class WsTicketService {
  private readonly logger = new Logger(WsTicketService.name);
  private readonly secret: string;
  private readonly ttlSeconds = TICKET_TTL_SECONDS;

  constructor(private readonly configService: ConfigService) {
    this.secret =
      this.configService.get<string>('JWT_SECRET') ??
      this.configService.get<string>('WS_TICKET_SECRET') ??
      '';
  }

  /** Issue a short-lived, session-bound ticket. */
  issue(userId: string, sessionId: string, fingerprint: string): string {
    if (!this.secret) {
      throw new Error('JWT_SECRET is required to issue WebSocket tickets');
    }

    return jwt.sign(
      {
        sub: userId,
        sid: sessionId,
        dfp: fingerprint,
        type: TICKET_TYPE,
        jti: randomUUID(),
      },
      this.secret,
      { expiresIn: this.ttlSeconds, issuer: ISSUER },
    );
  }

  /** Verify a ticket, returning its payload or throwing 401. */
  verify(ticket: string): WsTicketPayload {
    if (!ticket) {
      throw new UnauthorizedException('Missing WebSocket ticket');
    }

    let decoded: WsTicketPayload;
    try {
      decoded = jwt.verify(ticket, this.secret, { issuer: ISSUER }) as WsTicketPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired WebSocket ticket');
    }

    if (decoded?.type !== TICKET_TYPE || !decoded.sub || !decoded.sid) {
      throw new UnauthorizedException('Invalid WebSocket ticket');
    }

    return decoded;
  }

  get expiresInSeconds(): number {
    return this.ttlSeconds;
  }
}
