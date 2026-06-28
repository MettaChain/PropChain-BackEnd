import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

const FILENAME_REGEX = /^[a-zA-Z0-9._-]+$/;
const MAX_FILENAME_LENGTH = 255;

@Injectable()
export class FilenameValidationPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!value || value.trim().length === 0) {
      throw new BadRequestException('Filename must not be empty');
    }

    if (value.length > MAX_FILENAME_LENGTH) {
      throw new BadRequestException(
        `Filename must not exceed ${MAX_FILENAME_LENGTH} characters`,
      );
    }

    if (value.includes('..') || value.includes('/') || value.includes('\\')) {
      throw new BadRequestException('Filename must not contain path traversal sequences');
    }

    if (!FILENAME_REGEX.test(value)) {
      throw new BadRequestException(
        'Filename must only contain alphanumeric characters, dots, hyphens, and underscores',
      );
    }

    return value;
  }
}
