# Peter Fujiyu - Personal Website

A personal website and blog built with Vue 3, Vite, and a serverless API backend using Hono and MongoDB.

## Tech Stack

- **Frontend:** Vue 3, Vite, TypeScript, Tailwind CSS v4
- **Backend:** Hono, Node.js (serverless handlers)
- **Database:** MongoDB via Mongoose
- **Rich Text Editing:** TipTap

## Prerequisites

- Node.js (v24+)
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
   - Set `MCP_AUTHOR_ID` to the MongoDB `_id` of the author when using the local MCP authoring server.
   - Set `SITE_ORIGIN` to the canonical public origin when browser-originated MCP connections should be allowed.
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

## Model Context Protocol

Paper exposes a stateless, read-only MCP server at `/api/mcp`. It provides published essay search and reading, recent notes, the coffee log, and `paper://essay/{slug}` resources. The public endpoint never reads the admin cookie and does not expose authoring tools. Register a deployed instance with:

```bash
claude mcp add --transport http paper https://<your-host>/api/mcp
```

For local authoring, configure `MCP_AUTHOR_ID` and run:

```bash
npm run mcp:stdio
```

The stdio server adds tools to create drafts, replace or publish essays, add notes, and log brews. It talks directly to the configured MongoDB and intentionally has no delete tool. A client can register it by running the equivalent of:

```bash
claude mcp add paper-author -- npm run mcp:stdio
```

Remote clients connect to `https://<your-host>/api/mcp` over HTTP without authentication because that surface contains only content already public on the site.

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
