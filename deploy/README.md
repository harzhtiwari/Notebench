# Deployment Configurations

This directory contains deployment pipelines and reverse proxy templates for Notebench.

## Structure

- `production/`: Production deployment artifacts:
  - `Dockerfile`: Multi-stage build producing a single Fastify-driven container that hosts the static Next.js SPA and python worker pool.
  - `docker-compose.prod.yml`: Docker Compose file for persistent production operation.
- `local/`: Local containerized development with volume bind-mounts.
- `caddy/`: Zero-configuration automated TLS reverse proxy (`Caddyfile`).
- `nginx/`: Standard reverse proxy configuration with SSE unbuffered streaming support (`nginx.conf`).
