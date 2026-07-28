import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { UserRole } from '../types/prisma.types';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('DocumentsController', () => {
  let controller: DocumentsController;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let service: DocumentsService;

  const mockDocumentsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findAuthorizedById: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getVersions: jest.fn(),
    getVersion: jest.fn(),
    getExpiringDocuments: jest.fn(),
    markExpiredDocuments: jest.fn(),
    deleteExpired: jest.fn(),
    flagExpiryNotified: jest.fn(),
    signDocument: jest.fn(),
    verifySignature: jest.fn(),
    bulkDownload: jest.fn(),
  };

  const mockUser: AuthUserPayload = {
    sub: 'user-1',
    role: UserRole.USER,
    email: 'test@test.com',
    type: 'access',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [{ provide: DocumentsService, useValue: mockDocumentsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DocumentsController>(DocumentsController);
    service = module.get<DocumentsService>(DocumentsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create', async () => {
    mockDocumentsService.create.mockResolvedValue('created');
    expect(await controller.create({} as any, mockUser)).toBe('created');
  });

  it('findAll', async () => {
    mockDocumentsService.findAll.mockResolvedValue([]);
    expect(await controller.findAll(mockUser, {})).toEqual([]);
  });

  it('findOne', async () => {
    mockDocumentsService.findAuthorizedById.mockResolvedValue('doc');
    expect(await controller.findOne('id', mockUser)).toBe('doc');
  });

  it('update', async () => {
    mockDocumentsService.findAuthorizedById.mockResolvedValue('doc');
    mockDocumentsService.update.mockResolvedValue('updated');
    expect(await controller.update('id', {} as any, mockUser)).toBe('updated');
  });

  it('remove', async () => {
    mockDocumentsService.findAuthorizedById.mockResolvedValue('doc');
    mockDocumentsService.remove.mockResolvedValue('removed');
    expect(await controller.remove('id', mockUser)).toBe('removed');
  });

  it('getExpiring', async () => {
    mockDocumentsService.getExpiringDocuments.mockResolvedValue([]);
    expect(await controller.getExpiring('5')).toEqual([]);
  });

  it('markExpired', async () => {
    mockDocumentsService.markExpiredDocuments.mockResolvedValue('marked');
    expect(await controller.markExpired()).toBe('marked');
  });

  it('sign', async () => {
    mockDocumentsService.findAuthorizedById.mockResolvedValue('doc');
    mockDocumentsService.signDocument.mockResolvedValue('signed');
    expect(await controller.sign('id', {} as any, mockUser)).toBe('signed');
  });

  it('bulkDownload', async () => {
    mockDocumentsService.bulkDownload.mockResolvedValue('download');
    const res = {} as Response;
    expect(await controller.bulkDownload({ documentIds: [] }, res, mockUser)).toBe('download');
  });
});
