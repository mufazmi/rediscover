# Rediscover Backend

Self-hosted Node.js + Express + SQLite backend for Rediscover.

## Directory Structure

```
backend/
├── src/
│   ├── config/         # Configuration and environment setup
│   ├── services/       # Business logic services (auth, crypto, redis, scan)
│   ├── routes/         # API route handlers
│   ├── middleware/     # Express middleware (auth, validation, rate limiting)
│   ├── handlers/       # Socket.io event handlers (monitor, pubsub)
│   └── db/            # SQLite database initialization and schema
├── data/              # Runtime data (database, secrets) - created at runtime
├── dist/              # Compiled JavaScript output
└── package.json       # Dependencies and scripts
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

## Build

```bash
npm run build
npm start
```

## Environment Variables

See `.env.example` for all available configuration options.

## Features

- JWT-based authentication
- SQLite database for local persistence
- Redis connection management with encryption
- Real-time monitoring via Socket.io
- Comprehensive Redis operations API
- Role-based access control (admin/operator)
