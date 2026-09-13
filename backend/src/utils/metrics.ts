import { Request, Response } from 'express';
import * as promClient from 'prom-client';

// Create a Registry to register the metrics
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [register]
});

const pipelineRunsTotal = new promClient.Counter({
  name: 'pipeline_runs_total',
  help: 'Total number of pipeline runs',
  labelNames: ['status'],
  registers: [register]
});

const connectorTestsTotal = new promClient.Counter({
  name: 'connector_tests_total',
  help: 'Total number of connector tests',
  labelNames: ['status'],
  registers: [register]
});

export const metricsMiddleware = (req: Request, res: Response, next: any) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode.toString())
      .observe(duration);
  });
  
  next();
};

export const metricsEndpoint = async (req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
};

export const incrementPipelineRun = (status: string) => {
  pipelineRunsTotal.labels(status).inc();
};

export const incrementConnectorTest = (status: string) => {
  connectorTestsTotal.labels(status).inc();
};

export const setActiveConnections = (count: number) => {
  activeConnections.set(count);
};
