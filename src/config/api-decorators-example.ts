/**
 * Example Usage of API Documentation Decorators
 * Shows how to use the custom API documentation decorators
 */

import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiPublicEndpoint,
  ApiProtectedEndpoint,
  ApiAdminEndpoint,
  ApiPaginatedEndpoint,
  ApiWithPathParam,
  ApiDeprecatedEndpoint,
  ApiVersionedEndpoint,
  ApiRateLimited,
  ApiSearchEndpoint,
} from './api-decorators';

@ApiTags('Users')
@Controller('users')
export class ExampleUsersControllerDocumentation {
  /**
   * Example: Public endpoint
   */
  @Get('public-info')
  @ApiPublicEndpoint(
    'Get public user information',
    'Retrieve public information about users without authentication',
  )
  getPublicInfo() {
    return { message: 'Public data' };
  }

  /**
   * Example: Protected endpoint with pagination
   */
  @Get()
  @ApiProtectedEndpoint(
    'List all users',
    'Retrieve a paginated list of all users. Requires authentication.',
  )
  @ApiPaginatedEndpoint('List users', 'Get paginated list of users with sorting and filtering')
  findAll() {
    return [];
  }

  /**
   * Example: Get by ID with path parameter
   */
  @Get(':id')
  @ApiProtectedEndpoint('Get user by ID', 'Retrieve a specific user by their ID')
  @ApiWithPathParam('id', 'string')
  findOne(@Param('id') id: string) {
    return { id, name: 'User Name' };
  }

  /**
   * Example: Admin-only endpoint
   */
  @Delete(':id')
  @ApiAdminEndpoint(
    'Delete user',
    'Permanently delete a user from the system. Admin access required.',
  )
  @ApiWithPathParam('id', 'string')
  remove(@Param('id') id: string) {
    return { message: `User ${id} deleted` };
  }

  /**
   * Example: Deprecated endpoint
   */
  @Get('old-list')
  @ApiDeprecatedEndpoint('Get users (old)', 'This is an old way to get users', 'GET /users')
  oldListEndpoint() {
    return [];
  }

  /**
   * Example: Versioned endpoint
   */
  @Post()
  @ApiVersionedEndpoint('Create user', 'Create a new user account', ['v1', 'v2'])
  create(@Body() createUserDto: any) {
    return { id: '1', ...createUserDto };
  }

  /**
   * Example: Rate-limited endpoint
   */
  @Get(':id/activity')
  @ApiProtectedEndpoint('Get user activity', 'Retrieve user activity logs')
  @ApiRateLimited(100, '1 hour')
  @ApiWithPathParam('id', 'string')
  getUserActivity(@Param('id') id: string) {
    return { userId: id, activities: [] };
  }

  /**
   * Example: Search endpoint
   */
  @Get('search/by-email')
  @ApiSearchEndpoint('Search users by email', 'Search for users by email address with filters')
  searchByEmail() {
    return [];
  }
}

@ApiTags('Properties')
@Controller('properties')
export class ExamplePropertiesControllerDocumentation {
  /**
   * Example: Public list endpoint
   */
  @Get()
  @ApiPublicEndpoint('List properties', 'Retrieve a list of public properties')
  @ApiPaginatedEndpoint('List properties', 'Get paginated list of properties')
  findAll() {
    return [];
  }

  /**
   * Example: Protected create endpoint
   */
  @Post()
  @ApiProtectedEndpoint('Create property', 'Create a new property listing')
  create(@Body() createPropertyDto: any) {
    return { id: '1', ...createPropertyDto };
  }

  /**
   * Example: Update endpoint with version support
   */
  @Put(':id')
  @ApiVersionedEndpoint('Update property', 'Update property details', ['v2'])
  @ApiWithPathParam('id', 'string')
  update(@Param('id') id: string, @Body() updatePropertyDto: any) {
    return { id, ...updatePropertyDto };
  }
}

/**
 * Usage in actual controllers:
 *
 * @Controller('api/v2/users')
 * @ApiTags('Users')
 * export class UsersController {
 *   @Get()
 *   @ApiProtectedEndpoint(
 *     'List all users',
 *     'Retrieve a paginated list of all users'
 *   )
 *   @ApiPaginatedEndpoint(
 *     'List users',
 *     'Get paginated list with sorting'
 *   )
 *   findAll() {
 *     return [];
 *   }
 *
 *   @Get(':id')
 *   @ApiProtectedEndpoint(
 *     'Get user by ID',
 *     'Retrieve a specific user'
 *   )
 *   @ApiWithPathParam('id', 'string')
 *   findOne(@Param('id') id: string) {
 *     return { id };
 *   }
 *
 *   @Post()
 *   @ApiProtectedEndpoint(
 *     'Create user',
 *     'Create a new user'
 *   )
 *   create(@Body() createUserDto: CreateUserDto) {
 *     return { id: '1', ...createUserDto };
 *   }
 *
 *   @Delete(':id')
 *   @ApiAdminEndpoint(
 *     'Delete user',
 *     'Delete a user permanently'
 *   )
 *   @ApiWithPathParam('id', 'string')
 *   remove(@Param('id') id: string) {
 *     return { message: 'Deleted' };
 *   }
 * }
 */
