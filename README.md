# tr0n

Multi-LLM collaboration system for working on public repositories.

## Overview

This project explores how multiple independent LLM agents can work on the same Git repository simultaneously without interfering with each other. The primary approach is a **branch-per-agent** model where each agent gets its own branch, works independently, and opens a PR for integration.

## Structure

```
tr0n/
├── concept.md          # Core ideas, approaches, and design decisions
├── README.md           # This file
├── AGENTS.md           # Instructions for AI agents
├── .gitignore
├── examples/           # Example files for each concept
│   ├── agent-identity.json
│   ├── task-claim.md
│   ├── task-definition.md
│   ├── pr-template.md
│   └── task-directory-structure.md
└── .obsidian/          # Obsidian vault (ignored)
```

## Documents

- **[concept.md](concept.md)** — Detailed discussion of collaboration approaches, key principles, and real-world references.

## Status

Concept phase. No implementation yet.
