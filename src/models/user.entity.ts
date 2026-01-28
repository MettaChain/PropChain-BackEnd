import { User as PrismaUser, UserRole } from '@prisma/client';

export { UserRole };

export class User implements PrismaUser {
    id: string;
    email: string;
    walletAddress: string | null;
    role: UserRole;
    roleId: string | null;
    password: string | null;
    isVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export type CreateUserInput = {
    email: string;
    password?: string;
    walletAddress?: string;
    firstName: string;
    lastName: string;
    role?: UserRole;
    roleId?: string;
};

export type UpdateUserInput = Partial<CreateUserInput>;