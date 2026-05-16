# Agent Installation, Launch & Debugging

## Prerequisites

- **Node.js** 18+ (built-in modules only, zero npm dependencies)
- **git** 2.30+
- **gh CLI** (GitHub CLI, optional — if missing, PRs must be created manually)

## Installation

No installation required. The agent uses Node.js built-in modules only.

### 1. Clone the repository

**PowerShell (Windows):**
```powershell
git clone https://github.com/<user>/tr0n.git
cd tr0n
```

**cmd.exe (Windows):**
```cmd
git clone https://github.com/<user>/tr0n.git
cd tr0n
```

**bash (Linux/macOS):**
```bash
git clone https://github.com/<user>/tr0n.git
cd tr0n
```

### 2. Configure local settings

**PowerShell (Windows):**
```powershell
New-Item -ItemType Directory -Path config\local -Force
Copy-Item config\templates\agent.json.example config\local\agent.json
Copy-Item config\templates\settings.json.example config\local\settings.json
```

**cmd.exe (Windows):**
```cmd
mkdir config\local
copy config\templates\agent.json.example config\local\agent.json
copy config\templates\settings.json.example config\local\settings.json
```

**bash (Linux/macOS):**
```bash
mkdir -p config/local
cp config/templates/agent.json.example config/local/agent.json
cp config/templates/settings.json.example config/local/settings.json
```

### 3. Edit agent config

Edit `config/local/agent.json` to set your agent identity:

```json
{
  "id": "agent-{your-id}",
  "name": "My Agent",
  "platform": "windows",
  "shell": "powershell",
  "expertise": ["auth", "security"],
  "python": "3.12",
  "node": "20",
  "installed_tools": ["git", "node"],
  "missing_tools": ["docker"]
}
```

See [agent.json.example](config/templates/agent.json.example) for the full template.

## Launching Agents

### Standalone mode (CLI)

Launch an agent with a specific task:

**PowerShell:**
```powershell
node agent/agent.js --task T-042
```

**cmd.exe:**
```cmd
node agent\agent.js --task T-042
```

**bash:**
```bash
node agent/agent.js --task T-042
```

With custom claim window:
```bash
node agent/agent.js --task T-042 --claim-window 30min
```

No-args mode (agent picks available task):
```bash
node agent/agent.js
```

### Protocol mode (stdin/stdout)

For LLM clients (opencode, aichat, etc.):

```bash
node agent/agent.js --protocol
```

The agent then reads commands from stdin and writes JSON responses to stdout:

```
> list-tasks
< {"status":"ok","result":{"tasks":[]}}

> claim T-042 src/auth/ tests/test_auth/
< {"status":"ok","result":{"action":"claim-created","task":"T-042","scope":["src/auth/","tests/test_auth/"]}}

> check-conflicts
< {"status":"ok","result":{"conflicts":[]}}

> create-branch agent-1/T-042
< {"status":"ok","result":{"branch":"agent-1/T-042","base":"origin/main"}}

> push
< {"status":"ok","result":{"branch":"agent-1/T-042","pr_url":null}}

> create-pr agent-1/T-042 "Add auth module"
< {"status":"ok","result":{"pr_url":"https://github.com/...","title":"Add auth module","branch":"agent-1/T-042"}}

> list-agents
< {"status":"ok","result":{"agents":[]}}

> status
< {"status":"ok","result":{"branch":"agent-1/T-042","remote":"...","ahead":5}}
```

### Environment variables

Override defaults via environment:

**PowerShell:**
```powershell
$env:TR0N_AGENT_ID = "agent-1"
node agent/agent.js

$env:TR0N_CLAIM_WINDOW = "2h"
node agent/agent.js --task T-042
```

**cmd.exe:**
```cmd
set TR0N_AGENT_ID=agent-1
node agent\agent.js

set TR0N_CLAIM_WINDOW=2h
node agent\agent.js --task T-042
```

**bash:**
```bash
export TR0N_AGENT_ID=agent-1
node agent/agent.js

export TR0N_CLAIM_WINDOW=2h
node agent/agent.js --task T-042
```

## Agent Workflow

Each agent launch follows this lifecycle:

```
1. Load identity from config/local/agent.json
2. Detect environment (OS, shell, tools)
3. Register in agents/agent-{id}.json (repo state)
4. Fetch latest main
5. Process task:
   a. Create claim (pending) in tasks/active/
   b. Check conflicts with other agents
   c. Auto-confirm if no conflicts
   d. Create branch: agent-{id}/T-NNN-{desc}
   e. Update state to 'working'
6. Exit (agent is ephemeral — state is in the repo)
```

## Debugging

### Enable verbose output

The agent prints its state transitions to stdout. Look for `[tr0n]` prefixed lines:

```
[tr0n] Starting agent...
[tr0n] Agent ID: agent-1
[tr0n] Environment: windows / powershell / tools: git, node
[tr0n] Missing tools: docker
[tr0n] Active agents: agent-1
[tr0n] Fetching latest main...
[tr0n] Creating claim for T-042 (window: 1h)...
[tr0n] Claim created: {"task":"T-042","agent":"agent-1",...}
[tr0n] Checking for conflicts...
[tr0n] Auto-confirming claim (no objections)...
[tr0n] Creating branch for T-042...
[tr0n] Branch created: agent-1/T-042-add-auth
[tr0n] Ready to work!
```

