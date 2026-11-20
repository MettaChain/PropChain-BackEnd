import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const IP_ALLOWLIST_KEY = 'ip-allowlist';

export const AllowIps = (...entries: string[]) => SetMetadata(IP_ALLOWLIST_KEY, entries);

interface AllowlistRequest {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

interface IpAddress {
  version: 4 | 6;
  bytes: number[];
}

function parseIpv4(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const byte = Number(part);
    if (byte > 255) return null;
    bytes.push(byte);
  }
  return bytes;
}

function parseIpv6(value: string): number[] | null {
  if (!/^[0-9a-f:]+$/i.test(value)) return null;
  const halves = value.toLowerCase().split('::');
  if (halves.length > 2) return null;

  if (halves.some((half) => half.startsWith(':') || half.endsWith(':'))) return null;
  const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':').filter(Boolean) : [];
  if (left.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  if (right.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;

  const missing = 8 - left.length - right.length;
  if (halves.length === 1 ? left.length !== 8 : missing < 1) return null;

  const groups = [...left, ...Array<string>(missing).fill('0'), ...right];
  return groups.flatMap((group) => {
    const value16 = parseInt(group, 16);
    return [value16 >> 8, value16 & 0xff];
  });
}

function parseAddress(raw: string): IpAddress | null {
  const value = raw.trim().replace(/^\[/, '').replace(/\]$/, '');
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(value);
  if (mapped) {
    const bytes = parseIpv4(mapped[1]);
    return bytes ? { version: 4, bytes } : null;
  }
  const ipv4 = parseIpv4(value);
  if (ipv4) return { version: 4, bytes: ipv4 };
  const ipv6 = parseIpv6(value);
  return ipv6 ? { version: 6, bytes: ipv6 } : null;
}

function prefixLength(entry: string): { address: string; prefix: number } {
  const slash = entry.indexOf('/');
  if (slash === -1) return { address: entry, prefix: -1 };
  const prefix = Number(entry.slice(slash + 1));
  return { address: entry.slice(0, slash), prefix: Number.isInteger(prefix) ? prefix : -1 };
}

function matchesEntry(address: IpAddress, entry: string): boolean {
  const { address: candidate, prefix } = prefixLength(entry.trim());
  const network = parseAddress(candidate);
  if (!network || network.version !== address.version) return false;
  if (prefix === -1) {
    return network.bytes.every((byte, index) => byte === address.bytes[index]);
  }
  const maxPrefix = address.version === 4 ? 32 : 128;
  if (prefix < 0 || prefix > maxPrefix) return false;

  const wholeBytes = Math.floor(prefix / 8);
  const remainingBits = prefix % 8;
  for (let index = 0; index < wholeBytes; index += 1) {
    if (network.bytes[index] !== address.bytes[index]) return false;
  }
  if (remainingBits === 0) return true;
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return (network.bytes[wholeBytes] & mask) === (address.bytes[wholeBytes] & mask);
}

@Injectable()
export class IpAllowlistGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const fromMetadata =
      this.reflector.getAllAndOverride<string[]>(IP_ALLOWLIST_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const fromEnvironment = (process.env.IP_ALLOWLIST ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const entries = [...fromMetadata, ...fromEnvironment];
    const request = context.switchToHttp().getRequest<AllowlistRequest>();
    const clientIp = this.clientIp(request);
    const address = clientIp ? parseAddress(clientIp) : null;

    if (
      entries.length === 0 ||
      !address ||
      !entries.some((entry) => matchesEntry(address, entry))
    ) {
      throw new ForbiddenException('IP address is not allowed');
    }
    return true;
  }

  private clientIp(request: AllowlistRequest): string | undefined {
    const forwarded = request.headers?.['x-forwarded-for'];
    const firstHop = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const candidate = firstHop?.split(',')[0].trim();
    return candidate || request.ip || request.socket?.remoteAddress;
  }
}
