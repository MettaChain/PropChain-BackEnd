import { Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { PermissionGuard } from './permission.guard';
import { RequirePermission } from './require-permission.decorator';

/**
 * Usage examples for PermissionGuard + @RequirePermission.
 *
 * Scopes:
 *  - Method:     @UseGuards(PermissionGuard) on a handler
 *  - Controller: @UseGuards(PermissionGuard) on the class (shown below)
 *  - Global:     { provide: APP_GUARD, useClass: PermissionGuard } in a module
 *
 * Note: PermissionGuard expects `request.authUser` to be populated, so it must
 * run after the authentication guard (e.g. @UseGuards(JwtAuthGuard, PermissionGuard)).
 */
@Controller('examples/guard/properties')
@UseGuards(PermissionGuard)
@RequirePermission('property:read') // class-level default
export class GuardExampleController {
  // Inherits class-level metadata: requires 'property:read'
  @Get(':id')
  findOne(@Param('id') id: string) {
    return { id };
  }

  // Handler-level metadata overrides the class default
  @Patch(':id')
  @RequirePermission('property:update')
  update(@Param('id') id: string) {
    return { id, updated: true };
  }

  // Multiple permissions: user must hold ALL of them
  @Delete(':id')
  @RequirePermission('property:delete', 'property:admin')
  remove(@Param('id') id: string) {
    return { id, deleted: true };
  }
}
