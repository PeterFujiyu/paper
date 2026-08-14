import { paperMcpFetch } from '../server/mcp/server.js'

// A fetch web handler, not the (req, res) dispatchers beside it: the MCP
// transport reads the request itself, and Vercel's `(req, res)` signature would
// hand it a body that was already parsed. This is the shape the research settled
// on — see research/mcp-support/02-fit-with-this-codebase.md and Vercel's
// "Node.js functions now support fetch web handlers".
//
// Nothing imports this file (dev.ts reaches paperMcpFetch directly), so the
// export shape is only exercised by a deployment; the contract test in
// tests/server/lib/dispatch.test.ts pins it here instead.
export default { fetch: paperMcpFetch }
