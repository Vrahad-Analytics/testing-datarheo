import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

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

      if (sourceConfig.type !== 'SOURCE') {
        throw new AppError('Source connector must be of type SOURCE', 400);
      }

      if (destConfig.type !== 'DESTINATION') {
        throw new AppError('Destination connector must be of type DESTINATION', 400);
      }

      const pipeline = await prisma.pipeline.create({
        data: {
          name,
          description,
          sourceConfigId,
          destinationConfigId,
          organizationId: req.organizationId!,
          creatorId: req.userId!,
          schedule,
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
      const { name, description, schedule, config, streams, status } = req.body;

      const pipeline = await prisma.pipeline.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(schedule !== undefined && { schedule }),
          ...(config && { config }),
          ...(streams && { streams }),
          ...(status && { status })
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

      // Create a job for this pipeline run
      const job = await prisma.job.create({
        data: {
          pipelineId: id,
          creatorId: req.userId!,
          status: 'PENDING',
          config: config || {}
        }
      });

      // Here you would trigger Airflow to run the pipeline
      // For now, we'll just return the job
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

      const pipeline = await prisma.pipeline.update({
        where: { id },
        data: { status: 'ACTIVE' }
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
