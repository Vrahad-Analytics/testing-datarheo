import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

export const userController = {
  async getProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          organizationId: true,
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              plan: true,
              maxConnectors: true,
              maxPipelines: true
            }
          },
          createdAt: true,
          lastLogin: true
        }
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      res.json({
        success: true,
        data: { user }
      });
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { name, currentPassword, newPassword } = req.body;

      const updateData: any = {};

      if (name) {
        updateData.name = name;
      }

      if (currentPassword && newPassword) {
        const user = await prisma.user.findUnique({
          where: { id: req.userId }
        });

        if (!user) {
          throw new AppError('User not found', 404);
        }

        const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isValidPassword) {
          throw new AppError('Current password is incorrect', 400);
        }

        updateData.passwordHash = await bcrypt.hash(newPassword, 10);
      }

      const user = await prisma.user.update({
        where: { id: req.userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true
        }
      });

      res.json({
        success: true,
        data: { user }
      });
    } catch (error) {
      next(error);
    }
  },

  async getApiKeys(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const apiKeys = await prisma.apiKey.findMany({
        where: { userId: req.userId },
        select: {
          id: true,
          name: true,
          scopes: true,
          expiresAt: true,
          lastUsedAt: true,
          isActive: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({
        success: true,
        data: { apiKeys }
      });
    } catch (error) {
      next(error);
    }
  },

  async createApiKey(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { name, scopes, expiresAt } = req.body;

      // Generate a random API key
      const apiKey = `dr_${Buffer.from(randomUUID()).toString('base64').substring(0, 32)}`;
      const keyHash = await bcrypt.hash(apiKey, 10);

      const apiKeyRecord = await prisma.apiKey.create({
        data: {
          userId: req.userId!,
          name,
          scopes: scopes || ['read'],
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          keyHash
        }
      });

      // Return the actual key only once
      res.status(201).json({
        success: true,
        data: {
          apiKey,
          ...apiKeyRecord
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteApiKey(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      await prisma.apiKey.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'API key deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  // Admin functions
  async listUsers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 20, role, organizationId } = req.query;

      const where: any = {};

      if (role) {
        where.role = role;
      }

      if (organizationId) {
        where.organizationId = organizationId;
      }

      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          organizationId: true,
          organization: {
            select: {
              name: true,
              slug: true
            }
          },
          isActive: true,
          createdAt: true,
          lastLogin: true
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit)
      });

      const total = await prisma.user.count({ where });

      res.json({
        success: true,
        data: {
          users,
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

  async getUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          organizationId: true,
          organization: {
            select: {
              name: true,
              slug: true,
              plan: true
            }
          },
          isActive: true,
          createdAt: true,
          lastLogin: true
        }
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      res.json({
        success: true,
        data: { user }
      });
    } catch (error) {
      next(error);
    }
  },

  async updateUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, role, isActive } = req.body;

      const user = await prisma.user.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(role && { role }),
          ...(isActive !== undefined && { isActive })
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          updatedAt: true
        }
      });

      res.json({
        success: true,
        data: { user }
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      await prisma.user.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
};
