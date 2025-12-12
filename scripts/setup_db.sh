#!/bin/bash

# Exit on error
set -e

echo "Starting Database Setup..."

# Check if docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running or not accessible."
  exit 1
fi

# Start Postgres container
echo "Starting PostgreSQL container..."
docker-compose up -d postgres

# Wait for Postgres to be ready
echo "Waiting for PostgreSQL to be ready..."
until docker exec sync_postgres pg_isready -U sync_user; do
  echo "Postgres is unavailable - sleeping"
  sleep 1
done

echo "PostgreSQL is up and running!"

# Run Prisma Migrations
echo "Running Prisma Migrations..."
cd backend
npx prisma migrate dev --name init

echo "Database Setup Complete!"
