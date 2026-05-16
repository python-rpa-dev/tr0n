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

## LLM Client Discovery & Integration

The tr0n agent is a Git coordination tool — it does not call any LLM API itself. LLM clients discover and invoke the agent through different mechanisms depending on the client.

### How LLM clients discover the agent

There are **two discovery mechanisms**:

| Mechanism | How it works | Used by |
|-----------|-------------|---------|
| **File-based** | Client reads `tools/` directory or config for tool definitions | opencode, aichat |
| **Prompt-based** | Agent path and commands documented in system prompt or user instructions | LM Studio, Ollama |

### opencode — Tool Registration

opencode discovers tools via its configuration. Register the tr0n agent as a tool:

**Step 1: Create a tool definition file**

Create `tools/tr0n-agent.json` in your opencode workspace:

```json
{
  "name": "tr0n-agent",
  "description": "Git coordination agent for multi-LLM collaboration. Handles task claiming, conflict detection, branch management, and PR creation.",
  "command": ["node", "agent/agent.js", "--protocol"],
  "working_dir": ".",
  "stdin_protocol": true,
  "response_format": "json",
  "aliases": ["tr0n", "agent"],
  "commands": [
    { "name": "claim", "description": "Claim a task for work. Usage: claim T-042 src/auth/ tests/test_auth/" },
    { "name": "check-conflicts", "description": "Check for scope conflicts with other active agents" },
    { "name": "create-branch", "description": "Create a feature branch. Usage: create-branch agent-1/T-042" },
    { "name": "push", "description": "Push the current branch to remote" },
    { "name": "create-pr", "description": "Create a PR. Usage: create-pr agent-1/T-042 'Add auth module'" },
    { "name": "list-tasks", "description": "List all pending tasks in backlog" },
    { "name": "list-agents", "description": "List all active agents and their states" },
    { "name": "status", "description": "Show current branch, remote, and commit status" }
  ]
}
```

**Step 2: Register in opencode config**

Add to your opencode config (`~/.config/opencode/opencode.json`):

```json
{
  "tools": {
    "paths": ["./tools"]
  }
}
```

**Step 3: Invoke in opencode**

```
> Use tr0n-agent: claim T-042 src/auth/
```

opencode will:
1. Launch `node agent/agent.js --protocol` in the repo directory
2. Send `claim T-042 src/auth/` via stdin
3. Read the JSON response from stdout
4. Display the result to the user

### LM Studio — System Prompt Integration

LM Studio discovers the agent through the system prompt. There is no automatic discovery — the user provides the tool definition in the prompt.

**Step 1: Add to system prompt**

```
You have access to a Git coordination tool called tr0n-agent.
When you need to work on a task in this repository, use it.

Tool: tr0n-agent
Command: node agent/agent.js --protocol
Working directory: the repository root

Available commands (send one at a time):
- claim <task-id> <scope...> — Claim a task for work
- check-conflicts — Check for scope conflicts with other agents
- create-branch <branch-name> — Create a feature branch
- push — Push the current branch
- create-pr <branch> <title> — Create a pull request
- list-tasks — List pending tasks
- list-agents — List active agents
- status — Show current branch and commit status

The tool responds with JSON. Parse the "result" field for the outcome.
If the response has "status": "error", show the error to the user.
```

**Step 2: Use via chat**

```
User: Work on T-042 — add auth module

Assistant: I'll use the tr0n-agent tool to claim the task and create a branch.

> tr0n-agent: claim T-042 src/auth/ tests/test_auth/
< {"status":"ok","result":{"action":"claim-created","task":"T-042",...}}

> tr0n-agent: create-branch agent-1/T-042
< {"status":"ok","result":{"branch":"agent-1/T-042",...}}

Now I'll work on the task on this branch...
```

**Step 3: Script wrapper (optional)**

For easier invocation, create a wrapper script that the user can reference:

