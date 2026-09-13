import { PrismaClient, LogLevel } from '@prisma/client';
import { logger } from '../utils/logger';
import { runSource, runDestination } from './connectorRuntime';

const prisma = new PrismaClient();

const POLL_INTERVAL_MS = 5000;

let timer: NodeJS.Timeout | null = null;
let processing = false;

export function startJobWorker() {
  if (timer) return;
  timer = setInterval(tick, POLL_INTERVAL_MS);
  logger.info(`Job worker started (polling every ${POLL_INTERVAL_MS / 1000}s)`);
  // Pick up anything already queued without waiting for the first interval
  tick();
}

export function stopJobWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function tick() {
  if (processing) return;
  processing = true;
  try {
    // Drain the queue one job at a time
    while (await processNextJob()) {
      /* keep going */
    }
  } catch (error: any) {
    logger.error(`Job worker tick failed: ${error.message}`);
  } finally {
    processing = false;
  }
}

async function processNextJob(): Promise<boolean> {
  const job = await prisma.job.findFirst({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' }
  });
  if (!job) return false;

  // Claim atomically so concurrent workers never run the same job
  const claimed = await prisma.job.updateMany({
    where: { id: job.id, status: 'PENDING' },
    data: { status: 'RUNNING', startedAt: new Date() }
  });
  if (claimed.count === 0) return true;

  const addLog = async (level: LogLevel | string, message: string) => {
    await prisma.jobLog
      .create({ data: { jobId: job.id, level: level as LogLevel, message } })
      .catch(() => {});
  };

  logger.info(`Job ${job.id}: started`);
  try {
    const pipeline = await prisma.pipeline.findUnique({
      where: { id: job.pipelineId },
      include: { sourceConfig: true, destinationConfig: true }
    });
    if (!pipeline) throw new Error('Pipeline not found');
    if (pipeline.status === 'PAUSED' || pipeline.status === 'ARCHIVED') {
      throw new Error(`Pipeline is ${pipeline.status}; resume it before running`);
    }

    await addLog(
      'INFO',
      `Starting sync: ${pipeline.sourceConfig.connectorName} -> ${pipeline.destinationConfig.connectorName}`
    );

    const source = await runSource(
      pipeline.sourceConfig.connectorName,
      pipeline.sourceConfig.config,
      addLog
    );
    await prisma.job.update({
      where: { id: job.id },
      data: { recordsRead: source.records.length }
    });
    await addLog('INFO', `Read ${source.records.length} records from stream "${source.stream}"`);

    const written = await runDestination(
      pipeline.destinationConfig.connectorName,
      pipeline.destinationConfig.config,
      source.records,
      source.stream,
      addLog
    );

    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'SUCCESS', completedAt: new Date(), recordsWritten: written }
    });
    await prisma.pipeline.update({
      where: { id: pipeline.id },
      data: { lastRunAt: new Date() }
    });
    await addLog('INFO', `Sync complete: ${written} records written`);
    logger.info(`Job ${job.id}: SUCCESS (${written} records)`);
  } catch (error: any) {
    const message = error?.message || 'Unknown error';
    await addLog('ERROR', message);
    await prisma.job
      .update({
        where: { id: job.id },
        data: { status: 'FAILED', completedAt: new Date(), errorMessage: message }
      })
      .catch(() => {});
    logger.error(`Job ${job.id}: FAILED — ${message}`);
  }
  return true;
}
