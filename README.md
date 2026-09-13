# DataRheo Platform

A complete data integration platform similar to Airbyte, built with modern technologies and designed for scalability and ease of use.

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/Vrahad-Analytics/testing-datarheo.git
cd testing-datarheo

# Run the setup script
./scripts/setup.sh

# Start the platform
docker compose -f docker/docker-compose.yml up -d
```

### Access the Platform

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Airflow**: http://localhost:8080 (admin/admin)
- **Grafana** (monitoring): http://localhost:3001 (admin/admin)
- **Prometheus** (monitoring): http://localhost:9090

## 📋 Features

### Core Capabilities
- **Connector Management**: Browse, install, and configure 600+ Airbyte-compatible connectors
- **Pipeline Builder**: Create and manage data integration pipelines with an intuitive web interface
- **Job Orchestration**: Schedule and automate data sync jobs using Apache Airflow
- **Real-time Monitoring**: Track pipeline execution with detailed logs and metrics
- **Multi-tenant Support**: Organization-based access control with role-based permissions
- **API Access**: REST API for programmatic integration
- **Authentication**: JWT-based authentication with refresh tokens

### Architecture

**Backend (Express.js + TypeScript):**
- RESTful API with Express.js
- PostgreSQL database with Prisma ORM
- Redis for caching and job queues
- JWT authentication
- Prometheus metrics integration
- Comprehensive error handling and logging

**Frontend (Next.js + React):**
- Modern React UI with Next.js 14
- Tailwind CSS for styling
- TanStack Query for data fetching
- Responsive design with shadcn/ui components
- Real-time updates and notifications

**Orchestration (Apache Airflow):**
- CeleryExecutor for distributed task execution
- Dynamic DAG generation for pipelines
- Integration with pydatarheo for data movement
- Web UI for pipeline monitoring

**Infrastructure:**
- Docker Compose for local development
- Kubernetes manifests for production deployment
- Nginx ingress with SSL/TLS support
- Horizontal Pod Autoscaling
- Prometheus + Grafana monitoring

## 🏗️ Project Structure

```
testing-datarheo/
├── backend/              # Express.js API server
│   ├── src/
│   │   ├── controllers/  # API route handlers
│   │   ├── services/     # Business logic
│   │   ├── middleware/   # Auth, validation, metrics
│   │   ├── routes/       # API route definitions
│   │   └── utils/        # Logger, metrics, helpers
│   ├── prisma/           # Database schema
│   └── package.json
├── frontend/             # Next.js web UI
│   ├── app/              # Next.js app directory
│   ├── components/       # React components
│   ├── lib/              # Utilities
│   └── package.json
├── airflow/              # Airflow DAGs and configs
│   ├── dags/             # Airflow DAGs
│   └── requirements.txt
├── docker/               # Docker configurations
│   ├── docker-compose.yml
│   ├── docker-compose.monitoring.yml
│   └── kubernetes/       # K8s manifests
└── scripts/              # Setup and deployment scripts
```

## 🔧 Configuration

### Backend Environment Variables

```env
NODE_ENV=development
PORT=8000
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/datarheo
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key
AIRFLOW_BASE_URL=http://localhost:8080
```

### Frontend Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user

### Connectors
- `GET /api/connectors` - List connectors
- `GET /api/connectors/catalog` - Get connector catalog
- `POST /api/connectors` - Create connector
- `GET /api/connectors/:id` - Get connector details
- `PUT /api/connectors/:id` - Update connector
- `DELETE /api/connectors/:id` - Delete connector
- `POST /api/connectors/:id/test` - Test connector

### Pipelines
- `GET /api/pipelines` - List pipelines
- `POST /api/pipelines` - Create pipeline
- `GET /api/pipelines/:id` - Get pipeline details
- `PUT /api/pipelines/:id` - Update pipeline
- `DELETE /api/pipelines/:id` - Delete pipeline
- `POST /api/pipelines/:id/run` - Run pipeline
- `POST /api/pipelines/:id/pause` - Pause pipeline
- `POST /api/pipelines/:id/resume` - Resume pipeline

### Jobs
- `GET /api/jobs` - List jobs
- `GET /api/jobs/:id` - Get job details
- `POST /api/jobs/:id/cancel` - Cancel job
- `GET /api/jobs/:id/logs` - Get job logs

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users/api-keys` - List API keys
- `POST /api/users/api-keys` - Create API key
- `DELETE /api/users/api-keys/:id` - Delete API key

## 🚢 Deployment

### Local Development

```bash
./scripts/setup.sh
docker compose -f docker/docker-compose.yml up -d
```

### Production

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed production deployment instructions.

```bash
./scripts/deploy.sh
```

## 🧪 Development

### Backend Development

```bash
cd backend
npm install
npx prisma generate
npm run dev
```

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

### Running Tests

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

## 📚 Documentation

- [Deployment Guide](DEPLOYMENT.md)
- [API Documentation](https://github.com/Vrahad-Analytics/pydatarheo)
- [Airbyte Protocol](https://docs.airbyte.com/)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with [pydatarheo](https://github.com/Vrahad-Analytics/pydatarheo) - the data integration library
- Inspired by [Airbyte](https://airbyte.com/) - the open-source data integration platform
- Uses [Apache Airflow](https://airflow.apache.org/) for workflow orchestration

## 📞 Support

For issues and questions:
- GitHub Issues: https://github.com/Vrahad-Analytics/testing-datarheo/issues
- Documentation: https://github.com/Vrahad-Analytics/pydatarheo
