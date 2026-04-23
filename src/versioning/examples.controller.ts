/**
 * Example: Users Controller with API Versioning
 * This demonstrates how to implement versioning in controllers
 */

import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Query } from '@nestjs/common';
import { ApiVersion } from '../versioning/api-version.decorator';
import { GetVersion } from '../versioning/get-version.decorator';
import { ApiVersionEnum } from '../versioning/api-version.constants';

// This is an example controller structure showing versioning patterns
// Import actual services and DTOs from your modules

/**
 * Users V1 and V2 Controller Example
 * Shows how to support multiple versions in the same controller
 */
@Controller('users')
export class UsersControllerExample {
  /**
   * V1 & V2: List all users
   * Both versions support this endpoint with same response format
   */
  @Get()
  @ApiVersion([ApiVersionEnum.V1, ApiVersionEnum.V2])
  findAll(@GetVersion() version: ApiVersionEnum) {
    // Can branch logic based on version if needed
    console.log(`Getting users for version: ${version}`);
    return {
      users: [],
      version,
    };
  }

  /**
   * V2 Only: Get user by ID with enhanced data
   * V1 clients will get 404 for this endpoint
   */
  @Get(':id')
  @ApiVersion(ApiVersionEnum.V2)
  findOne(@Param('id') id: string, @GetVersion() version: ApiVersionEnum) {
    return {
      id,
      name: 'User Name',
      email: 'user@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
      version,
    };
  }

  /**
   * V1: Get user by ID (legacy)
   * Simpler response format for V1 clients
   */
  @Get(':id/legacy')
  @ApiVersion(ApiVersionEnum.V1)
  findOneV1(@Param('id') id: string) {
    return {
      id,
      name: 'User Name',
      email: 'user@example.com',
    };
  }

  /**
   * V2 Only: Create a new user
   * V1 clients cannot create users
   */
  @Post()
  @ApiVersion(ApiVersionEnum.V2)
  create(@Body() createUserDto: any, @GetVersion() version: ApiVersionEnum) {
    return {
      id: '123',
      ...createUserDto,
      createdAt: new Date(),
      version,
    };
  }

  /**
   * V1 & V2: Update user
   */
  @Put(':id')
  @ApiVersion([ApiVersionEnum.V1, ApiVersionEnum.V2])
  update(
    @Param('id') id: string,
    @Body() updateUserDto: any,
    @GetVersion() version: ApiVersionEnum,
  ) {
    return {
      id,
      ...updateUserDto,
      updatedAt: new Date(),
      version,
    };
  }

  /**
   * V1 & V2: Delete user
   */
  @Delete(':id')
  @ApiVersion([ApiVersionEnum.V1, ApiVersionEnum.V2])
  remove(@Param('id') id: string, @GetVersion() version: ApiVersionEnum) {
    return {
      message: `User ${id} deleted successfully`,
      version,
    };
  }
}
