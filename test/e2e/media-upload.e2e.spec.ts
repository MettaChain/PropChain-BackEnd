import { CanActivate, ExecutionContext, INestApplication, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { promises as fs } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import * as request from 'supertest';
import { PropertyImagesController } from '../../src/properties/property-images.controller';
import { PropertyImagesService } from '../../src/properties/property-images.service';
import { AvatarUploadController } from '../../src/users/avatar-upload.controller';
import { AvatarUploadService } from '../../src/users/avatar-upload.service';
import { UsersService } from '../../src/users/users.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { PrismaService } from '../../src/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { DuplicateDetectionService } from '../../src/duplicate-detection/duplicate-detection.service';
import { DocumentUploadService } from '../../src/documents/document-upload.service';

const PROPERTY_ID = '11111111-1111-4111-a111-111111111111';
const USER_ID = '22222222-2222-4222-a222-222222222222';
const UPLOAD_DIR = join(process.cwd(), 'tmp-media-upload-e2e');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

@Injectable()
class MockJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    request.user = { sub: USER_ID, id: USER_ID, role: 'USER', email: 'e2e@example.com' };
    return true;
  }
}

class FakePrismaService {
  images: any[] = [];
  property = { findUnique: async () => ({ id: PROPERTY_ID, ownerId: USER_ID }) } as any;
  propertyImage = {
    count: async ({ where }: any) =>
      this.images.filter((image) => image.propertyId === where.propertyId).length,
    findFirst: async ({ where, orderBy }: any) => {
      const matches = this.images.filter((image) =>
        Object.entries(where).every(([key, value]) => image[key] === value),
      );
      return orderBy
        ? (matches.sort((a, b) => b.order - a.order)[0] ?? null)
        : (matches[0] ?? null);
    },
    create: async ({ data }: any) => {
      const image = {
        id: crypto.randomUUID(),
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.images.push(image);
      return image;
    },
    findMany: async ({ where }: any) =>
      this.images.filter((image) => image.propertyId === where.propertyId),
  } as any;
}

describe('real multipart media uploads (e2e)', () => {
  let app: INestApplication;
  let fakePrisma: FakePrismaService;

  beforeAll(async () => {
    fakePrisma = new FakePrismaService();
    const config = {
      get: (key: string, fallback: any) =>
        ({
          PROPERTY_IMAGES_UPLOAD_DIR: UPLOAD_DIR,
          AVATAR_UPLOAD_DIR: join(UPLOAD_DIR, 'avatars'),
          BASE_URL: 'http://test.local',
          PROPERTY_IMAGE_MAX_SIZE: 1024,
          AVATAR_MAX_FILE_SIZE: 1024,
        })[key] ?? fallback,
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [PropertyImagesController, AvatarUploadController],
      providers: [
        PropertyImagesService,
        AvatarUploadService,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: ConfigService, useValue: config },
        {
          provide: UsersService,
          useValue: { updateAvatar: async () => undefined, findOne: async () => ({ id: USER_ID }) },
        },
        { provide: DuplicateDetectionService, useValue: {} },
        {
          provide: DocumentUploadService,
          useValue: {
            validateMagicBytes: () => true,
            scanForThreats: () => ({ safe: true }),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockJwtAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(UPLOAD_DIR, { recursive: true, force: true });
  });

  it('uploads a property image through multipart, sharp, persistence, and URLs', async () => {
    const response = await request(app.getHttpServer())
      .post(`/properties/${PROPERTY_ID}/images`)
      .set('Authorization', 'Bearer e2e')
      .attach('images', PNG, 'house.png')
      .expect(201);

    expect(response.body.uploaded).toBe(1);
    expect(response.body.items[0].url).toMatch(/^http:\/\/test\.local\/uploads\/properties\//);
    expect(response.body.items[0].mimeType).toBe('image/webp');
    expect(await fs.readdir(join(UPLOAD_DIR, PROPERTY_ID))).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^thumbnail_.*\.webp$/),
        expect.stringMatching(/^full_.*\.avif$/),
      ]),
    );
  });

  it('rejects invalid types, oversized files, and the 30-image property limit', async () => {
    await request(app.getHttpServer())
      .post(`/properties/${PROPERTY_ID}/images`)
      .set('Authorization', 'Bearer e2e')
      .attach('images', Buffer.from('not an image'), 'bad.txt')
      .expect(400);

    await request(app.getHttpServer())
      .post(`/properties/${PROPERTY_ID}/images`)
      .set('Authorization', 'Bearer e2e')
      .attach('images', Buffer.alloc(1025), 'large.png')
      .expect(400);

    fakePrisma.images.push(
      ...Array.from({ length: 29 }, (_, index) => ({ propertyId: PROPERTY_ID, order: index + 1 })),
    );
    await request(app.getHttpServer())
      .post(`/properties/${PROPERTY_ID}/images`)
      .set('Authorization', 'Bearer e2e')
      .attach('images', PNG, 'limit.png')
      .expect(400);
  });

  it('resizes an avatar and persists its URL and all variants', async () => {
    const largePng = await sharp({
      create: { width: 400, height: 300, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    const response = await request(app.getHttpServer())
      .post('/users/avatar/upload')
      .set('Authorization', 'Bearer e2e')
      .attach('avatar', largePng, 'avatar.png')
      .expect(201);

    expect(response.body.avatarUrl).toContain('/uploads/avatars/');
    const filename = response.body.avatarUrl.split('/').pop();
    const avatarDir = join(UPLOAD_DIR, 'avatars', USER_ID);
    for (const [name, size] of Object.entries({ small: 64, medium: 128, large: 256 })) {
      const image = await sharp(join(avatarDir, `${name}_${filename}`)).metadata();
      expect(image.width).toBe(size);
      expect(image.height).toBe(size);
    }
  });

  it('rejects an avatar with an unsupported type or size', async () => {
    await request(app.getHttpServer())
      .post('/users/avatar/upload')
      .set('Authorization', 'Bearer e2e')
      .attach('avatar', Buffer.from('bad'), 'avatar.gif')
      .expect(400);

    await request(app.getHttpServer())
      .post('/users/avatar/upload')
      .set('Authorization', 'Bearer e2e')
      .attach('avatar', Buffer.alloc(1025), 'avatar.png')
      .expect(400);
  });
});
