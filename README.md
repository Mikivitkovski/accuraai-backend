# Accuraai Backend

Stack: Node.js, Express, TypeScript, TypeORM, Postgres (Docker), Zod, Swagger

## Quick Start
Prereqs: Node 18+ (20 LTS recommended), Docker Desktop

```bash
git clone
cd accuraai-backend
git checkout 1-initial-setup

cp .env.example .env
docker compose up -d
npm install

# Dev
npm run dev
# API:    http://localhost:3000/api
# Swagger http://localhost:3000/docs
