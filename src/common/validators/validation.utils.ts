// Comprehensive validation utilities and decorators

import {
  ValidationOptions,
  registerDecorator,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Custom validation decorators

/**
 * Validates that a string is a valid email address
 */
export function IsEmailCustom(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isEmailCustom',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') {
            return false;
          }
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return emailRegex.test(value) && value.length <= 254;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid email address`;
        },
      },
    });
  };
}

/**
 * Validates that a string is a valid UUID
 */
export function IsUUIDCustom(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isUUIDCustom',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') {
            return false;
          }
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          return uuidRegex.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid UUID`;
        },
      },
    });
  };
}

/**
 * Validates that a string is a valid URL
 */
export function IsUrlCustom(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isUrlCustom',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') {
            return false;
          }
          try {
            new URL(value);
            return true;
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid URL`;
        },
      },
    });
  };
}

/**
 * Validates that a value is a positive number
 */
export function IsPositiveNumber(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPositiveNumber',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return typeof value === 'number' && value > 0;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a positive number`;
        },
      },
    });
  };
}

/**
 * Validates that a value is a non-negative number
 */
export function IsNonNegativeNumber(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNonNegativeNumber',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return typeof value === 'number' && value >= 0;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a non-negative number`;
        },
      },
    });
  };
}

/**
 * Validates that a string contains only alphanumeric characters
 */
export function IsAlphanumericCustom(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAlphanumericCustom',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return typeof value === 'string' && /^[a-zA-Z0-9]+$/.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must contain only alphanumeric characters`;
        },
      },
    });
  };
}

/**
 * Validates that a string matches a specific pattern
 */
export function MatchesCustom(pattern: RegExp, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'matchesCustom',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return typeof value === 'string' && pattern.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must match the required pattern`;
        },
      },
    });
  };
}

/**
 * Validates that an array has unique elements
 */
export function ArrayUniqueCustom(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'arrayUniqueCustom',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (!Array.isArray(value)) {
            return false;
          }
          return new Set(value).size === value.length;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must contain unique elements`;
        },
      },
    });
  };
}

/**
 * Validates that a date is in the future
 */
export function IsFutureDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFutureDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (!(value instanceof Date)) {
            return false;
          }
          return value > new Date();
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a future date`;
        },
      },
    });
  };
}

/**
 * Validates that a date is in the past
 */
export function IsPastDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPastDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (!(value instanceof Date)) {
            return false;
          }
          return value < new Date();
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a past date`;
        },
      },
    });
  };
}

/**
 * Validates that a value is within a specific range
 */
export function IsInRange(min: number, max: number, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isInRange',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return typeof value === 'number' && value >= min && value <= max;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be between ${min} and ${max}`;
        },
      },
    });
  };
}

/**
 * Validates that a string is a valid phone number
 */
export function IsPhoneNumber(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPhoneNumber',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') {
            return false;
          }
          // Basic phone number validation (international format)
          const phoneRegex = /^\+?[1-9]\d{1,14}$/;
          return phoneRegex.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid phone number`;
        },
      },
    });
  };
}

/**
 * Validates that a string is a valid credit card number
 */
export function IsCreditCard(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCreditCard',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') {
            return false;
          }
          // Luhn algorithm for credit card validation
          const sanitized = value.replace(/\s+/g, '');
          if (!/^\d{13,19}$/.test(sanitized)) {
            return false;
          }

          let sum = 0;
          let isEven = false;
          for (let i = sanitized.length - 1; i >= 0; i--) {
            let digit = parseInt(sanitized.charAt(i), 10);
            if (isEven) {
              digit *= 2;
              if (digit > 9) {
                digit -= 9;
              }
            }
            sum += digit;
            isEven = !isEven;
          }
          return sum % 10 === 0;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid credit card number`;
        },
      },
    });
  };
}

// Validation constraint classes for complex validations

@ValidatorConstraint({ name: 'customText', async: false })
export class CustomTextValidator implements ValidatorConstraintInterface {
  validate(text: string, args: ValidationArguments) {
    if (typeof text !== 'string') {
      return false;
    }

    // Custom validation logic
    const minLength = (args.constraints[0] as any).minLength || 1;
    const maxLength = (args.constraints[0] as any).maxLength || 1000;
    const allowedChars = (args.constraints[0] as any).allowedChars || /^[a-zA-Z0-9\s\-_.,!?]+$/;

    return text.length >= minLength && text.length <= maxLength && allowedChars.test(text);
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} must be valid text with appropriate length and characters`;
  }
}

@ValidatorConstraint({ name: 'businessHours', async: false })
export class BusinessHoursValidator implements ValidatorConstraintInterface {
  validate(time: string, args: ValidationArguments) {
    if (typeof time !== 'string') {
      return false;
    }

    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      return false;
    }

    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;

    // Business hours: 9 AM to 5 PM (540 to 1020 minutes)
    return totalMinutes >= 540 && totalMinutes <= 1020;
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} must be within business hours (9 AM - 5 PM)`;
  }
}
