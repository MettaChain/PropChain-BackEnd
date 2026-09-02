import { EmailProcessor } from './email.processor';
import { MailerService } from '@nestjs-modules/mailer';
import { Job } from 'bullmq';

describe('EmailProcessor', () => {
  let processor: EmailProcessor;
  let mailerService: jest.Mocked<MailerService>;

  beforeEach(() => {
    mailerService = { sendMail: jest.fn().mockResolvedValue(undefined) } as any;
    processor = new EmailProcessor(mailerService);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('process sends an email via mailerService', async () => {
    const job = {
      id: 'job-1',
      data: {
        to: 'user@example.com',
        subject: 'Hello',
        template: 'welcome',
        context: { name: 'Alice' },
      },
    } as unknown as Job;

    await processor.process(job);

    expect(mailerService.sendMail).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Hello',
      template: 'welcome',
      context: { name: 'Alice' },
    });
  });

  it('process rethrows error when mailerService fails', async () => {
    mailerService.sendMail.mockRejectedValueOnce(new Error('SMTP failure'));

    const job = {
      id: 'job-2',
      data: { to: 'fail@example.com', subject: 'Test', template: 'test', context: {} },
    } as unknown as Job;

    await expect(processor.process(job)).rejects.toThrow('SMTP failure');
  });
});
