# Multi-LLM Collaboration on Public Repositories

## Idea

How can multiple independent LLMs work on the same public repository (e.g., Git) and work on different tasks without getting in each other's way?

## Approaches

### 1. Branch-per-Agent Model (Primary)

Each LLM gets its own feature branch, works independently, and opens a PR when done.

- Git handles the concurrency — merges resolve conflicts
- CI/PR checks catch integration issues before main is affected
- Risk: merge conflicts require human intervention or automated conflict resolution

<!-- TODO: Define conflict resolution priority rules — which side wins when 3+ agents overlap -->

#### Conflict Resolution Priority Rules (3+ Agents)

When 3+ agents' scopes overlap, deterministic priority rules decide:

| Priority | Condition | Action |
|----------|-----------|--------|
| **1** | Agent has **earlier confirmed claim** | Winner — other agents must defer or adjust |
| **2** | Same claim time → **shorter scope** | Winner — less impact, easier to merge |
| **3** | Same scope size → **higher task priority** | Winner — business criticality wins |
| **4** | Same priority → **first to claim** | Winner — FIFO, no randomness |

**Overlap resolution strategies:**

- **Scope splitting:** earlier claimant keeps the file, later claimant adjusts scope
- **Task deferral:** lower-priority task returns to backlog
- **Task merging:** tightly coupled tasks are assigned to one agent

**Decision flow:**

```
Claim overlap detected?
  │
  ├─→ No overlap → both proceed
  │
  └─→ Overlap → check priority
       │
       ├─→ Clear winner (rule 1-4) → winner proceeds, loser adjusts
       │
       └─→ Tie → user decides
            │
            ├─→ Split scopes → both proceed with adjusted scope
            ├─→ Defer one → one proceeds, other returns to backlog
            └─→ Merge tasks → one agent handles both

<!-- TODO: Future — manual operator override tool for conflict resolution -->

#### Conflict Resolution

Hybrid approach: auto-merge when files don't overlap, agent-resolve when they do, human only as last resort.

#### Branch Naming Convention

`agent-{id}/{task-id}-{short-desc}`

Examples: `agent-1/T-042-add-auth`, `agent-2/T-043-fix-login-bug`

#### PR Template

Each agent opens a PR with structured body: task ID, agent ID, changed files, test status, and notes.

See [`examples/pr-template.md`](examples/pr-template.md) for the full template.

#### Stale Base Detection

<!-- TODO: Decide on rebase vs merge strategy for stale branches -->

Before starting: fetch latest `main`, record base commit hash. During CI: check if `main` has moved, auto-rebase if so.

#### Round-Call (Pre-Flight Announcement)

Before working, an agent announces its intended scope so others can object.

**Coordination layer:** `tasks/` directory in the repo.

See [`examples/task-directory-structure.md`](examples/task-directory-structure.md) for the full layout.

**Claim lifecycle:** `pending → confirmed → active → resolved/rejected`

**Claim file format:**

<!-- TODO: Define the full spec for claim file fields and validation rules -->

See [`examples/task-claim.md`](examples/task-claim.md) for a complete example.

**Flexible claim window:**
- Default: configurable at system level (e.g., 1 hour)
- User can override: `"work on T-042, claim window 30min"`
- Auto-promotes to `confirmed` after window expires with no objections
- Expired claims can be reclaimed, reassigned, or discarded

**Conflict resolution:** when two claims overlap, coordinator decides — merge scopes, defer the later claim, or split the work.

<!-- TODO: Define objection format and resolution protocol -->

#### Objection Format and Resolution Protocol

An objection is a file under `tasks/objections/<task-id>/<agent>.md`:

```
tasks/active/
└── T-042-agent-1.md
tasks/objections/
└── T-042-agent-1/
    └── T-043-agent-2.md
```

**Objection file:**

```markdown
## Objecting to
T-042 (agent-1) — claim for T-042

## My overlapping task
T-043 (agent-2) — claim for T-043

## Overlap
- src/auth/session.py  ← both tasks modify this file

## Proposed resolution
- Split: agent-1 keeps src/auth/login.py, agent-2 gets src/auth/session.py
- Defer: T-043 returns to backlog until T-042 is merged
```

**Resolution protocol:**

1. When overlap is detected, both claims marked `pending-resolution`
2. Priority rules decide a winner automatically (if clear)
3. If tie → user must decide (manual intervention)
4. Loser's claim is adjusted or returned to backlog
5. Both claims updated with resolution, move back to `pending` or `confirmed`

**Auto-resolution (priority rules decide):**

```
Tie-breaker applied:
- T-042 claimed at 10:00 (earlier) → WINNER
- T-043 claimed at 10:05 → LOSER

