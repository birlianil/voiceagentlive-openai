import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';

export interface OutboxJobData {
  outboxId: string;
}

export interface OutboxQueueOptions {
  redisUrl: string;
  queueName?: string;
  processor: (job: Job<OutboxJobData>) => Promise<void>;
}

export interface OutboxQueueHandle {
  enqueue: (outboxId: string, attempts: number, backoffMs: number) => Promise<void>;
  close: () => Promise<void>;
}

export function createOutboxQueue(options: OutboxQueueOptions): OutboxQueueHandle {
  const queueName = options.queueName || 'tools-outbox-webhooks';
  const connection = new Redis(options.redisUrl, {
    maxRetriesPerRequest: null,
  });

  const queue = new Queue<OutboxJobData>(queueName, { connection });

  const worker = new Worker<OutboxJobData>(queueName, options.processor, {
    connection,
    concurrency: 2,
  });

  worker.on('failed', (job, err) => {
    const jobId = job?.id || 'unknown';
    console.error(`[outbox:failed] job=${jobId} ${err.message}`);
  });

  return {
    enqueue: async (outboxId: string, attempts: number, backoffMs: number) => {
      await queue.add(
        'dispatch-webhook',
        { outboxId },
        {
          attempts,
          removeOnComplete: true,
          removeOnFail: false,
          backoff: {
            type: 'exponential',
            delay: backoffMs,
          },
        },
      );
    },
    close: async () => {
      await worker.close();
      await queue.close();
      await connection.quit();
    },
  };
}
