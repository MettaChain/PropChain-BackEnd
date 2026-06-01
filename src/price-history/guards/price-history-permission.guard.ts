import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PriceHistoryService } from '../price-history.service';

/**
 * PriceHistoryPermissionGuard
 * Enforces permission-based access control for price history endpoints
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
 */
@Injectable()
export class PriceHistoryPermissionGuard implements CanActivate {
  private readonly logger = new Logger(PriceHistoryPermissionGuard.name);

  constructor(private readonly priceHistoryService: PriceHistoryService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Extract propertyId from route parameters
    const propertyId = request.params.propertyId;
    if (!propertyId) {
      throw new ForbiddenException('Property ID is required');
    }

    // Extract user from request context (set by JwtAuthGuard)
    const user = request.authUser;
    if (!user) {
      throw new ForbiddenException('User information is missing');
    }

    // Call checkPermission method from PriceHistoryService
    const hasPermission = await this.priceHistoryService.checkPermission(
      user.sub,
      user.role,
      propertyId,
    );

    // Return true if permission granted, throw ForbiddenException if denied
    if (!hasPermission) {
      this.logger.warn(
        `Access denied for user ${user.sub} to property ${propertyId}`,
      );
      throw new ForbiddenException(
        'You do not have permission to access this property\'s price history',
      );
    }

    return true;
  }
}
