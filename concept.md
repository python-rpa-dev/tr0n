# Multi-LLM Collaboration on Public Repositories

## Idea

How can multiple independent LLMs work on the same public repository (e.g., Git) and work on different tasks without getting in each other's way?

## Approaches

### 1. Branch-per-Agent Model (Primary)

Each LLM gets its own feature branch, works independently, and opens a PR when done.

- Git handles the concurrency — merges resolve conflicts
- CI/PR checks catch integration issues before main is affected
- Risk: merge conflicts require human intervention or automated conflict resolution

### 2. Feature Flag / Modular Architecture

Design the codebase so agents work in isolated modules with stable interfaces.

- Agents modify different files/modules with minimal overlap
- Interface contracts (types, APIs) are the boundary — as long as those don't change, modules can evolve independently
- Requires intentional architecture from the start

### 3. Future Extensions

Task queue with file-level or module-level locking. A central orchestrator assigns discrete tasks to agents with locks to prevent simultaneous edits on the same file. More sophisticated but avoids blocking.

## Key Principles

| Principle | Why it matters |
|-----------|----------------|
| Small, atomic tasks | Less overlap = fewer conflicts |
| Stable interfaces | Agents can change internals without breaking others |
| Frequent integration | Catch conflicts early, not at the end |
| Deterministic outputs | Reduces "two agents do different things to the same code" |
| Clear ownership | Assign files/modules to specific agents when possible |

## Real-World Examples

- Meta's WIP — agents work on branches, PRs are auto-reviewed
- OpenDevin / SWE-agent — task queue with file locking
- GitHub Copilot Workspaces — branch-per-agent with PR integration
