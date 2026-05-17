# tr0n

Multi-LLM collaboration system for working on public repositories.

## Overview

This project explores how multiple independent LLM agents can work on the same Git repository simultaneously without interfering with each other. The primary approach is a **branch-per-agent** model where each agent gets its own branch, works independently, and opens a PR for integration.

## Quick Start

```bash
# 1. Clone and configure
git clone https://github.com/<user>/tr0n.git
cd tr0n
cp config/templates/agent.json.example config/local/agent.json
cp config/templates/settings.json.example config/local/settings.json

# 2. Launch agent with a task
node agent/agent.js --task T-042

# 3. Or use protocol mode for LLM clients
node agent/agent.js --protocol
```

See [agent-guide.md](docs/agent-guide.md) for full installation, launching, and debugging instructions.

## Structure

```
tr0n/
├── concept.md              # Core ideas, approaches, and design decisions
├── README.md               # This file
├── AGENTS.md               # Instructions for AI agents
├── .gitignore
├── docs/                   # User-facing documentation
│   └── agent-guide.md      # Installation, launch, debugging, LLM client discovery
├── agent/                  # Agent implementation (zero npm dependencies)
│   ├── agent.js            # Main entry point (CLI + protocol)
│   ├── claim.js            # Claim lifecycle (create, confirm, reject)
│   ├── git.js              # Git operations (fetch, checkout, push, rebase)
│   ├── conflict.js         # Conflict detection & resolution
│   └── protocol.js         # stdin/stdout protocol for LLM clients
├── config/
│   ├── templates/
│   │   ├── agent.json.example    # Agent config template
│   │   └── settings.json.example # System settings template
│   └── local/
│       ├── agent.json            # Agent identity (gitignored)
│       └── settings.json         # System settings (gitignored)
├── examples/               # Example files for each concept
│   ├── agent-identity.json
│   ├── task-claim.md
│   ├── task-definition.md
│   ├── pr-template.md
│   └── task-directory-structure.md
├── tests/
│   └── agent-test.js       # Agent test suite
└── .obsidian/              # Obsidian vault (ignored)
```

## Agent Modes

| Mode | Command | Use case |
|------|---------|----------|
| Standalone CLI | `node agent/agent.js --task T-042` | Direct task execution |
| Protocol | `node agent/agent.js --protocol` | LLM clients (opencode, aichat) |
| Auto-discover | `node agent/agent.js` | Pick available task from backlog |

## Documents

- **[concept.md](concept.md)** — Detailed discussion of collaboration approaches, key principles, and real-world references.
- **[agent-guide.md](docs/agent-guide.md)** — Installation, launch, debugging, LLM client discovery, and integration guide.
- **[AGENTS.md](AGENTS.md)** — Instructions for AI agents working in this repository.

## Status

Implementation phase. Agent module complete with test suite.
