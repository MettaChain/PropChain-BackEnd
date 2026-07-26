// @ts-nocheck

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

const KNOWN_QUEUES = ['mail', 'export', 'email-digest'] as const;

@Injectable()
export class QueueMonitoringService {
  private readonly logger = new Logger(QueueMonitoringService.name);

  constructor(
    @InjectQueue('mail') private readonly mailQueue: Queue,
  ) {}

  async getAllQueues() {
    const queues: any[] = [];

    for (const queueName of KNOWN_QUEUES) {
      try {
        const queue = this.getQueueByName(queueName);
        if (!queue) continue;

        const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
          queue.getPausedCount(),
        ]);

        queues.push({
          name: queueName,
          counts: { waiting, active, completed, failed, delayed, paused },
        });
      } catch (error) {
        this.logger.error(`Failed to get stats for queue ${queueName}: ${error.message}`);
        queues.push({
          name: queueName,
          counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
          error: error.message,
        });
      }
    }

    return { queues };
  }

  async getQueueByName(name: string): Promise<Queue | null> {
    const queues: Record<string, Queue> = {
      mail: this.mailQueue,
    };
    return queues[name] ?? null;
  }

  async getFailedJobs(queueName: string) {
    const queue = await this.getQueueByName(queueName);
    if (!queue) {
      throw new NotFoundException(`Queue '${queueName}' not found`);
    }

    const jobs = await queue.getFailed(0, 50);
    return {
      queue: queueName,
      total: await queue.getFailedCount(),
      jobs: jobs.map((job: any) => ({
        id: job.id,
        name: job.name,
        data: job.data,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace?.slice(-5),
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        finishedOn: job.finishedOn,
      })),
    };
  }

  async retryJob(queueName: string, jobId: string) {
    const queue = await this.getQueueByName(queueName);
    if (!queue) {
      throw new NotFoundException(`Queue '${queueName}' not found`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job '${jobId}' not found in queue '${queueName}'`);
    }

    await job.retry();
    return { message: `Job '${jobId}' retried successfully`, queue: queueName };
  }

  async retryAllFailedJobs(queueName: string) {
    const queue = await this.getQueueByName(queueName);
    if (!queue) {
      throw new NotFoundException(`Queue '${queueName}' not found`);
    }

    const jobs = await queue.getFailed();
    let retried = 0;
    for (const job of jobs) {
      await job.retry();
      retried++;
    }

    return { message: `Retried ${retried} failed jobs`, queue: queueName, retriedCount: retried };
  }

  async removeJob(queueName: string, jobId: string) {
    const queue = await this.getQueueByName(queueName);
    if (!queue) {
      throw new NotFoundException(`Queue '${queueName}' not found`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job '${jobId}' not found in queue '${queueName}'`);
    }

    await job.remove();
    return { message: `Job '${jobId}' removed successfully`, queue: queueName };
  }

  async getQueueMetrics() {
    const metrics: any[] = [];

    for (const queueName of KNOWN_QUEUES) {
      const queue = await this.getQueueByName(queueName);
      if (!queue) continue;

      try {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
        ]);

        metrics.push({
          queue: queueName,
          depth: waiting + active + delayed,
          waiting,
          active,
          completed,
          failed,
          delayed,
        });
      } catch (error) {
        this.logger.error(`Failed to get metrics for queue ${queueName}: ${error.message}`);
      }
    }

    return { metrics };
  }
}
