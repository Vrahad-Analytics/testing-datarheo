import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { testConnection } from '../services/connectorRuntime';

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
      // This would typically fetch from Airbyte's connector registry
      // For now, return a sample catalog
      const catalog = {
        sources: [
          { name: 'source-faker', displayName: 'Faker', description: 'Generate fake data' },
          { name: 'source-postgres', displayName: 'PostgreSQL', description: 'PostgreSQL database' },
          { name: 'source-mysql', displayName: 'MySQL', description: 'MySQL database' },
          { name: 'source-s3', displayName: 'Amazon S3', description: 'Amazon S3 storage' }
        ],
        destinations: [
          { name: 'destination-duckdb', displayName: 'DuckDB', description: 'DuckDB database' },
          { name: 'destination-postgres', displayName: 'PostgreSQL', description: 'PostgreSQL database' },
          { name: 'destination-databricks', displayName: 'Databricks', description: 'Databricks SQL warehouse (Delta table)' },
          { name: 'destination-snowflake', displayName: 'Snowflake', description: 'Snowflake data warehouse' },
          { name: 'destination-bigquery', displayName: 'BigQuery', description: 'Google BigQuery' }
        ]
      };

      res.json({
        success: true,
        data: catalog
      });
    } catch (error) {
      next(error);
    }
  },

  async createConnector(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { name, type, connectorName, config } = req.body;

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
