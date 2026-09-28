import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsTicketService } from './ws-ticket.service';
import { deviceFingerprint } from './device-fingerprint.util';

const SECRET = 'j'.repeat(64);

function makeConfig(secret = SECRET): ConfigService {
  return {
    get: jest.fn((key: string) => (key === 'JWT_SECRET' ? secret : undefined)),
  } as unknown as ConfigService;
}

describe('WsTicketService (#1294)', () => {
  let service: WsTicketService;

  beforeEach(() => {
    service = new WsTicketService(makeConfig());
  });

  it('issues a ticket that verifies with the session and device binding', () => {
    const fingerprint = deviceFingerprint('Mozilla/5.0');
    const ticket = service.issue('user-1', 'sess-1', fingerprint);

    const payload = service.verify(ticket);

    expect(payload.sub).toBe('user-1');
    expect(payload.sid).toBe('sess-1');
    expect(payload.dfp).toBe(fingerprint);
    expect(payload.type).toBe('ws-ticket');
  });

  it('rejects an empty ticket', () => {
    expect(() => service.verify('')).toThrow(UnauthorizedException);
  });

  it('rejects a tampered ticket', () => {
    const ticket = service.issue('user-1', 'sess-1', 'fp');
    expect(() => service.verify(`${ticket}x`)).toThrow(UnauthorizedException);
  });

  it('rejects a ticket signed with a different secret', () => {
    const other = new WsTicketService(makeConfig('k'.repeat(64)));
    const ticket = other.issue('user-1', 'sess-1', 'fp');
    expect(() => service.verify(ticket)).toThrow(UnauthorizedException);
  });

  it('exposes the ticket TTL', () => {
    expect(service.expiresInSeconds).toBeGreaterThan(0);
  });
});

describe('deviceFingerprint (#1294)', () => {
  it('normalises user-agent casing', () => {
    expect(deviceFingerprint('Mozilla/5.0')).toBe(deviceFingerprint('mozilla/5.0'));
  });

  it('differs for different user agents', () => {
    expect(deviceFingerprint('Mozilla')).not.toBe(deviceFingerprint('Chrome'));
  });

  it('is stable for a missing user agent', () => {
    expect(deviceFingerprint(undefined)).toBe(deviceFingerprint(''));
  });
});
