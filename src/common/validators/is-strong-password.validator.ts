import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ async: false })
export class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    // At least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
    const hasMinLength = value.length >= 8;
    const hasUppercase = /[A-Z]/.test(value);
    const hasLowercase = /[a-z]/.test(value);
    const hasNumber = /\d/.test(value);
    const hasSpecialChar = /[@$!%*?&#^()_+\-=\[\]{}|;:'",.<>\/\\`~]/.test(value);

    return hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecialChar;
  }

  defaultMessage(): string {
    return 'Password must be at least 8 characters with 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character';
  }
}

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStrongPasswordConstraint,
    });
  };
}
