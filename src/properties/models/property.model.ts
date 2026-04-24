import { Field, ID, ObjectType, Float } from '@nestjs/graphql';
import { PropertyStatus } from '../../common/common.types';
import { User } from '../../users/models/user.model';

@ObjectType()
export class Property {
  @Field(() => ID)
  id: string;

  @Field()
  title: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  address: string;

  @Field()
  city: string;

  @Field()
  state: string;

  @Field()
  zipCode: string;

  @Field()
  country: string;

  @Field(() => Float)
  price: number;

  @Field()
  propertyType: string;

  @Field({ nullable: true })
  bedrooms?: number;

  @Field({ nullable: true })
  bathrooms?: number;

  @Field({ nullable: true })
  squareFeet?: number;

  @Field({ nullable: true })
  lotSize?: number;

  @Field({ nullable: true })
  yearBuilt?: number;

  @Field(() => PropertyStatus)
  status: PropertyStatus;

  @Field()
  ownerId: string;

  @Field(() => User)
  owner: User;

  @Field(() => Float, { nullable: true })
  latitude?: number;

  @Field(() => Float, { nullable: true })
  longitude?: number;

  @Field(() => [String])
  features: string[];

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}
