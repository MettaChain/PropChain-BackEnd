import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AvatarUploadController } from '../../src/users/avatar-upload.controller';
import { AvatarUploadService } from '../../src/users/avatar-upload.service';
import { UsersService } from '../../src/users/users.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('AvatarUploadController', () => {
  let controller: AvatarUploadController;
  let avatarUploadService: AvatarUploadService;
  let usersService: UsersService;

  describe('AvatarUploadService', () => {
    let service: AvatarUploadService;

    beforeEach(() => {
      const configService = {
        get: jest.fn((key: string, defaultValue?: string | number) => defaultValue),
      } as unknown as ConfigService;

      service = new AvatarUploadService(configService);
    });

    it('should reject filenames that attempt path traversal', async () => {
      await expect(service.deleteAvatar('user_123', '../../secret.txt')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  const mockUser = {
    id: 'user_123',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
  };

  const mockFile = {
    fieldname: 'avatar',
    originalname: 'test.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 1024,
    destination: './uploads/avatars',
    filename: 'test.jpg',
    path: './uploads/avatars/test.jpg',
    buffer: Buffer.from('test image data'),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AvatarUploadController],
      providers: [
        {
          provide: AvatarUploadService,
          useValue: {
            uploadAvatar: jest.fn(),
            deleteAvatar: jest.fn(),
            getAvatarUrl: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            updateAvatar: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AvatarUploadController>(AvatarUploadController);
    avatarUploadService = module.get<AvatarUploadService>(AvatarUploadService);
    usersService = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('uploadAvatar', () => {
    it('should upload avatar successfully', async () => {
      const uploadResult = {
        avatarUrl: 'http://localhost:3000/uploads/avatars/user_123_test.jpg',
        sizes: {
          small: 'http://localhost:3000/uploads/avatars/user_123/small_test.jpg',
          medium: 'http://localhost:3000/uploads/avatars/user_123/medium_test.jpg',
          large: 'http://localhost:3000/uploads/avatars/user_123/large_test.jpg',
        },
      };

      jest.spyOn(avatarUploadService, 'uploadAvatar').mockResolvedValue(uploadResult);
      jest.spyOn(usersService, 'updateAvatar').mockResolvedValue(mockUser as any);

      const result = await controller.uploadAvatar(mockFile, { user: mockUser });

      expect(avatarUploadService.uploadAvatar).toHaveBeenCalledWith(mockUser.id, mockFile);
      expect(usersService.updateAvatar).toHaveBeenCalledWith(mockUser.id, uploadResult.avatarUrl);
      expect(result).toEqual(uploadResult);
    });

    it('should throw BadRequestException when user is not authenticated', async () => {
      await expect(controller.uploadAvatar(mockFile, { user: null } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when no file is uploaded', async () => {
      await expect(controller.uploadAvatar(null as any, { user: mockUser })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('deleteAvatar', () => {
    it('should delete avatar successfully', async () => {
      const filename = 'test.jpg';

      jest.spyOn(avatarUploadService, 'deleteAvatar').mockResolvedValue();
      jest.spyOn(usersService, 'updateAvatar').mockResolvedValue(mockUser as any);

      const result = await controller.deleteAvatar(filename, { user: mockUser });

      expect(avatarUploadService.deleteAvatar).toHaveBeenCalledWith(
        mockUser.id,
        filename,
      );
      expect(usersService.updateAvatar).toHaveBeenCalledWith(mockUser.id, null);
      expect(result).toEqual({ message: 'Avatar deleted successfully' });
    });

    it('should throw BadRequestException when user is not authenticated', async () => {
      await expect(
        controller.deleteAvatar('test.jpg', { user: null } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getCurrentAvatar', () => {
    it('should return current avatar URL', async () => {
      const userWithAvatar = { ...mockUser, avatar: 'http://localhost:3000/avatar.jpg' };
      jest.spyOn(usersService, 'findOne').mockResolvedValue(userWithAvatar as any);

      const result = await controller.getCurrentAvatar({ user: mockUser });

      expect(usersService.findOne).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual({ avatarUrl: userWithAvatar.avatar });
    });

    it('should return undefined when user has no avatar', async () => {
      jest.spyOn(usersService, 'findOne').mockResolvedValue(mockUser as any);

      const result = await controller.getCurrentAvatar({ user: mockUser });

      expect(result).toEqual({ avatarUrl: undefined });
    });

    it('should throw NotFoundException when user is not found', async () => {
      jest.spyOn(usersService, 'findOne').mockResolvedValue(null);

      await expect(controller.getCurrentAvatar({ user: mockUser })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
