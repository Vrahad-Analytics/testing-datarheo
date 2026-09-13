# DataRheo Platform Deployment Guide

This guide covers how to deploy the DataRheo Platform in different environments.

## Prerequisites

- Docker and Docker Compose (for local development)
- Kubernetes cluster (for production)
- kubectl and Helm (for production)
- Domain name with DNS configured (for production)

## Local Development Setup

### 1. Run the Setup Script

```bash
cd testing-datarheo
./scripts/setup.sh
```

This will:
- Check for required tools
- Create environment files
- Install dependencies
- Generate Prisma client
- Build Docker images

### 2. Configure Environment

Edit `backend/.env` with your configuration:

```env
NODE_ENV=development
PORT=8000
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/datarheo?schema=public
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

### 3. Start the Platform

```bash
docker-compose -f docker/docker-compose.yml up -d
```

### 4. Access the Platform

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Airflow: http://localhost:8080 (admin/admin)
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### 5. Start Monitoring (Optional)

```bash
docker-compose -f docker/docker-compose.monitoring.yml up -d
```

- Grafana: http://localhost:3001 (admin/admin)
- Prometheus: http://localhost:9090

## Production Deployment

### 1. Prepare Your Environment

Set up your Kubernetes cluster and configure kubectl:

```bash
kubectl config use-context your-cluster-context
```

### 2. Create Secrets

Create Kubernetes secrets for sensitive data:

```bash
kubectl create secret generic datarheo-secrets \
  --from-literal=database-url="postgresql://user:password@host:5432/datarheo" \
  --from-literal=jwt-secret="your-production-jwt-secret" \
  --namespace datarheo
```

### 3. Deploy Infrastructure

Run the deployment script:

```bash
./scripts/deploy.sh
```

Or manually deploy components:

```bash
# Deploy PostgreSQL
helm upgrade --install datarheo-postgres bitnami/postgresql \
  --namespace datarheo \
  --set auth.postgresPassword=your-secure-password \
  --set auth.database=datarheo \
  --set persistence.enabled=true

# Deploy Redis
helm upgrade --install datarheo-redis bitnami/redis \
  --namespace datarheo \
  --set auth.enabled=false \
  --set persistence.enabled=true

# Deploy Airflow
helm upgrade --install datarheo-airflow apache-airflow/airflow \
  --namespace datarheo \
  --set executor=CeleryExecutor \
  --set postgresql.enabled=false \
  --set postgresql.host=datarheo-postgres-postgresql.datarheo.svc.cluster.local \
  --set postgresql.port=5432 \
  --set postgresql.user=postgres \
  --set postgresql.password=your-secure-password \
  --set postgresql.database=datarheo \
  --set redis.enabled=false \
  --set redis.host=datarheo-redis-master.datarheo.svc.cluster.local \
  --set redis.port=6379
```

### 4. Build and Push Docker Images

```bash
# Build backend
docker build -t your-registry/datarheo-backend:latest backend/
docker push your-registry/datarheo-backend:latest

# Build frontend
docker build -t your-registry/datarheo-frontend:latest frontend/
docker push your-registry/datarheo-frontend:latest
```

### 5. Deploy Applications

```bash
kubectl apply -f docker/kubernetes/backend-deployment.yaml
kubectl apply -f docker/kubernetes/frontend-deployment.yaml
kubectl apply -f docker/kubernetes/ingress.yaml
```

### 6. Configure DNS

Point your domain to the load balancer IP:
- datarheo.yourdomain.com → Frontend
- api.datarheo.yourdomain.com → Backend API

### 7. SSL/TLS Configuration

The ingress configuration uses cert-manager for automatic SSL. Ensure cert-manager is installed:

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

## Monitoring

### Production Monitoring Setup

Deploy Prometheus and Grafana:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm upgrade --install datarheo-prometheus prometheus-community/kube-prometheus-stack \
  --namespace datarheo \
  --set grafana.adminPassword=your-secure-password
```

Access Grafana at https://grafana.datarheo.yourdomain.com

## Database Migrations

Run database migrations:

```bash
cd backend
npx prisma migrate deploy
```

## Scaling

### Horizontal Pod Autoscaling

Enable autoscaling for backend:

```bash
kubectl autoscale deployment datarheo-backend \
  --namespace datarheo \
  --cpu-percent=70 \
  --min=3 \
  --max=10
```

### Database Scaling

For production, consider:
- Use managed PostgreSQL service (AWS RDS, Google Cloud SQL)
- Enable read replicas
- Configure connection pooling

## Backup and Recovery

### Database Backups

Set up automated backups:

```bash
# For PostgreSQL on Kubernetes
kubectl exec -n datarheo datarheo-postgres-0 -- pg_dump datarheo > backup.sql
```

### Disaster Recovery

- Regularly backup PostgreSQL and Redis
- Store backups in secure, off-site location
- Test recovery procedures regularly

## Security

### Best Practices

1. Use strong, unique passwords for all services
2. Enable SSL/TLS for all communications
3. Implement network policies
4. Regularly update dependencies
5. Enable audit logging
6. Use secrets management (AWS Secrets Manager, HashiCorp Vault)

### Network Policies

Example network policy:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: datarheo-network-policy
  namespace: datarheo
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: datarheo
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: datarheo
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n datarheo
kubectl describe pod <pod-name> -n datarheo
kubectl logs <pod-name> -n datarheo
```

### Check Services

```bash
kubectl get svc -n datarheo
```

### Check Ingress

```bash
kubectl get ingress -n datarheo
kubectl describe ingress datarheo-ingress -n datarheo
```

### Database Connectivity

```bash
kubectl run -it --rm debug --image=postgres:15 --restart=Never -n datarheo -- psql postgresql://postgres:password@datarheo-postgres-postgresql.datarheo.svc.cluster.local:5432/datarheo
```

## Maintenance

### Updating the Platform

1. Update code in Git
2. Build new Docker images
3. Update Kubernetes deployments:
   ```bash
   kubectl set image deployment/datarheo-backend backend=your-registry/datarheo-backend:v1.0.1 -n datarheo
   kubectl set image deployment/datarheo-frontend frontend=your-registry/datarheo-frontend:v1.0.1 -n datarheo
   ```
4. Monitor rollout:
   ```bash
   kubectl rollout status deployment/datarheo-backend -n datarheo
   ```

### Database Maintenance

```bash
# Vacuum database
kubectl exec -n datarheo datarheo-postgres-0 -- vacuumdb -U postgres -d datarheo

# Reindex
kubectl exec -n datarheo datarheo-postgres-0 -- reindexdb -U postgres -d datarheo
```

## Support

For issues and questions:
- GitHub Issues: https://github.com/Vrahad-Analytics/testing-datarheo/issues
- Documentation: https://github.com/Vrahad-Analytics/pydatarheo