Resolution: T-043 scope adjusted to exclude src/auth/
```

**User resolution (tie):**

```markdown
## Resolution
User decided: split scopes
- agent-1 keeps src/auth/
- agent-2 gets src/sessions/ (adjusted)

## Resolved at
2026-05-16T10:30:00Z
## Resolved by
user
```

### 5. Manual CI with Non-Blocking Tasks

CI is **manual** — user or another agent runs it after an agent opens a PR.

**PR statuses:**

| Status | Meaning | Can agent work on something else? |
|--------|---------|-----------------------------------|
| `awaiting-ci` | PR open, CI not yet run | Yes — non-blocking tasks |
| `ci-passed` | CI passed, ready to merge | Yes |
| `ci-failed` | CI failed, needs fix | No — agent must fix |
| `ready-to-merge` | Approved, waiting for human merge | Yes |

**Agent workflow on task completion:**

1. Agent opens PR → marks as `awaiting-ci`
2. Agent checks PR status → if `awaiting-ci`, looks for non-blocking tasks
3. Agent picks up another task from backlog (no dependency on pending PR)
4. When CI passes → PR marked `ready-to-merge`
5. When CI fails → agent gets failures, fixes, re-opens `awaiting-ci`

**Non-blocking task detection:**

Tasks declare dependencies:

```markdown
## Task
T-045: Add logging module

## Depends-on
- T-042 (auth)  ← blocker

## Scope
- src/logging/
```

Agent checks backlog for tasks with **no dependency** on the pending PR.

**Agent decision logic:**

```
PR #42 status: awaiting-ci
  │
  └─→ Check backlog for non-blocking tasks
       │
       ├─→ Found T-045 (no deps) → pick it up
       └─→ No non-blocking tasks → idle / wait
```

### 2. Feature Flag / Modular Architecture

Design the codebase so agents work in isolated modules with stable interfaces.

- Agents modify different files/modules with minimal overlap
- Interface contracts (types, APIs) are the boundary — as long as those don't change, modules can evolve independently
- Requires intentional architecture from the start

### 3. Future Extensions

Task queue with file-level or module-level locking. A central orchestrator assigns discrete tasks to agents with locks to prevent simultaneous edits on the same file. More sophisticated but avoids blocking.

### 4. Future: Docker Containerization

Pin agent environments in Docker containers for deterministic, reproducible builds. Currently deferred — agents run on native shell environments (Windows/Linux/macOS).

## Agent Lifecycle

### Stages

| Stage | Description |
|-------|-------------|
| **idle** | Agent exists but has no active task |
| **claiming** | Agent initiated a round-call, waiting for claim window |
| **working** | Claim confirmed, agent is on its branch making changes |
| **reviewing** | PR opened, waiting for CI/review results |
| **merged** | PR merged into `main` |
| **terminated** | Agent shut down, no longer active |

<!-- TODO: Define transition rules — what triggers each state change, who can initiate it -->

### Lifecycle Flow

```
idle
  │
  ├──→ claiming ──(window expires, no objections)──→ working
  │        │
  │        └──(objection received)──→ idle (re-claim with adjusted scope)
  │
  ├──→ working ──(PR opened)──→ reviewing
  │        │
  │        └──(claim expired)──→ idle (re-claim)
  │
  ├──→ reviewing ──(CI passes, review passes)──→ merged
  │        │
  │        └──(CI fails / review rejects)──→ working (fix and push)
  │
  ├──→ merged ──→ terminated
  │
  └──→ terminated
