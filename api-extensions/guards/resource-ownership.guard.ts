import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../src/database/prisma.service';

export type ResourceType = 'property' | 'transaction' | 'document';

export interface ResourceOwnershipOptions {
  param?: string;
  allowRoles?: string[];
}

export interface OwnershipMetadata {
  resource: ResourceType;
  options: ResourceOwnershipOptions;
}

export const RESOURCE_OWNERSHIP_KEY = 'resource-ownership';

export const RequireOwnership = (resource: ResourceType, options: ResourceOwnershipOptions = {}) =>
  SetMetadata(RESOURCE_OWNERSHIP_KEY, { resource, options });

interface OwnershipRequest {
  params?: Record<string, string | string[] | undefined>;
  authUser?: { sub?: string; id?: string; role?: string };
}

interface OwnershipRecord {
  ownerId?: string | null;
  userId?: string | null;
  buyerId?: string | null;
  sellerId?: string | null;
}

interface OwnershipPrisma {
  property: { findUnique: (args: unknown) => Promise<OwnershipRecord | null> };
  transaction: { findUnique: (args: unknown) => Promise<OwnershipRecord | null> };
  document: { findUnique: (args: unknown) => Promise<OwnershipRecord | null> };
}

const DEFINITIONS: Record<
  ResourceType,
  { model: keyof OwnershipPrisma; param: string; ownerFields: string[] }
> = {
  property: { model: 'property', param: 'propertyId', ownerFields: ['ownerId'] },
  transaction: {
    model: 'transaction',
    param: 'transactionId',
    ownerFields: ['buyerId', 'sellerId'],
  },
  document: { model: 'document', param: 'documentId', ownerFields: ['userId'] },
};

@Injectable()
export class ResourceOwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional()
    @Inject(PrismaService)
    private readonly prisma?: OwnershipPrisma,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<OwnershipMetadata>(RESOURCE_OWNERSHIP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!metadata) return true;

    const definition = DEFINITIONS[metadata.resource];
    if (!definition) return true;

    const request = context.switchToHttp().getRequest<OwnershipRequest>();
    const user = request.authUser;
    const userId = user?.sub ?? user?.id;
    if (!userId) throw new ForbiddenException('Authentication required');

    if ((metadata.options.allowRoles ?? ['ADMIN']).includes(user?.role ?? '')) {
      return true;
    }

    const paramName = metadata.options.param ?? definition.param;
    const rawId = request.params?.[paramName] ?? request.params?.id;
    const resourceId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!resourceId) throw new ForbiddenException('Resource identifier is missing');

    if (!this.prisma) throw new ForbiddenException('Ownership cannot be verified');

    const record = await this.prisma[definition.model].findUnique({
      where: { id: resourceId },
      select: definition.ownerFields.reduce<Record<string, boolean>>((acc, field) => {
        acc[field] = true;
        return acc;
      }, {}),
    });
    if (!record) throw new ForbiddenException('Resource not found');

    const isOwner = definition.ownerFields.some(
      (field) => record[field as keyof OwnershipRecord] === userId,
    );
    if (!isOwner) throw new ForbiddenException('You do not own this resource');
    return true;
  }
}
