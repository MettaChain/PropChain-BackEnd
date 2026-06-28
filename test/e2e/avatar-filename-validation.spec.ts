import { BadRequestException } from '@nestjs/common';
import { FilenameValidationPipe } from '../../src/users/pipes/filename-validation.pipe';

describe('Avatar filename validation (e2e)', () => {
  const pipe = new FilenameValidationPipe();

  it('should accept valid filenames with alphanumeric chars', () => {
    expect(pipe.transform('avatar123.jpg')).toBe('avatar123.jpg');
  });

  it('should accept valid filenames with dots, hyphens, underscores', () => {
    expect(pipe.transform('my-avatar_123.v2.png')).toBe('my-avatar_123.v2.png');
  });

  it('should reject filename with path traversal (../)', () => {
    expect(() => pipe.transform('../../../etc/passwd')).toThrow(BadRequestException);
  });

  it('should reject filename with backslash', () => {
    expect(() => pipe.transform('..\\windows\\system32')).toThrow(BadRequestException);
  });

  it('should reject empty filename', () => {
    expect(() => pipe.transform('')).toThrow(BadRequestException);
  });

  it('should reject filename with special characters', () => {
    expect(() => pipe.transform('avatar@file!.png')).toThrow(BadRequestException);
  });

  it('should reject filename with spaces', () => {
    expect(() => pipe.transform('avatar file.png')).toThrow(BadRequestException);
  });

  it('should reject filename exceeding 255 characters', () => {
    const longName = 'a'.repeat(256) + '.jpg';
    expect(() => pipe.transform(longName)).toThrow(BadRequestException);
  });

  it('should reject whitespace-only filename', () => {
    expect(() => pipe.transform('   ')).toThrow(BadRequestException);
  });
});
