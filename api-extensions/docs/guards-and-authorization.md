# Guards and Authorization in `api-extensions/`

Guards decide whether a request reaches a route handler. This guide covers the `CanActivate` contract, `ExecutionContext`, `Reflector` metadata, authentication (`JwtAuthGuard`), role checks (`RolesGuard`), Prisma-backed resource ownership, and provider registration. It follows the implementations in `src/auth/guards/` (`jwt-auth.guard.ts`, `roles.guard.ts`, `rate-limit.guard.ts`) and the metadata decorators in `src/auth/decorators/` (`roles.decorator.ts`, `current-user.decorator.ts`, `require-scopes.decorator.ts`). Those files are references only — every example below is a file under `api-extensions/`.

## 1. `CanActivate` and `ExecutionContext`

```ts
interface CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean>;
}
```

- Return `true` to continue; return `false` or throw an `HttpException` to deny (Nest turns `false` into a 403).
- `context.switchToHttp().getRequest()` gives the Express request (params, headers, and `authUser` attached by an earlier guard).
- `context.getClass()` and `context.getHandler()` are the controller and route method — the targets `Reflector` reads metadata from.
- Guards run **before** interceptors, pipes and the handler. A guard cannot rely on DTO-transformed bodies; it can rely on route params and on anything previous guards attached to the request.
- Request order: middleware → guards (in declaration order) → interceptors → pipes → controller.

```ts
// @ts-nocheck
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
class AlwaysAllowGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    void request.params;
    return true;
  }
}
```

Existing extension guards to copy from: `api-extensions/guards/verified-email.guard.ts` (metadata-gated check) and `api-extensions/guards/feature-flag.guard.ts` (optional injected provider, `@Inject(SYMBOL)`).

## 2. Decorator metadata with `Reflector`

A decorator sets metadata; a guard reads it. `getAllAndOverride(key, [handler, class])` prefers handler metadata and falls back to controller metadata — the pattern used by `src/auth/guards/roles.guard.ts`.

```ts
// api-extensions/guards/ownership.decorator.ts
// @ts-nocheck
import { SetMetadata } from '@nestjs/common';

export const OWNERSHIP_RESOURCE_KEY = 'extension-ownership-resource';
export const OWNERSHIP_PARAM_KEY = 'extension-ownership-param';

/**
 * Mark a route as requiring ownership of a resource.
 * `param` is the route param holding its id (defaults to 'id').
 */
export function RequireOwnership(resource: 'property' | 'transaction', param = 'id') {
  return (target: object, key?: string | symbol): void => {
    SetMetadata(OWNERSHIP_RESOURCE_KEY, resource)(target, key as string);
    SetMetadata(OWNERSHIP_PARAM_KEY, param)(target, key as string);
  };
}
```

Applying two `SetMetadata` calls is fine; a simpler alternative is one decorator setting a single options object. Routes without the metadata bypass the guard — the same convention as `RolesGuard` and `VerifiedEmailGuard`.

## 3. Authentication: `JwtAuthGuard` pattern

Place this in `api-extensions/guards/jwt-auth.guard.ts`. It mirrors `src/auth/guards/jwt-auth.guard.ts`, using the existing `AuthService.validateAccessToken()` rather than reimplementing token verification.

```ts
// api-extensions/guards/jwt-auth.guard.ts
// @ts-nocheck
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../../src/auth/auth.service';

@Injectable()
export class ExtensionJwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractBearerToken(request.headers?.authorization);

    if (!token) throw new UnauthorizedException('Missing bearer token');

    // Same contract as the core guard: downstream guards read request.authUser.
    request.authUser = await this.authService.validateAccessToken(token);
    request.accessToken = token;
    return true;
  }

  protected extractBearerToken(header?: string): string | null {
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    return scheme === 'Bearer' && token ? token : null;
  }
}
```

Notes:

- Invalid/expired tokens should surface as 401 from `AuthService.validateAccessToken()`; do not swallow the error.
- Do not copy token parsing from other frameworks; keep the exact `Bearer <token>` scheme used by the core API.
- If the core module already provides a global guard, you may simply reuse `JwtAuthGuard` from `src/auth/guards/jwt-auth.guard.ts` instead of defining an extension copy.

