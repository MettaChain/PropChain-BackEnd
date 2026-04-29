import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './models/user.model';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { GqlUser } from '../auth/decorators/gql-user.decorator';
import { UpdateUserDto } from './dto/user.dto';

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => User, { name: 'me' })
  @UseGuards(GqlAuthGuard)
  async getMe(@GqlUser() user: any) {
    return this.usersService.findOne(user.id);
  }

  @Query(() => [User], { name: 'users' })
  @UseGuards(GqlAuthGuard)
  async getUsers() {
    return this.usersService.findAll();
  }

  @Query(() => User, { name: 'user' })
  @UseGuards(GqlAuthGuard)
  async getUser(@Args('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Mutation(() => User)
  @UseGuards(GqlAuthGuard)
  async updateProfile(@GqlUser() user: any, @Args('input') input: UpdateUserDto) {
    // Note: UpdateUserDto might need @InputType() decoration if not already.
    // NestJS GraphQL can automatically handle it if mapped correctly.
    return this.usersService.update(user.id, input);
  }
}
