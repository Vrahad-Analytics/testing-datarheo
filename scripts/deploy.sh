#!/bin/bash

# DataRheo Platform Deployment Script
# This script deploys the platform to production

set -e

echo "🚀 Deploying DataRheo Platform to production..."

# Check for kubectl
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed. Please install kubectl first."
    exit 1
fi

# Check for helm
if ! command -v helm &> /dev/null; then
    echo "❌ Helm is not installed. Please install Helm first."
    exit 1
fi

# Set Kubernetes context
echo "📋 Setting Kubernetes context..."
# Add your cluster context setup here
# kubectl config use-context your-cluster-context

# Create namespace
echo "🔧 Creating Kubernetes namespace..."
kubectl create namespace datarheo --dry-run=client -o yaml | kubectl apply -f -

# Deploy PostgreSQL
echo "🗄️  Deploying PostgreSQL..."
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
helm upgrade --install datarheo-postgres bitnami/postgresql \
  --namespace datarheo \
  --set auth.postgresPassword=your-secure-password \
  --set auth.database=datarheo \
  --set persistence.enabled=true

# Deploy Redis
echo "🔴 Deploying Redis..."
helm upgrade --install datarheo-redis bitnami/redis \
  --namespace datarheo \
  --set auth.enabled=false \
  --set persistence.enabled=true

# Deploy Airflow
echo "💨 Deploying Airflow..."
helm repo add apache-airflow https://airflow.apache.org
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
  --set redis.port=6379 \
  --set dags.gitSync.enabled=true \
  --set dags.gitSync.repo=https://github.com/Vrahad-Analytics/testing-datarheo.git \
  --set dags.gitSync.branch=main \
  --set dags.gitSync.subPath=airflow/dags \
  --set dags.gitSync.wait=30

# Build and push Docker images
echo "🐳 Building and pushing Docker images..."
# Add your Docker registry commands here
# docker build -t your-registry/datarheo-backend:latest backend/
# docker push your-registry/datarheo-backend:latest
# docker build -t your-registry/datarheo-frontend:latest frontend/
# docker push your-registry/datarheo-frontend:latest

# Deploy backend and frontend
echo "🌐 Deploying backend and frontend..."
# kubectl apply -f docker/kubernetes/backend-deployment.yaml
# kubectl apply -f docker/kubernetes/frontend-deployment.yaml
# kubectl apply -f docker/kubernetes/ingress.yaml

echo "✅ Deployment complete!"
echo ""
echo "🎉 DataRheo Platform is now running in production!"
echo ""
echo "To check the status:"
echo "  kubectl get pods -n datarheo"
echo ""
echo "To access the services:"
echo "  kubectl port-forward -n datarheo svc/datarheo-backend 8000:8000"
echo "  kubectl port-forward -n datarheo svc/datarheo-frontend 3000:3000"
echo "  kubectl port-forward -n datarheo svc/datarheo-airflow-web 8080:8080"