## 4. Authorization by role: `RolesGuard`

`src/auth/guards/roles.guard.ts` reads `ROLES_KEY` set by `@Roles()` and checks `request.authUser.role`.

```ts
// api-extensions/guards/roles.guard.ts
// @ts-nocheck
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../src/auth/decorators/roles.decorator';
import { AuthUserPayload } from '../../src/auth/types/auth-user.type';

@Injectable()
export class ExtensionRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true; // no @Roles() metadata → allow

    const request = context.switchToHttp().getRequest();
    const user: AuthUserPayload | undefined = request.authUser;
    if (!user?.role) throw new ForbiddenException('User role not found');
    if (!required.includes(user.role)) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
```

Controller usage — authentication must come first so `authUser` exists:

```ts
// @ts-nocheck
import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../../src/auth/decorators/roles.decorator';
import { CurrentUser } from '../../src/auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../../src/auth/types/auth-user.type';
import { ExtensionJwtAuthGuard } from '../../guards/jwt-auth.guard';
import { ExtensionRolesGuard } from '../../guards/roles.guard';

@Controller('extension-reports')
@UseGuards(ExtensionJwtAuthGuard, ExtensionRolesGuard)
export class ExtensionReportsController {
  @Get()
  @Roles('ADMIN', 'AGENT')
  list(@CurrentUser() user: AuthUserPayload) {
    return { requestedBy: user.sub };
  }
}
```

`@CurrentUser()` from `src/auth/decorators/current-user.decorator.ts` simply returns `request.authUser` — useful once a guard has populated it. Other metadata-driven checks in the core API include `@RequireScopes()` (`src/auth/decorators/require-scopes.decorator.ts`) and the skip/custom metadata read by `src/auth/guards/rate-limit.guard.ts`.

## 5. Complete example: Prisma-backed ownership guard

This guard loads the resource with a minimal `select`, applies the privileged-role bypass from `docs/CODING_PATTERNS.md`, and caches the row on the request so the service does not query it twice.

```ts
// api-extensions/guards/property-ownership.guard.ts
// @ts-nocheck
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../src/database/prisma.service';
import { AuthUserPayload } from '../../src/auth/types/auth-user.type';
import {
  OWNERSHIP_PARAM_KEY,
  OWNERSHIP_RESOURCE_KEY,
} from './ownership.decorator';

type OwnedResource = { id: string; ownerId: string };

interface GuardedRequest {
  params: Record<string, string>;
  authUser?: AuthUserPayload;
  ownedResource?: OwnedResource;
}

@Injectable()
export class PropertyOwnershipGuard implements CanActivate {
  private readonly logger = new Logger(PropertyOwnershipGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.getAllAndOverride<'property' | 'transaction'>(
      OWNERSHIP_RESOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!resource) return true;

    const paramName =
      this.reflector.getAllAndOverride<string>(OWNERSHIP_PARAM_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'id';

    const request = context.switchToHttp().getRequest<GuardedRequest>();
    const user = request.authUser;
    if (!user?.sub) throw new ForbiddenException('Authentication required');

    const resourceId = request.params?.[paramName];
    if (!resourceId) throw new NotFoundException('Resource id is missing');

    // Minimal select: ownership data only. Extend the union if more resources
    // are needed; keep the query count constant (no per-item lookups).
    let owned: OwnedResource | null;
    try {
      owned = await this.prisma[resource].findUnique({
        where: { id: resourceId },
        select: { id: true, ownerId: true },
      });
    } catch (error) {
      this.logger.error(`Ownership lookup failed for ${resource} ${resourceId}`, error);
      throw error;
    }
    if (!owned) throw new NotFoundException(`${resource} ${resourceId} not found`);

    const privileged = user.role === 'ADMIN' || user.role === 'AGENT';
    if (owned.ownerId !== user.sub && !privileged) {
      throw new ForbiddenException('You do not own this resource');
    }

    request.ownedResource = owned;
    return true;
  }
}
```

