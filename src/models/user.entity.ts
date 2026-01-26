import { User as PrismaUser, UserRole } from '@prisma/client';

export { UserRole };

export class User implements PrismaUser {
    id: string;
    email: string;
    // Note: If your schema allows nulls, keep '| null'. 
    // If Prisma complains, remove the '| null' to match the interface exactly.
    walletAddress: string | null;
    password: string | null; // Added to fix TS2420
    isVerified: boolean;     // Added to fix TS2420
    role: UserRole;
    roleId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export type CreateUserInput = {
    email: string;
    walletAddress?: string;
    role?: UserRole;
    roleId?: string;
};

export type UpdateUserInput = Partial<CreateUserInput>;