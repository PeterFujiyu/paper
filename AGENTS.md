# AGENTS.md

See [`CLAUDE.md`](CLAUDE.md). It is the single source of instructions for coding agents in this
repository — commands, layout, the API handler pattern, security invariants, and code style.

This file used to duplicate that content and drifted a version behind: it described `api/` as
holding route handlers, which stopped being true in `1bca3ed` when routes moved to `server/routes/`
and `api/` became one-line dispatchers. Rather than maintain two instruction files that can
contradict each other on the most common change made here, this one is a pointer.
