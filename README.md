# Peter Fujiyu - Personal Website

A personal website and blog built with Vue 3, Vite, and a serverless API backend using Hono and MongoDB.

## Tech Stack

- **Frontend:** Vue 3, Vite, TypeScript, Tailwind CSS v4
- **Backend:** Hono, Node.js (serverless handlers)
- **Database:** MongoDB via Mongoose
- **Rich Text Editing:** TipTap

## Prerequisites

- Node.js (v18+ recommended)
- MongoDB database (local or Atlas)

## Local Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Copy the example environment file and configure it:
   ```bash
   cp .env.example .env
   ```
   - Set `MONGODB_URI` to your MongoDB connection string.
   - Set `JWT_SECRET` to a long random value (must be at least 32 characters).
     Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Set `INVITE_CODE` to a secret code to enable user registration. Leave unset to disable registration.
     Generate with: `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`
   - Keep `VITE_API_BASE=/api` unless intentionally pointing the frontend elsewhere.

## Running the Application

For full local development, run the frontend and API servers in separate terminals:

1. **Start the local API server:**
   ```bash
   npm run api:dev
   ```

2. **Start the Vite frontend dev server:**
   ```bash
   npm run dev
   ```

## Type Checking & Building

- **Type Check:** Run `npm run typecheck` to verify TypeScript typings.
- **Build:** Run `npm run build` to build the application for production.
- **Preview:** Run `npm run preview` to locally preview the production build.

It is recommended to run `npm run typecheck && npm run build` to validate most code changes.

## Testing

Tests are written using Vitest.

- Run all tests once: `npm test`
- Run tests in watch mode: `npm run test:watch`
- Run tests with coverage: `npm run test:coverage`

## Repository Structure

- `src/` - Client app, router, admin UI, shared client types.
- `api/` - Serverless route entrypoints (Vercel style).
- `server/lib/` - Shared server code (auth, DB, validation, etc.).
- `server/models/` - Mongoose schemas and models.
- `tests/` - Vitest unit tests.
- `public/` - Static assets.

For more detailed conventions and coding rules, please refer to the [`AGENTS.md`](./AGENTS.md) file.