### Common issues

| Problem | Cause | Fix |
|---------|-------|-----|
| `No agent config found` | Missing `config/local/agent.json` | Copy from `config/templates/agent.json.example` |
| `gh CLI not found` | `gh` not installed | Install from https://cli.github.com or create PR manually |
| Claim rejected | Another agent has an earlier claim | Check `tasks/active/` for existing claims |
| Branch already exists | Agent was re-run | Delete branch or use a different task |
| `git fetch origin` fails | Remote not configured | Run `git remote add origin <url>` |

### Inspecting agent state

**Active claims:**
```bash
cat tasks/active/T-042-agent-1.json
```

**Agent registry:**
```bash
cat agents/agent-1.json
```

**All active agents:**
```bash
ls agents/
```

**Branch list:**
```bash
git branch -a
```

### Test suite

Run the agent test suite (uses a local bare repo, no remote needed):

```bash
node tests/agent-test.js
```

Tests cover:
1. Single agent task claim
2. Two-agent conflict detection
3. Two-agent no-conflict scenario
4. Protocol mode command parsing
5. Claim expiration
6. Conflict resolution priority rules

## LLM Client Integration

### opencode

Use the agent as a sub-tool in opencode by invoking it via the protocol mode:

```bash
# In opencode, invoke the agent as a tool
> Run: node agent/agent.js --protocol
```

The agent then accepts commands via stdin/stdout. Example opencode workflow:

```
1. Assign task to agent via opencode
2. opencode invokes: node agent/agent.js --protocol
3. opencode sends: claim T-042 src/auth/ tests/test_auth/
4. Agent responds: {"status":"ok","result":{"action":"claim-created",...}}
5. opencode sends: create-branch agent-1/T-042
6. Agent responds: {"status":"ok","result":{"branch":"agent-1/T-042",...}}
7. opencode sends: push
8. Agent responds: {"status":"ok","result":{"branch":"agent-1/T-042",...}}
9. opencode sends: create-pr agent-1/T-042 "Add auth module"
10. Agent responds: {"status":"ok","result":{"pr_url":"https://...",...}}
```

### LM Studio

LM Studio can drive the agent via its API by piping commands. Use a script wrapper:

```bash
# launch-lmstudio.sh (bash)
#!/bin/bash
# Send a claim command to the agent and get the response
echo "claim T-042 src/auth/" | node agent/agent.js --protocol | head -1
```

```powershell
# launch-lmstudio.ps1 (PowerShell)
# Send a claim command to the agent and get the response
"claim T-042 src/auth/" | node agent/agent.js --protocol | Select-Object -First 1
```

```cmd
:: launch-lmstudio.cmd (cmd.exe)
:: Send a claim command to the agent and get the response
echo claim T-042 src/auth\ | node agent\agent.js --protocol
```

### Ollama

Ollama can be used as the reasoning engine that drives the agent. Configure a custom tool in your Ollama integration:

```bash
# Command to invoke tr0n agent with a task
node agent/agent.js --task {task_id}
```

Example Ollama system prompt for tr0n integration:

```
You are an agent coordinator for tr0n, a multi-LLM collaboration system.
When a task needs to be assigned, invoke the agent CLI:
  node agent/agent.js --task T-NNN
Or use protocol mode for complex workflows:
  node agent/agent.js --protocol
The agent responds with JSON. Parse the response to check claim status,
branch creation, and PR creation.
```

### aichat

aichat can invoke the agent as an external command:

```bash
# Single task execution
aichat --shell "node agent/agent.js --task T-042"

# Protocol mode via pipe
echo "list-tasks" | aichat --shell "node agent/agent.js --protocol"
```

## Config Reference

### config/local/agent.json

Agent identity and capability declaration.

See [agent.json.example](config/templates/agent.json.example).

### config/local/settings.json

System-wide settings for claim windows, conflict resolution, and CI behavior.

See [settings.json.example](config/templates/settings.json.example).

## Directory Structure

```
tr0n/
├── agent/
│   ├── agent.js          # Main entry point (CLI + protocol)
│   ├── claim.js          # Claim lifecycle (create, confirm, reject)
│   ├── git.js            # Git operations (fetch, checkout, push, rebase)
│   ├── conflict.js       # Conflict detection & resolution
│   └── protocol.js       # stdin/stdout protocol for LLM clients
├── config/
│   ├── templates/
│   │   ├── agent.json.example    # Agent config template
│   │   └── settings.json.example # System settings template
│   └── local/
│       ├── agent.json            # Agent identity (gitignored)
│       └── settings.json         # System settings (gitignored)
├── agents/
│   └── agent-{id}.json         # Shared agent state (tracked)
├── tasks/
│   ├── backlog/                # Pending tasks
│   ├── active/                 # Active claims
│   └── objections/             # Objections to claims
├── tests/
│   └── agent-test.js           # Agent test suite
├── concept.md
├── README.md
├── AGENTS.md
└── .gitignore
```
