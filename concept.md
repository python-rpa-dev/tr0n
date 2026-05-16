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

| Priority | Condition                              | Action                                        |
|----------|----------------------------------------|-----------------------------------------------|
| **1**    | Agent has **earlier confirmed claim**  | Winner — other agents must defer or adjust    |
| **2**    | Same claim time → **shorter scope**    | Winner — less impact, easier to merge         |
| **3**    | Same scope size → **higher task priority** | Winner — business criticality wins         |
| **4**    | Same priority → **first to claim**     | Winner — FIFO, no randomness                  |

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
```

<!-- TODO: Future — manual operator override tool for conflict resolution -->

#### Conflict Resolution

Hybrid approach: auto-merge when files don't overlap, agent-resolve when they do, human only as last resort.

#### Branch Naming Convention

`agent-{id}/{task-id}-{short-desc}`

Examples: `agent-1/T-042-add-auth`, `agent-2/T-043-fix-login-bug`

#### PR Template

Each agent opens a PR with structured body: task ID, agent ID, changed files, test status, and notes.

See [pr-template.md](examples/pr-template.md) for the full template.

#### Stale Base Detection

<!-- TODO: Decide on rebase vs merge strategy for stale branches -->

Before starting: fetch latest `main`, record base commit hash. During CI: check if `main` has moved, auto-rebase if so.

#### Round-Call (Pre-Flight Announcement)

Before working, an agent announces its intended scope so others can object.

**Coordination layer:** `tasks/` directory in the repo.

See [task-directory-structure.md](examples/task-directory-structure.md) for the full layout.

**Claim lifecycle:** `pending → confirmed → active → resolved/rejected`

**Claim file format:**

<!-- TODO: Define the full spec for claim file fields and validation rules -->

#### Claim File Field Spec

**Required fields:**

| Field        | Type           | Description                                    |
|--------------|----------------|------------------------------------------------|
| `task`       | string         | Task ID (e.g., `T-042`)                        |
| `agent`      | string         | Agent ID (e.g., `agent-1`)                     |
| `scope`      | list           | List of file/module paths being modified       |
| `claimed_at` | ISO timestamp  | When the claim was created                     |
| `claim_window`| duration      | How long to wait for objections (e.g., `1h`)   |
| `expires_at` | ISO timestamp  | Calculated: `claimed_at + claim_window`        |
| `status`     | enum           | `pending`                                      |

**Optional fields:**

| Field           | Type    | Description                              |
|-----------------|---------|------------------------------------------|
| `resolution`    | string  | Resolution result (set when auto-resolved)|
| `adjusted_at`   | ISO timestamp | When scope was adjusted             |
| `adjusted_reason`| string | Why scope was adjusted                   |
| `objections`    | list    | List of objection file paths             |
| `notes`         | string  | Any additional context                   |

**Validation rules:**

1. `expires_at` must be in the future
2. `scope` must not be empty
3. `scope` paths must use forward slashes
4. `claim_window` must be a valid duration (parsable)
5. `status` must be a valid enum value
6. `claimed_at` must be before `expires_at`

**Computed fields (auto-generated):**

| Field        | Source                      |
|--------------|-----------------------------|
| `expires_at` | `claimed_at + claim_window` |
| `status`     | Automatically updated by system |

See [task-claim.md](examples/task-claim.md) for a complete example.

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

| Status       | Meaning                        | Can agent work on something else? |
|--------------|--------------------------------|-----------------------------------|
| `awaiting-ci`| PR open, CI not yet run        | Yes — non-blocking tasks          |
| `ci-passed`  | CI passed, ready to merge      | Yes                               |
| `ci-failed`  | CI failed, needs fix           | No — agent must fix               |
| `ready-to-merge` | Approved, waiting for human merge | Yes                          |

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

| Stage        | Description                                         |
|--------------|-----------------------------------------------------|
| **idle**     | Agent exists but has no active task                 |
| **claiming** | Agent initiated a round-call, waiting for claim window |
| **working**  | Claim confirmed, agent is on its branch making changes |
| **reviewing**| PR opened, waiting for CI/review results            |
| **merged**   | PR merged into `main`                               |
| **terminated**| Agent shut down, no longer active                  |

<!-- TODO: Define transition rules — what triggers each state change, who can initiate it -->

#### Agent State Transition Rules

| Transition               | Trigger                                           | Who initiates     |
|--------------------------|---------------------------------------------------|-------------------|
| `idle → claiming`        | User assigns task to agent                        | User/coordinator  |
| `claiming → working`     | Claim window expires with no objections           | Auto (system)     |
| `claiming → idle`        | Objection received + resolution deferred          | Auto (system)     |
| `claiming → claiming`    | Objection received + auto-resolved (loser adjusts)| Auto (system)     |
| `working → reviewing`    | Agent pushes branch and opens PR                  | Agent             |
| `working → claiming`     | Claim expires before PR opened                    | Auto (system)     |
| `reviewing → merged`     | CI passes + review approved + user merges         | User (manual)     |
| `reviewing → working`    | CI fails or review rejects → agent fixes          | Auto (system)     |
| `reviewing → reviewing`  | CI fails → agent pushes fix, CI re-runs          | Agent             |
| `merged → terminated`    | All tasks complete or user terminates             | User              |
| `terminated → idle`      | Agent reactivated with new task                   | User/coordinator  |

**Agent state update mechanism:**

When a transition happens, the agent updates its identity file:

```json
{
  "id": "agent-1",
  "status": "reviewing",
  "current_task": "T-042",
  "current_branch": "agent-1/T-042-add-auth",
  "last_transition": "2026-05-16T10:30:00Z",
  "transition_trigger": "pr_opened"
}
```

#### Claim State Transitions

| Transition               | Trigger                                    |
|--------------------------|--------------------------------------------|
| `pending → confirmed`    | Claim window expires with no objections    |
| `pending → pending-resolution` | Objection received                     |
| `pending → rejected`     | Priority rules decide loser                |
| `confirmed → active`     | Agent starts working                       |
| `active → resolved`      | PR merged                                  |
| `active → rejected`      | User forces cancellation                   |
| `pending-resolution → confirmed` | Auto-resolved (winner)              |
| `pending-resolution → active`    | Winner starts working               |
| `pending-resolution → rejected`  | Loser's claim rejected              |

**Edge cases:**

- **Claim expires while pending:** claim → `expired`, agent → `idle`
- **Agent terminates while working:** PR stays open, task → `incomplete`, agent → `terminated`
- **Agent terminates while reviewing:** PR stays open, task → `awaiting-ci`, agent → `terminated`

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

See [agent-identity.json](examples/agent-identity.json) for a complete example.

### Task Assignment

A coordinator (or user) assigns tasks to agents:

1. Task is created in a `tasks/` directory (separate from active claims)
2. Coordinator matches task to agent by **expertise** or **availability**
3. Agent receives the task and enters the **claiming** stage

<!-- TODO: Define task ID naming convention and uniqueness -->

See [task-directory-structure.md](examples/task-directory-structure.md) for the full layout.

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

See [agent-identity.json](examples/agent-identity.json) for a complete example.

### Task Compatibility Check

Before assigning a task, check requirements against agent capabilities:

| Task requirement      | Agent capability | Result                        |
|-----------------------|------------------|-------------------------------|
| `platform: linux`     | `windows`        | ❌ Incompatible — warn user   |
| `tool: docker`        | no docker        | ❌ Warn — suggest installing  |
| `python >= 3.11`      | `3.12`           | ✅ Compatible                 |
| `platform: any`       | any              | ✅ Compatible                 |

Tasks declare requirements:

See [task-definition.md](examples/task-definition.md) for a complete example.

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

## Agent Design

### Launch Command

```
tr0n-agent --task T-042
```

Or with claim window override:

```
tr0n-agent --task T-042 --claim-window 30min
```

### Agent Lifecycle on Launch

1. Reads its identity from `config/local/agent.json` (or `config/templates/agent.json.example` if no local copy)
2. Fetches latest `main` from remote
3. Reads the task from `tasks/assigned/T-042-<agent-id>.md`
4. Initiates round-call — creates claim in `tasks/active/`
5. Waits for claim window (polling, not blocking — picks up other tasks if claimed)
6. Creates branch `agent-{id}/T-042-<desc>` from latest `main`
7. Works on the task
8. Opens PR when done
9. Exits — agent is ephemeral, no persistent process needed

### Alternative: No-args Mode

```
tr0n-agent
```

Agent looks for an available task in `tasks/assigned/` (matched to its expertise), then follows the same flow.

### Configurable via env vars:

```bash
TR0N_AGENT_ID=agent-1 tr0n-agent
TR0N_CLAIM_WINDOW=2h tr0n-agent --task T-042
```

### Two Modes of Operation

#### 1. Standalone Agent (default)

A CLI tool that handles the full workflow: claim, branch, work, PR.

```
tr0n-agent --task T-042
```

#### 2. Protocol over stdin/stdout (for existing LLM clients)

The agent exposes a **protocol** that any LLM client can speak:

```
tr0n-agent --protocol
```

The client sends commands via stdin and reads responses via stdout:

```
> claim task T-042 scope "src/auth/"
< {"status": "pending", "expires": "2026-05-16T11:30:00Z"}

