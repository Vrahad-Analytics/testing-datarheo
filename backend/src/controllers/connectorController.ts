import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { testConnection, CONNECTOR_SPECS, assertValidConnectorConfig } from '../services/connectorRuntime';

const prisma = new PrismaClient();

export const connectorController = {
  async listConnectors(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const connectors = await prisma.connectorConfig.findMany({
        where: {
          organizationId: req.organizationId
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({
        success: true,
        data: { connectors }
      });
    } catch (error) {
      next(error);
    }
  },

  async getCatalog(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json({
        success: true,
        data: {
          sources: CONNECTOR_SPECS.filter((s) => s.type === 'SOURCE'),
          destinations: CONNECTOR_SPECS.filter((s) => s.type === 'DESTINATION')
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async createConnector(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { name, type, connectorName, config } = req.body;

      try {
        const spec = CONNECTOR_SPECS.find((s) => s.name === connectorName);
        if (spec && spec.type !== type) {
          throw new Error(`Connector "${connectorName}" is a ${spec.type}, not ${type}`);
        }
        assertValidConnectorConfig(connectorName, config || {});
      } catch (e: any) {
        throw new AppError(e.message, 400);
      }

      const connector = await prisma.connectorConfig.create({
        data: {
          name,
          type,
          connectorName,
          config,
          organizationId: req.organizationId!,
          userId: req.userId
        }
      });

      res.status(201).json({
        success: true,
        data: { connector }
      });
    } catch (error) {
      next(error);
    }
  },

  async getConnector(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const connector = await prisma.connectorConfig.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      if (!connector) {
        throw new AppError('Connector not found', 404);
      }

      // Check if user has access to this connector
      if (connector.organizationId !== req.organizationId && req.userRole !== 'SUPER_ADMIN') {
        throw new AppError('Access denied', 403);
      }

      res.json({
        success: true,
        data: { connector }
      });
    } catch (error) {
      next(error);
    }
  },

  async updateConnector(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, config, isActive } = req.body;

      const existing = await prisma.connectorConfig.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError('Connector not found', 404);
      }
      if (existing.organizationId !== req.organizationId && req.userRole !== 'SUPER_ADMIN') {
        throw new AppError('Access denied', 403);
      }

      if (config) {
        try {
          assertValidConnectorConfig(existing.connectorName, config);
        } catch (e: any) {
          throw new AppError(e.message, 400);
        }
      }

      const connector = await prisma.connectorConfig.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(config && { config }),
          ...(isActive !== undefined && { isActive })
        }
      });

      res.json({
        success: true,
        data: { connector }
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteConnector(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      await prisma.connectorConfig.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Connector deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  },

  async testConnector(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // This would typically use pydatarheo to test the connector
      // For now, return a mock response
      const connector = await prisma.connectorConfig.findUnique({
        where: { id }
      });

      if (!connector) {
        throw new AppError('Connector not found', 404);
      }

      const result = await testConnection(connector.connectorName, connector.config);
      const testResult = {
        success: result.success,
        message: result.message,
        timestamp: new Date().toISOString()
      };

      // Update connector with test result
      await prisma.connectorConfig.update({
        where: { id },
        data: {
          lastTested: new Date(),
          lastTestStatus: testResult.success ? 'SUCCESS' : 'FAILED'
        }
      });

      res.json({
        success: true,
        data: testResult
      });
    } catch (error) {
      next(error);
    }
  }
};
