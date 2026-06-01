import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { PrismaService } from '../database/prisma.service';
import {
  RecordTransactionOnBlockchainDto,
  BlockchainNetwork,
  VerifyBlockchainTransactionDto,
} from './dto/blockchain.dto';

describe('BlockchainService', () => {
  let service: BlockchainService;
  let configService: ConfigService;
  let prismaService: PrismaService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        BLOCKCHAIN_ENABLED: 'true',
        BLOCKCHAIN_NETWORK: BlockchainNetwork.SEPOLIA,
        BLOCKCHAIN_RPC_URL: 'https://sepolia.infura.io/v3/test',
        BLOCKCHAIN_CONTRACT_ADDRESS: '0x1234567890123456789012345678901234567890',
        BLOCKCHAIN_PRIVATE_KEY: 'test-private-key',
      };
      return config[key] ?? defaultValue;
    }),
  };

  const mockPrismaService = {
    transaction: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    transactionHistory: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlockchainService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<BlockchainService>(BlockchainService);
    configService = module.get<ConfigService>(ConfigService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateBlockchainHash', () => {
    it('should generate a consistent keccak256-like hash', () => {
      const data = {
        transactionId: 'tx-123',
        propertyId: 'prop-456',
        buyerAddress: '0xBuyer',
        sellerAddress: '0xSeller',
        amount: 1000,
        timestamp: 1716812345678,
      };

      const hash1 = service.generateBlockchainHash(data);
      const hash2 = service.generateBlockchainHash(data);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different data', () => {
      const data1 = {
        transactionId: 'tx-123',
        propertyId: 'prop-456',
        buyerAddress: '0xBuyer',
        sellerAddress: '0xSeller',
        amount: 1000,
      };

      const data2 = {
        transactionId: 'tx-124',
        propertyId: 'prop-456',
        buyerAddress: '0xBuyer',
        sellerAddress: '0xSeller',
        amount: 1000,
      };

      const hash1 = service.generateBlockchainHash(data1);
      const hash2 = service.generateBlockchainHash(data2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle address normalization', () => {
      const data1 = {
        transactionId: 'tx-123',
        propertyId: 'prop-456',
        buyerAddress: '0xBUYER',
        sellerAddress: '0xSELLER',
        amount: 1000,
      };

      const data2 = {
        transactionId: 'tx-123',
        propertyId: 'prop-456',
        buyerAddress: '0xbuyer',
        sellerAddress: '0xseller',
        amount: 1000,
      };

      const hash1 = service.generateBlockchainHash(data1);
      const hash2 = service.generateBlockchainHash(data2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('generateDocumentHash', () => {
    it('should generate SHA256 hash for documents', () => {
      const content = 'test document content';
      const hash = service.generateDocumentHash(content);

      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should generate consistent hashes for same content', () => {
      const content = 'test document content';
      const hash1 = service.generateDocumentHash(content);
      const hash2 = service.generateDocumentHash(content);

      expect(hash1).toBe(hash2);
    });
  });

  describe('recordTransactionOnBlockchain', () => {
    const validDto: RecordTransactionOnBlockchainDto = {
      transactionId: 'tx-123',
      propertyId: 'prop-456',
      buyerAddress: '0x1234567890123456789012345678901234567890',
      sellerAddress: '0x0987654321098765432109876543210987654321',
      amount: 1000,
    };

    it('should validate required fields - reject missing transactionId', async () => {
      await expect(
        service.recordTransactionOnBlockchain({ ...validDto, transactionId: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate required fields - reject missing propertyId', async () => {
      await expect(
        service.recordTransactionOnBlockchain({ ...validDto, propertyId: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate buyer address format', async () => {
      await expect(
        service.recordTransactionOnBlockchain({ ...validDto, buyerAddress: 'invalid-address' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate seller address format', async () => {
      await expect(
        service.recordTransactionOnBlockchain({ ...validDto, sellerAddress: 'invalid-address' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate amount is positive', async () => {
      await expect(
        service.recordTransactionOnBlockchain({ ...validDto, amount: 0 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.recordTransactionOnBlockchain({ ...validDto, amount: -100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject recording for non-existent transaction', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null);

      await expect(
        service.recordTransactionOnBlockchain(validDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject recording for non-COMPLETED transaction', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-123',
        status: 'PENDING',
      });

      await expect(
        service.recordTransactionOnBlockchain(validDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept recording for COMPLETED transaction', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-123',
        status: 'COMPLETED',
      });
      mockPrismaService.transaction.update.mockResolvedValue({
        id: 'tx-123',
        blockchainHash: expect.any(String),
      });
      mockPrismaService.transactionHistory.create.mockResolvedValue({});

      const result = await service.recordTransactionOnBlockchain(validDto);

      expect(result).toHaveProperty('transactionHash');
      expect(result).toHaveProperty('blockchainHash');
      expect(result).toHaveProperty('explorerUrl');
      expect(result.status).toBe('pending');
      expect(mockPrismaService.transaction.update).toHaveBeenCalled();
      // Audit log should have been created
      expect(mockPrismaService.transactionHistory.create).toHaveBeenCalled();
    });

    it('should generate explorer URL for transaction', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-123',
        status: 'COMPLETED',
      });
      mockPrismaService.transaction.update.mockResolvedValue({
        id: 'tx-123',
        blockchainHash: expect.any(String),
      });
      mockPrismaService.transactionHistory.create.mockResolvedValue({});

      const result = await service.recordTransactionOnBlockchain(validDto);

      expect(result.explorerUrl).toContain('sepolia.etherscan.io');
      expect(result.explorerUrl).toContain('/tx/');
    });

    it('should handle disabled blockchain by recording locally', async () => {
      // Override config to disable blockchain
      const disabledConfig = {
        get: jest.fn((key: string, defaultValue?: any) => {
          const config: Record<string, any> = {
            BLOCKCHAIN_ENABLED: 'false',
            BLOCKCHAIN_NETWORK: BlockchainNetwork.SEPOLIA,
          };
          return config[key] ?? defaultValue;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BlockchainService,
          { provide: ConfigService, useValue: disabledConfig },
          { provide: PrismaService, useValue: mockPrismaService },
        ],
      }).compile();

      const disabledService = module.get<BlockchainService>(BlockchainService);

      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-123',
        status: 'COMPLETED',
      });
      mockPrismaService.transaction.update.mockResolvedValue({
        id: 'tx-123',
        blockchainHash: expect.any(String),
      });

      const result = await disabledService.recordTransactionOnBlockchain(validDto);

      expect(result.status).toBe('confirmed');
      expect(result.contractAddress).toBe('local');
    });
  });

  describe('verifyBlockchainTransaction', () => {
    it('should verify transaction and return result', async () => {
      const dto: VerifyBlockchainTransactionDto = {
        transactionHash: '0x123abc',
        network: BlockchainNetwork.SEPOLIA,
      };

      const result = await service.verifyBlockchainTransaction(dto);

      expect(result).toHaveProperty('verified');
      expect(result).toHaveProperty('transactionHash');
      expect(result).toHaveProperty('blockNumber');
      expect(result).toHaveProperty('status');
    });

    it('should reject invalid transaction hash (no 0x prefix)', async () => {
      const dto: VerifyBlockchainTransactionDto = {
        transactionHash: '123abc',
      };

      await expect(
        service.verifyBlockchainTransaction(dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject empty transaction hash', async () => {
      const dto: VerifyBlockchainTransactionDto = {
        transactionHash: '',
      };

      await expect(
        service.verifyBlockchainTransaction(dto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getBlockchainStats', () => {
    it('should retrieve blockchain statistics', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([
        {
          blockchainHash: '0xhash1',
          amount: { toNumber: () => 1000 },
          status: 'COMPLETED',
        },
        {
          blockchainHash: '0xhash2',
          amount: { toNumber: () => 2000 },
          status: 'PENDING',
        },
      ]);

      const stats = await service.getBlockchainStats();

      expect(stats).toHaveProperty('totalTransactions');
      expect(stats).toHaveProperty('confirmedTransactions');
      expect(stats).toHaveProperty('pendingTransactions');
      expect(stats).toHaveProperty('totalValue');
      expect(mockPrismaService.transaction.findMany).toHaveBeenCalled();
    });
  });

  describe('generateExplorerLink', () => {
    it('should generate transaction explorer link', () => {
      const hash = '0x123abc';
      const link = service.generateExplorerLink(hash, 'transaction');

      expect(link).toContain('sepolia.etherscan.io');
      expect(link).toContain('/tx/');
      expect(link).toContain(hash);
    });

    it('should generate address explorer link', () => {
      const address = '0xaddress123';
      const link = service.generateExplorerLink(address, 'address');

      expect(link).toContain('sepolia.etherscan.io');
      expect(link).toContain('/address/');
      expect(link).toContain(address);
    });
  });

  describe('isValidAddress', () => {
    it('should validate correct Ethereum addresses', () => {
      const validAddress = '0x1234567890123456789012345678901234567890';
      expect(service.isValidAddress(validAddress)).toBe(true);
    });

    it('should reject invalid addresses', () => {
      expect(service.isValidAddress('invalid')).toBe(false);
      expect(service.isValidAddress('0x123')).toBe(false);
      expect(service.isValidAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return service status', () => {
      const status = service.getStatus();

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('network');
      expect(status).toHaveProperty('contractAddress');
      expect(status).toHaveProperty('explorerUrl');
      expect(status.enabled).toBe(true);
      expect(status.network).toBe(BlockchainNetwork.SEPOLIA);
    });
  });

  describe('getCurrentNetwork', () => {
    it('should return current blockchain network', () => {
      const network = service.getCurrentNetwork();

      expect(network).toBe(BlockchainNetwork.SEPOLIA);
    });
  });
});