> check conflicts
< {"conflicts": []}

> create branch agent-1/T-042
< {"branch": "agent-1/T-042", "base": "abc123"}

> push branch
< {"status": "ok", "pr_url": "https://..."}
```

This way **opencode**, **aichat**, or any other LLM client can drive the agent as a sub-tool. The LLM client handles the reasoning; the agent handles the Git operations and coordination.

### Minimal JS Implementation

**Runtime:** Node.js (already installed on most dev machines)

**Dependencies:** zero npm packages. Uses only Node built-in modules:

| Need | Built-in module |
|------|-----------------|
| Git commands | `child_process.exec` |
| JSON | `fs.readFileSync` |
| File I/O | `fs` |
| Path handling | `path` |
| Argument parsing | `process.argv` |

**Operations via:**

| Operation | Tool |
|-----------|------|
| Git operations (fetch, checkout, push) | `git` CLI |
| PR creation/management | `gh` CLI |
| File updates (config, claims) | `git` (commit + push) |

No HTTP library needed — `gh` handles everything. If `gh` is not available, the agent can use `git` to push and the user manually creates the PR.

**Structure:**

```
agent/
├── agent.js          # Main entry point
├── claim.js          # Round-call logic
├── git.js            # Git operations
├── conflict.js       # Conflict detection/resolution
└── protocol.js       # stdin/stdout protocol
```

Single-file version is also possible — `agent.js` with everything inline.

## Key Principles

<!-- TODO: Add principle about test coverage requirements per agent -->
<!-- TODO: Add principle about documentation updates required alongside code changes -->

| Principle              | Why it matters                                           |
|------------------------|----------------------------------------------------------|
| Small, atomic tasks    | Less overlap = fewer conflicts                           |
| Stable interfaces      | Agents can change internals without breaking others      |
| Frequent integration   | Catch conflicts early, not at the end                    |
| Deterministic outputs  | Reduces "two agents do different things to the same code"|
| Clear ownership        | Assign files/modules to specific agents when possible    |

## Glossary

- [agent-identity.json](examples/agent-identity.json) — Complete agent identity file
- [task-claim.md](examples/task-claim.md) — Task claim file for round-call
- [task-definition.md](examples/task-definition.md) — Task definition with requirements
- [pr-template.md](examples/pr-template.md) — PR template for agent submissions
- [task-directory-structure.md](examples/task-directory-structure.md) — Task directory layout

## Real-World Examples

- Meta's WIP — agents work on branches, PRs are auto-reviewed
- OpenDevin / SWE-agent — task queue with file locking
- GitHub Copilot Workspaces — branch-per-agent with PR integration
