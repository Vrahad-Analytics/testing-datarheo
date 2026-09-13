import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

export const jobController = {
  async listJobs(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { pipelineId, status, page = 1, limit = 20 } = req.query;

      const where: any = {};

      if (pipelineId) {
        where.pipelineId = pipelineId;
      }

      if (status) {
        where.status = status;
      }

      // Filter by organization if not super admin
      if (req.userRole !== 'SUPER_ADMIN') {
        where.pipeline = {
          organizationId: req.organizationId
        };
      }

      const jobs = await prisma.job.findMany({
        where,
        include: {
          pipeline: {
            select: {
              id: true,
              name: true
            }
          },
          creator: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit)
      });

      const total = await prisma.job.count({ where });

      res.json({
        success: true,
        data: {
          jobs,
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

  async getJob(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const job = await prisma.job.findUnique({
        where: { id },
        include: {
          pipeline: {
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
          },
          creator: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      if (!job) {
        throw new AppError('Job not found', 404);
      }

      // Check access
      if (job.pipeline.organizationId !== req.organizationId && req.userRole !== 'SUPER_ADMIN') {
        throw new AppError('Access denied', 403);
      }

      res.json({
        success: true,
        data: { job }
      });
    } catch (error) {
      next(error);
    }
  },

  async cancelJob(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const job = await prisma.job.findUnique({
        where: { id },
        include: { pipeline: { select: { organizationId: true } } }
      });

      if (!job) {
        throw new AppError('Job not found', 404);
      }

      if (job.pipeline.organizationId !== req.organizationId && req.userRole !== 'SUPER_ADMIN') {
        throw new AppError('Access denied', 403);
      }

      if (job.status !== 'PENDING' && job.status !== 'RUNNING') {
        throw new AppError('Cannot cancel a job that is not pending or running', 400);
      }

      const updatedJob = await prisma.job.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          completedAt: new Date()
        }
      });

      // Here you would also cancel the Airflow DAG run if it's running

      res.json({
        success: true,
        data: { job: updatedJob }
      });
    } catch (error) {
      next(error);
    }
  },

  async getJobLogs(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { level, page = 1, limit = 100 } = req.query;

      const job = await prisma.job.findUnique({
        where: { id },
        include: { pipeline: { select: { organizationId: true } } }
      });

      if (!job) {
        throw new AppError('Job not found', 404);
      }

      if (job.pipeline.organizationId !== req.organizationId && req.userRole !== 'SUPER_ADMIN') {
        throw new AppError('Access denied', 403);
      }

      const where: any = { jobId: id };

      if (level) {
        where.level = level;
      }

      const logs = await prisma.jobLog.findMany({
        where,
        orderBy: { timestamp: 'asc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit)
      });

      const total = await prisma.jobLog.count({ where });

      res.json({
        success: true,
        data: {
          logs,
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
  }
};
