import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { assertValidConnectorConfig } from '../services/connectorRuntime';
import { isValidCron, nextOccurrence } from '../services/cron';

const prisma = new PrismaClient();

async function assertPipelineConnector(connector: any, expectedType: 'SOURCE' | 'DESTINATION') {
  if (!connector) {
    throw new AppError('Connector not found', 404);
  }
  if (connector.type !== expectedType) {
    throw new AppError(`Connector must be of type ${expectedType}`, 400);
  }
  try {
    assertValidConnectorConfig(connector.connectorName, connector.config);
  } catch (e: any) {
    throw new AppError(`Connector "${connector.name}" (${connector.connectorName}): ${e.message}`, 400);
  }
}

export const pipelineController = {
  async listPipelines(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { status, page = 1, limit = 20 } = req.query;

      const where: any = {
        organizationId: req.organizationId
      };

      if (status) {
        where.status = status;
      }

      const pipelines = await prisma.pipeline.findMany({
        where,
        include: {
          sourceConfig: {
            select: {
              id: true,
              name: true,
              connectorName: true,
              type: true
            }
          },
          destinationConfig: {
            select: {
              id: true,
              name: true,
              connectorName: true,
              type: true
            }
          },
          creator: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          jobs: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              status: true,
              startedAt: true,
              completedAt: true,
              recordsRead: true,
              recordsWritten: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit)
      });

      const total = await prisma.pipeline.count({ where });

      res.json({
        success: true,
        data: {
          pipelines,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async createPipeline(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { name, description, sourceConfigId, destinationConfigId, schedule, config, streams } = req.body;

      // Verify connectors belong to the organization
      const sourceConfig = await prisma.connectorConfig.findUnique({
        where: { id: sourceConfigId }
      });

      const destConfig = await prisma.connectorConfig.findUnique({
        where: { id: destinationConfigId }
      });

      if (!sourceConfig || !destConfig) {
        throw new AppError('Connector not found', 404);
      }

      if (sourceConfig.organizationId !== req.organizationId || 
          destConfig.organizationId !== req.organizationId) {
        throw new AppError('Access denied', 403);
      }

      await assertPipelineConnector(sourceConfig, 'SOURCE');
      await assertPipelineConnector(destConfig, 'DESTINATION');

      if (schedule && !isValidCron(schedule)) {
        throw new AppError(`Invalid cron schedule: "${schedule}" (expected 5 fields: minute hour day month weekday)`, 400);
      }
      const nextRunAt = schedule ? nextOccurrence(schedule) : null;

      const pipeline = await prisma.pipeline.create({
        data: {
          name,
          description,
          sourceConfigId,
          destinationConfigId,
          organizationId: req.organizationId!,
          creatorId: req.userId!,
          schedule,
          nextRunAt,
          config,
          streams
        },
        include: {
          sourceConfig: {
            select: {
              id: true,
              name: true,
              connectorName: true
            }
          },
          destinationConfig: {
            select: {
              id: true,
              name: true,
              connectorName: true
            }
          }
        }
      });

      res.status(201).json({
        success: true,
        data: { pipeline }
      });
    } catch (error) {
      next(error);
    }
  },

  async getPipeline(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const pipeline = await prisma.pipeline.findUnique({
        where: { id },
        include: {
          sourceConfig: true,
          destinationConfig: true,
          creator: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          jobs: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: {
              creator: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      if (!pipeline) {
        throw new AppError('Pipeline not found', 404);
      }

      if (pipeline.organizationId !== req.organizationId && req.userRole !== 'SUPER_ADMIN') {
        throw new AppError('Access denied', 403);
      }

      res.json({
        success: true,
        data: { pipeline }
      });
    } catch (error) {
      next(error);
    }
  },

  async updatePipeline(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, description, schedule, config, streams, status, sourceConfigId, destinationConfigId } = req.body;

      const existing = await prisma.pipeline.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError('Pipeline not found', 404);
      }
      if (existing.organizationId !== req.organizationId && req.userRole !== 'SUPER_ADMIN') {
        throw new AppError('Access denied', 403);
      }

      // Validate connector changes the same way createPipeline does
      for (const [configId, expectedType] of [
        [sourceConfigId, 'SOURCE'],
        [destinationConfigId, 'DESTINATION']
      ] as const) {
        if (!configId) continue;
        const connector = await prisma.connectorConfig.findUnique({ where: { id: configId } });
        if (!connector || (connector.organizationId !== req.organizationId && req.userRole !== 'SUPER_ADMIN')) {
          throw new AppError('Connector not found', 404);
        }
        await assertPipelineConnector(connector, expectedType);
      }

      if (schedule !== undefined && schedule && !isValidCron(schedule)) {
        throw new AppError(`Invalid cron schedule: "${schedule}" (expected 5 fields: minute hour day month weekday)`, 400);
      }
      const nextRunAt =
        schedule !== undefined
          ? schedule
            ? nextOccurrence(schedule)
            : null
          : status === 'ACTIVE' && existing.schedule
            ? nextOccurrence(existing.schedule)
            : undefined;

      const pipeline = await prisma.pipeline.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(schedule !== undefined && { schedule }),
          ...(nextRunAt !== undefined && { nextRunAt }),
          ...(config && { config }),
          ...(streams && { streams }),
          ...(status && { status }),
          ...(sourceConfigId && { sourceConfigId }),
          ...(destinationConfigId && { destinationConfigId })
        }
      });

      res.json({
        success: true,
        data: { pipeline }
      });
    } catch (error) {
      next(error);
    }
  },

  async deletePipeline(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const existing = await prisma.pipeline.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError('Pipeline not found', 404);
      }
      if (existing.organizationId !== req.organizationId && req.userRole !== 'SUPER_ADMIN') {
        throw new AppError('Access denied', 403);
      }

      await prisma.pipeline.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Pipeline deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  async runPipeline(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { config } = req.body;

      const pipeline = await prisma.pipeline.findUnique({ where: { id } });
      if (!pipeline) {
        throw new AppError('Pipeline not found', 404);
      }
      if (pipeline.organizationId !== req.organizationId && req.userRole !== 'SUPER_ADMIN') {
        throw new AppError('Access denied', 403);
      }
      if (pipeline.status === 'PAUSED' || pipeline.status === 'ARCHIVED') {
        throw new AppError(`Pipeline is ${pipeline.status.toLowerCase()} — resume it before running`, 400);
      }

      const open = await prisma.job.count({
        where: { pipelineId: id, status: { in: ['PENDING', 'RUNNING'] } }
      });
      if (open > 0) {
        throw new AppError('A run is already queued or in progress for this pipeline', 409);
      }

      // The in-process job worker picks up PENDING jobs within a few seconds
      const job = await prisma.job.create({
        data: {
          pipelineId: id,
          creatorId: req.userId!,
          status: 'PENDING',
          config: { ...(config || {}), trigger: 'manual' }
        }
      });

      res.status(201).json({
        success: true,
        data: { job }
      });
    } catch (error) {
      next(error);
    }
  },

  async pausePipeline(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const existing = await prisma.pipeline.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError('Pipeline not found', 404);
      }
      if (existing.organizationId !== req.organizationId && req.userRole !== 'SUPER_ADMIN') {
        throw new AppError('Access denied', 403);
      }

      const pipeline = await prisma.pipeline.update({
        where: { id },
        data: { status: 'PAUSED' }
      });

      res.json({
        success: true,
        data: { pipeline }
      });
    } catch (error) {
      next(error);
    }
  },

  async resumePipeline(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const existing = await prisma.pipeline.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError('Pipeline not found', 404);
      }
      if (existing.organizationId !== req.organizationId && req.userRole !== 'SUPER_ADMIN') {
        throw new AppError('Access denied', 403);
      }

      const pipeline = await prisma.pipeline.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          nextRunAt: existing.schedule ? nextOccurrence(existing.schedule) : existing.nextRunAt
        }
      });

      res.json({
        success: true,
        data: { pipeline }
      });
    } catch (error) {
      next(error);
    }
  }
};
