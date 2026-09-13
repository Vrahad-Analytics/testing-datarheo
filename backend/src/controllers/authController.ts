import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

export const authController = {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, name, organizationName } = req.body;

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        throw new AppError('User already exists', 400);
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create organization if provided
      let organizationId: string | undefined;
      if (organizationName) {
        const organization = await prisma.organization.create({
          data: {
            name: organizationName,
            slug: organizationName.toLowerCase().replace(/\s+/g, '-')
          }
        });
        organizationId = organization.id;
      }

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name,
          organizationId,
          role: organizationId ? 'ADMIN' : 'USER'
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          organizationId: true,
          createdAt: true
        }
      });

      // Generate tokens
      const accessToken = jwt.sign(
        { userId: user.id, role: user.role, organizationId: user.organizationId },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '15m' }
      );

      const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      res.status(201).json({
        success: true,
        data: {
          user,
          accessToken,
          refreshToken
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;

      // Find user
      const user = await prisma.user.findUnique({
        where: { email }
      });

      if (!user) {
        throw new AppError('Invalid credentials', 401);
      }

      // Check password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        throw new AppError('Invalid credentials', 401);
      }

      // Check if user is active
      if (!user.isActive) {
        throw new AppError('Account is deactivated', 403);
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
      });

      // Generate tokens
      const accessToken = jwt.sign(
        { userId: user.id, role: user.role, organizationId: user.organizationId },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '15m' }
      );

      const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            organizationId: user.organizationId
          },
          accessToken,
          refreshToken
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    // In a real implementation, you might want to invalidate the refresh token
    // For now, we'll just return success
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  },

  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw new AppError('Refresh token required', 400);
      }

      const decoded = jwt.verify(
        refreshToken,
        process.env.JWT_SECRET || 'your-secret-key'
      ) as { userId: string };

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId }
      });

      if (!user || !user.isActive) {
        throw new AppError('Invalid refresh token', 401);
      }

      const accessToken = jwt.sign(
        { userId: user.id, role: user.role, organizationId: user.organizationId },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '15m' }
      );

      res.json({
        success: true,
        data: { accessToken }
      });
    } catch (error) {
      next(error);
    }
  },

  async getCurrentUser(req: AuthRequest, res: Response, next: NextFunction) {
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
              plan: true
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
  }
};
