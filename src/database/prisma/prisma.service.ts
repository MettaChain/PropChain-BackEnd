import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private configService: ConfigService) {
    const databaseUrl = configService.get<string>('DATABASE_URL');

    // Connection pooling configuration via URL parameters
    // Prisma uses the connection URL to configure pooling
    // Example: postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=30
    super({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
    });
  }

  async onModuleInit() {
    this.logger.log('Connecting to database...');

    // Set up query logging in development
    if (this.configService.get<string>('NODE_ENV') === 'development') {
      (this as any).$on('query', (e: any) => {
        this.logger.debug(`Query: ${e.query}`);
        this.logger.debug(`Duration: ${e.duration}ms`);
      });
    }

    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting from database...');
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  /**
   * Clean database for testing purposes
   * WARNING: This will delete all data from the database
   */
  async cleanDatabase() {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('Cannot clean database in production environment');
    }

    const models = Reflect.ownKeys(this).filter(
      key => typeof key === 'string' && !key.startsWith('_') && !key.startsWith('$'),
    );

    return Promise.all(
      models.map(modelKey => {
        const model = this[modelKey as string];
        if (model && typeof model.deleteMany === 'function') {
          return model.deleteMany();
        }
        return Promise.resolve();
      }),
    );
  }

  /**
   * Health check for database connection
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Database health check failed', error);
      return false;
    }
  }

  /**
   * Execute a transaction with automatic retry logic
   */
  async executeTransaction<T>(
    fn: (prisma: Prisma.TransactionClient) => Promise<T>,
    options?: {
      maxRetries?: number;
      timeout?: number;
    },
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? 3;
    const timeout = options?.timeout ?? 5000;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.$transaction(fn, {
          timeout,
          maxWait: timeout,
        });
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Transaction attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);

        if (attempt < maxRetries) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
      }
    }

    throw lastError;
  }
}
