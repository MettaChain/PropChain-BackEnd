import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { AuditService, AuditOperation } from '../common/services/audit.service';
import { Action } from './enums/action.enum';
import { Resource } from './enums/resource.enum';
import { StructuredLoggerService } from '../common/logging/logger.service';

@Injectable()
export class RbacService {
  private readonly logger = new StructuredLoggerService(null);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {
    this.logger.setContext('RbacService');
  }

  /**
   * Check if a user has permission to perform an action on a resource
   */
  async hasPermission(userId: string, resource: Resource, action: Action): Promise<boolean> {
    try {
      // Get user with roles and permissions
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          userRole: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        return false;
      }

      // Check if user is admin (superuser)
      if (user.role === 'ADMIN') {
        return true;
      }

      // Check if user has direct permissions
      if (user.userRole && user.userRole.permissions) {
        const hasPerm = user.userRole.permissions.some(
          rolePerm => rolePerm.permission.resource === resource && rolePerm.permission.action === action,
        );

        if (hasPerm) {
          return true;
        }
      }

      // Also check if user has 'MANAGE' permission for the resource (full access)
      if (user.userRole && user.userRole.permissions) {
        const hasManagePerm = user.userRole.permissions.some(
          rolePerm => rolePerm.permission.resource === resource && rolePerm.permission.action === Action.MANAGE,
        );

        if (hasManagePerm) {
          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error('Error checking permission:', error.stack, {
        userId,
        resource,
        action,
      });
      return false;
    }
  }

  /**
   * Create a new permission
   */
  async createPermission(resource: Resource, action: Action, description?: string) {
    const permission = await this.prisma.permission.create({
      data: {
        resource,
        action,
        description: description || `${action} access to ${resource}`,
      },
    });

    await this.auditService.logCreate('permissions', permission);

    return permission;
  }

  /**
   * Assign a permission to a role
   */
  async assignPermissionToRole(roleId: string, permissionId: string) {
    const rolePermission = await this.prisma.rolePermission.create({
      data: {
        roleId,
        permissionId,
      },
    });

    await this.auditService.logCreate('role_permissions', rolePermission);

    return rolePermission;
  }

  /**
   * Revoke a permission from a role
   */
  async revokePermissionFromRole(roleId: string, permissionId: string) {
    const rolePermission = await this.prisma.rolePermission.findUnique({
      where: {
        roleId_permissionId: {
          roleId,
          permissionId,
        },
      },
    });

    if (!rolePermission) {
      throw new Error('Permission is not assigned to role');
    }

    const deletedRolePermission = await this.prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId,
          permissionId,
        },
      },
    });

    await this.auditService.logDelete('role_permissions', deletedRolePermission);

    return deletedRolePermission;
  }

  /**
   * Create a new role
   */
  async createRole(name: string, description?: string, level?: number) {
    const role = await this.prisma.role.create({
      data: {
        name,
        description: description || `Role: ${name}`,
        level: level || 0,
      },
    });

    await this.auditService.logCreate('roles', role);

    return role;
  }

  /**
   * Assign a role to a user
   */
  async assignRoleToUser(userId: string, roleId: string, changedById?: string, reason?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const oldRoleId = user.roleId;

    // Update user's role
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { roleId },
    });

    // Create role change log
    const roleChangeLog = await this.prisma.roleChangeLog.create({
      data: {
        userId,
        roleId,
        oldRoleId,
        changedBy: changedById,
        reason,
      },
    });

    await this.auditService.logUpdate('users', { ...user, roleId: oldRoleId }, updatedUser, changedById);
    await this.auditService.logCreate('role_change_logs', roleChangeLog, changedById);

    return updatedUser;
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRole: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user || !user.userRole) {
      return [];
    }

    return user.userRole.permissions.map(rp => rp.permission);
  }

  /**
   * Get all permissions for a role
   */
  async getRolePermissions(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      return [];
    }

    return role.permissions.map(rp => rp.permission);
  }

  /**
   * Get all roles with their permissions
   */
  async getAllRolesWithPermissions() {
    return await this.prisma.role.findMany({
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }

  /**
   * Get user's role hierarchy based on level
   */
  async getUserRoleHierarchy(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRole: true,
      },
    });

    if (!user || !user.userRole) {
      return null;
    }

    // Get all roles with higher or equal level (higher level = more permissions)
    const higherRoles = await this.prisma.role.findMany({
      where: {
        level: {
          gte: user.userRole.level,
        },
      },
      orderBy: {
        level: 'desc',
      },
    });

    return {
      userRole: user.userRole,
      higherRoles,
    };
  }

  /**
   * Validate resource ownership for user (for owner-based access control)
   */
  async validateResourceOwnership(
    userId: string,
    resourceType: 'property' | 'document' | 'transaction',
    resourceId: string,
  ): Promise<boolean> {
    try {
      switch (resourceType) {
        case 'property':
          const property = await this.prisma.property.findUnique({
            where: { id: resourceId },
          });
          return property?.ownerId === userId;

        case 'document':
          const document = await this.prisma.document.findUnique({
            where: { id: resourceId },
          });
          return document?.uploadedById === userId;

        case 'transaction':
          const transaction = await this.prisma.transaction.findUnique({
            where: { id: resourceId },
          });
          return transaction?.fromAddress === userId || transaction?.toAddress === userId;

        default:
          return false;
      }
    } catch (error) {
      this.logger.error('Error validating resource ownership:', error.stack, {
        userId,
        resourceType,
        resourceId,
      });
      return false;
    }
  }

  /**
   * Enhanced permission check combining RBAC and ABAC
   */
  async hasAccess(userId: string, resource: Resource, action: Action, resourceId?: string): Promise<boolean> {
    // First, check basic RBAC permissions
    const hasBasicPermission = await this.hasPermission(userId, resource, action);

    if (hasBasicPermission) {
      return true;
    }

    // For certain actions, check ownership-based access
    if (resourceId && action !== Action.CREATE) {
      // For read/update/delete actions, check if user owns the resource
      const resourceMap = {
        [Resource.PROPERTY]: 'property',
        [Resource.TRANSACTION]: 'transaction',
      };

      const mappedResource = resourceMap[resource];
      if (mappedResource) {
        const hasOwnership = await this.validateResourceOwnership(userId, mappedResource as any, resourceId);

        if (hasOwnership) {
          return true;
        }
      }
    }

    return false;
  }
}