The `Logger` call keeps lookup failures observable without changing the HTTP error semantics. For a different route param, use `@RequireOwnership('property', 'propertyId')`. For a transaction model without `ownerId`, select the appropriate participant/buyer/seller fields and compare against `user.sub`.

### Wiring it up

```ts
// api-extensions/modules/extension-reports/extension-reports.module.ts
// @ts-nocheck
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../src/database/prisma.module';
import { ExtensionJwtAuthGuard } from '../../guards/jwt-auth.guard';
import { ExtensionRolesGuard } from '../../guards/roles.guard';
import { PropertyOwnershipGuard } from '../../guards/property-ownership.guard';
import { ExtensionReportsController } from './extension-reports.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ExtensionReportsController],
  providers: [ExtensionJwtAuthGuard, ExtensionRolesGuard, PropertyOwnershipGuard],
})
export class ExtensionReportsModule {}
```

```ts
// controller route
@Patch(':id')
@UseGuards(PropertyOwnershipGuard)
@RequireOwnership('property', 'id')
update(@Param('id') id: string, @Body() dto: UpdateDto) {
  return this.service.update(id, dto);
}
```

- Guard providers must be listed in `providers` (or provided by a module that exports them) or Nest will fail DI with "Nest can't resolve dependencies".
- For app-wide guards use `APP_GUARD` in a module: `{ provide: APP_GUARD, useClass: ExtensionJwtAuthGuard }`. Keep metadata-gated guards (roles/ownership) scoped to controllers/routes.
- Declaration order matters: `@UseGuards(ExtensionJwtAuthGuard, ExtensionRolesGuard, PropertyOwnershipGuard)` — each guard may depend on the previous one's request mutations.
- `Reflector` is available from `@nestjs/core` without explicit provider registration.

## 6. Illustrative test snippet

The following is documentation only — no spec file is added as part of this change. When executable tests are permitted, place them beside the guard (e.g. `api-extensions/guards/property-ownership.guard.spec.ts`).

```ts
// @ts-nocheck
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PropertyOwnershipGuard } from './property-ownership.guard';

function contextFor(request: any): ExecutionContext {
  return {
    getClass: () => class TestController {},
    getHandler: () => function handler() {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const reflector = {
  getAllAndOverride: jest.fn((key: string) =>
    key === 'extension-ownership-resource' ? 'property' : 'id',
  ),
} as unknown as Reflector;

const prisma = {
  property: { findUnique: jest.fn() },
};

const guard = new PropertyOwnershipGuard(reflector, prisma as any);

it('allows the owner', async () => {
  prisma.property.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'user-1' });
  const request = { params: { id: 'p1' }, authUser: { sub: 'user-1', role: 'USER' } };
  await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  expect(request.ownedResource).toEqual({ id: 'p1', ownerId: 'user-1' });
});

it('denies a different non-privileged user', async () => {
  prisma.property.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'user-1' });
  const request = { params: { id: 'p1' }, authUser: { sub: 'user-2', role: 'USER' } };
  await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(ForbiddenException);
});

it('returns 404 for an unknown resource', async () => {
  prisma.property.findUnique.mockResolvedValue(null);
  const request = { params: { id: 'missing' }, authUser: { sub: 'user-1', role: 'USER' } };
  await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(NotFoundException);
});

it('lets an ADMIN bypass ownership', async () => {
  prisma.property.findUnique.mockResolvedValue({ id: 'p1', ownerId: 'user-1' });
  const request = { params: { id: 'p1' }, authUser: { sub: 'admin-1', role: 'ADMIN' } };
  await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
});
```

## 7. Checklist

- [ ] Guards implement `CanActivate`, are `@Injectable()`, and are listed in module `providers` (or bound with `APP_GUARD`).
- [ ] Authentication guard runs before guards that read `request.authUser`.
- [ ] Metadata keys are constants shared by decorator and guard; `getAllAndOverride` checks handler then class.
- [ ] Resource lookups use a minimal `select`, return 404 when missing and 403 when not permitted.
- [ ] No untrusted headers (e.g. `x-forwarded-for`) are used as authorization input; see `src/auth/guards/rate-limit.guard.ts` for safe handling.
- [ ] All files are under `api-extensions/`; shared auth code is imported, never modified.