```bash
# launch-tr0n.sh (bash)
echo "$1" | node agent/agent.js --protocol | head -1
```

```powershell
# launch-tr0n.ps1 (PowerShell)
"$args" | node agent/agent.js --protocol | Select-Object -First 1
```

```cmd
:: launch-tr0n.cmd (cmd.exe)
node agent\agent.js --protocol <nul
```

### Ollama — Custom Tool via System Prompt

Ollama discovers the agent through the system prompt, similar to LM Studio. There is no automatic discovery.

**Step 1: Create a custom tool definition**

Save as `tools/tr0n-agent.json` in your Ollama workspace:

```json
{
  "type": "function",
  "function": {
    "name": "tr0n_agent",
    "description": "Git coordination agent for multi-LLM collaboration. Handles task claiming, conflict detection, branch management, and PR creation.",
    "parameters": {
      "type": "object",
      "properties": {
        "command": {
          "type": "string",
          "description": "Command to execute (claim, check-conflicts, create-branch, push, create-pr, list-tasks, list-agents, status)"
        },
        "args": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Arguments for the command"
        }
      },
      "required": ["command"]
    }
  }
}
```

**Step 2: Add to system prompt**

```
You have access to a Git coordination tool called tr0n-agent.
It manages task claiming, conflict detection, branch creation, and PR submission.

When the user asks you to work on a task:
1. Call tr0n_agent with command="claim" and args=[task-id, scope...]
2. Parse the JSON response
3. If no conflicts, call tr0n_agent with command="create-branch"
4. Work on the task
5. When done, call tr0n_agent with command="push" and command="create-pr"

If the tool returns an error, explain the issue to the user.
```

**Step 3: Invoke via API**

When Ollama calls the function, execute:

```bash
# For claim command
echo "claim T-042 src/auth/" | node agent/agent.js --protocol | head -1

# For other commands
echo "push" | node agent/agent.js --protocol | head -1
```

### aichat — Shell Function / Alias

aichat discovers the agent via shell functions or aliases. No automatic discovery — the user configures it.

**Step 1: Add shell function**

Add to your shell config (`~/.bashrc`, `~/.zshrc`, or `~/.config/powershell/Microsoft.PowerShell_profile.ps1`):

**bash/zsh:**
```bash
# tr0n agent wrapper
tr0n() {
  if [ "$1" = "--protocol" ]; then
    node agent/agent.js --protocol
  else
    node agent/agent.js "$@"
  fi
}

# Protocol helper — send a command and get JSON response
tr0n-protocol() {
  echo "$1" | node agent/agent.js --protocol | head -1
}

# Task launcher — quick task execution
tr0n-task() {
  node agent/agent.js --task "$1"
}
```

**PowerShell:**
```powershell
# tr0n agent wrapper
function tr0n {
  if ($args[0] -eq "--protocol") {
    node agent/agent.js --protocol
  } else {
    node agent/agent.js @args
  }
}

# Protocol helper
function tr0n-protocol {
  $args -join ' ' | node agent/agent.js --protocol | Select-Object -First 1
}

# Task launcher
function tr0n-task {
  node agent/agent.js --task $args[0]
}
```

**Step 2: Use in aichat**

```bash
# Execute a task
tr0n-task T-042

# Protocol mode via pipe
echo "list-tasks" | tr0n-protocol
```

### Discovery Summary

| Client | Discovery mechanism | Auto-discovery? | Setup required |
|--------|-------------------|-----------------|----------------|
| **opencode** | Tool definition file in `tools/` | No | Create `tools/tr0n-agent.json` + config |
| **LM Studio** | System prompt | No | Add tool definition to system prompt |
| **Ollama** | System prompt + function calling | No | Add tool definition to system prompt |
| **aichat** | Shell function/alias | No | Add function to shell config |

All clients require **manual setup** — there is no automatic discovery. This is by design: the agent is a Git tool, not an LLM service. Each client needs to know how to invoke it.

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