```

### Agent Registration

Each agent has a persistent identity file:

<!-- TODO: Define agent ID naming convention and uniqueness guarantee -->

See [`examples/agent-identity.json`](examples/agent-identity.json) for a complete example.

### Task Assignment

A coordinator (or user) assigns tasks to agents:

1. Task is created in a `tasks/` directory (separate from active claims)
2. Coordinator matches task to agent by **expertise** or **availability**
3. Agent receives the task and enters the **claiming** stage

<!-- TODO: Define task ID naming convention and uniqueness -->

See [`examples/task-directory-structure.md`](examples/task-directory-structure.md) for the full layout.

### Shutdown / Termination

- **Graceful:** agent finishes current task → terminates
- **Forced:** coordinator/user forces shutdown
  - If agent is **idle/claiming** → safe to terminate
  - If agent is **working** → PR stays open, task marked as incomplete, another agent can pick it up
  - Branch is preserved (not deleted) for inspection

### Resource Management

- Agents are **ephemeral** — each time an agent "wakes up", it reads its state from the repo
- No long-lived connections or persistent sessions needed
- State is **declarative** (JSON files + Git) — the repo is the source of truth

## Multi-Platform Agent Design

### Environment Declaration (Per-Agent)

Each agent declares its environment in its identity file.

See [`examples/agent-identity.json`](examples/agent-identity.json) for a complete example.

### Task Compatibility Check

Before assigning a task, check requirements against agent capabilities:

| Task requirement | Agent capability | Result |
|-----------------|-----------------|--------|
| `platform: linux` | `windows` | ❌ Incompatible — warn user |
| `tool: docker` | no docker | ❌ Warn — suggest installing |
| `python >= 3.11` | `3.12` | ✅ Compatible |
| `platform: any` | any | ✅ Compatible |

Tasks declare requirements:

See [`examples/task-definition.md`](examples/task-definition.md) for a complete example.

### Cross-Platform Handling

**Git is the universal layer** — all coordination happens through Git, which works identically on all platforms.

**File paths in task scope:** use forward slashes (POSIX-style), Git normalizes them:
- `src/auth/` works on both Windows and Linux
- Never use `src\auth\` in task declarations

**Shell-agnostic coordination:** the coordinator only uses Git commands (not shell-specific ones):
- ✅ `git fetch`, `git checkout`, `git push`
- ❌ `ls`, `rm`, `mkdir` (use Git-aware alternatives)

Agents run their own local commands (tests, lint, builds) in their native shell — that's fine. Coordination stays Git-only.

### Local Tool Detection

When an agent wakes up, it detects its environment and updates its identity:

<!-- TODO: Define the detection script or command format -->

```
Detected:
- OS: Windows 11
- Shell: PowerShell 7.4
- Python: 3.11.9
- Node: 20.11.0
- git: 2.43.0
- docker: not found
```

This info is pushed to the agent identity file on next sync.

### Fallback Strategy

When a task requires something an agent doesn't have:
1. **Warn the user** — "Task T-044 requires aws-cli, not found on this machine"
2. **Suggest alternatives** — installation instructions for the platform
3. **Defer** — task stays in backlog until a compatible agent picks it up

## Config File Convention

To prevent personal config files from being overwritten by future updates, the repo uses a **template + local** pattern.

```
config/
├── templates/
│   ├── agent.json.example    # Template — tracked in git
│   └── settings.json.example # Template — tracked in git
└── local/                    # User-specific — gitignored
    ├── agent.json            # Copy from agent.json.example
    └── settings.json         # Copy from settings.json.example
```

Users copy `.example` files to their local versions. Local versions are gitignored, so:
- `git pull` never overwrites user configs
- Templates can be updated without affecting local files
- Diff shows only template changes, not user noise

**Agent state files** (`agents/`, `tasks/`) are repo-state and remain tracked.

## Key Principles

<!-- TODO: Add principle about test coverage requirements per agent -->
<!-- TODO: Add principle about documentation updates required alongside code changes -->

| Principle | Why it matters |
|-----------|----------------|
| Small, atomic tasks | Less overlap = fewer conflicts |
| Stable interfaces | Agents can change internals without breaking others |
| Frequent integration | Catch conflicts early, not at the end |
| Deterministic outputs | Reduces "two agents do different things to the same code" |
| Clear ownership | Assign files/modules to specific agents when possible |

## Glossary

- [`examples/agent-identity.json`](examples/agent-identity.json) — Complete agent identity file
- [`examples/task-claim.md`](examples/task-claim.md) — Task claim file for round-call
- [`examples/task-definition.md`](examples/task-definition.md) — Task definition with requirements
- [`examples/pr-template.md`](examples/pr-template.md) — PR template for agent submissions
- [`examples/task-directory-structure.md`](examples/task-directory-structure.md) — Task directory layout

## Real-World Examples

- Meta's WIP — agents work on branches, PRs are auto-reviewed
- OpenDevin / SWE-agent — task queue with file locking
- GitHub Copilot Workspaces — branch-per-agent with PR integration
