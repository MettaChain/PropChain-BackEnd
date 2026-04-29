import { Resolver, Query, Mutation, Args, Subscription } from '@nestjs/graphql';
import { UseGuards, Inject } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { PropertiesService } from './properties.service';
import { Property } from './models/property.model';
import { CreatePropertyDto, UpdatePropertyDto } from './dto/property.dto';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { GqlUser } from '../auth/decorators/gql-user.decorator';

@Resolver(() => Property)
export class PropertiesResolver {
  constructor(
    private readonly propertiesService: PropertiesService,
    @Inject('PUB_SUB') private readonly pubSub: any,
  ) {}

  @Query(() => [Property], { name: 'properties' })
  async getProperties(
    @Args('limit', { nullable: true }) limit?: number,
    @Args('offset', { nullable: true }) offset?: number,
  ) {
    return this.propertiesService.findAll({
      take: limit,
      skip: offset,
    });
  }

  @Query(() => Property, { name: 'property' })
  async getProperty(@Args('id') id: string) {
    return this.propertiesService.findOne(id);
  }

  @Mutation(() => Property)
  @UseGuards(GqlAuthGuard)
  async createProperty(@GqlUser() user: any, @Args('input') input: CreatePropertyDto) {
    const property = await this.propertiesService.create(input, user.id);
    this.pubSub.publish('propertyAdded', { propertyAdded: property });
    return property;
  }

  @Mutation(() => Property)
  @UseGuards(GqlAuthGuard)
  async updateProperty(@Args('id') id: string, @Args('input') input: UpdatePropertyDto) {
    return this.propertiesService.update(id, input);
  }

  @Subscription(() => Property, {
    name: 'propertyAdded',
  })
  propertyAdded() {
    return this.pubSub.asyncIterator('propertyAdded');
  }
}
