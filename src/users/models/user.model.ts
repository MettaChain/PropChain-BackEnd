import { Field, ID, ObjectType } from '@nestjs/graphql';
import { UserRole } from '../../common/common.types';

@ObjectType()
export class User {
  @Field(() => ID)
  id: string;

  @Field()
  email: string;

  @Field()
  firstName: string;

  @Field()
  lastName: string;

  @Field({ nullable: true })
  phone?: string;

  @Field(() => UserRole)
  role: UserRole;

  @Field()
  isVerified: boolean;

  @Field({ nullable: true })
  avatar?: string;

  @Field()
  trustScore: number;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}
