import { IsEmail } from 'class-validator';

export class ChangeEmailDto {
  @IsEmail()
  newEmail: string;
}

export class VerifyEmailDto {
  token: string;
}
