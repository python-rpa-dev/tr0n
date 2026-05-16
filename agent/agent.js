const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_LOCAL = path.join(REPO_ROOT, 'config', 'local', 'agent.json');
const CONFIG_TEMPLATE = path.join(REPO_ROOT, 'config', 'templates', 'agent.json.example');
const AGENTS_DIR = path.join(REPO_ROOT, 'agents');
const TASKS_DIR = path.join(REPO_ROOT, 'tasks');
const SETTINGS_FILE = path.join(REPO_ROOT, 'config', 'local', 'settings.json');

// --- Config ---

function loadConfig() {
  if (fs.existsSync(CONFIG_LOCAL)) {
    return JSON.parse(fs.readFileSync(CONFIG_LOCAL, 'utf8'));
  }
  if (fs.existsSync(CONFIG_TEMPLATE)) {
    const tpl = JSON.parse(fs.readFileSync(CONFIG_TEMPLATE, 'utf8'));
    if (!fs.existsSync(path.dirname(CONFIG_LOCAL))) {
      fs.mkdirSync(path.dirname(CONFIG_LOCAL), { recursive: true });
    }
    fs.writeFileSync(CONFIG_LOCAL, JSON.stringify(tpl, null, 2));
    return JSON.parse(fs.readFileSync(CONFIG_LOCAL, 'utf8'));
  }
  throw new Error('No agent config found. Create config/local/agent.json or copy from config/templates/agent.json.example');
}

function saveConfig(cfg) {
  if (!fs.existsSync(path.dirname(CONFIG_LOCAL))) {
    fs.mkdirSync(path.dirname(CONFIG_LOCAL), { recursive: true });
  }
  fs.writeFileSync(CONFIG_LOCAL, JSON.stringify(cfg, null, 2));
}

function loadSettings() {
  const defaults = {
    claim_window_default: '1h',
    auto_confirm: true,
    conflict_strategy: 'defer-later',
    stale_branch_action: 'rebase',
    ci_timeout: 300,
    max_concurrent_agents: 5
  };
  if (!fs.existsSync(SETTINGS_FILE)) {
    return defaults;
  }
  return { ...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
}

// --- Git ---

function git(args) {
  return execSync(`git ${args}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function gitSafe(args) {
  try {
    return execSync(`git ${args}`, { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (e) {
    return null;
  }
}

// --- Identity ---

function ensureAgentRegistry(cfg) {
  if (!fs.existsSync(AGENTS_DIR)) {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
  }
  const agentFile = path.join(AGENTS_DIR, `${cfg.id}.json`);
  if (!fs.existsSync(agentFile)) {
    const registryEntry = {
      id: cfg.id,
      status: 'idle',
      current_task: null,
      current_branch: null,
      last_transition: new Date().toISOString(),
      transition_trigger: 'first_run',
      environment: cfg.environment || null,
      created: cfg.created || new Date().toISOString(),
      total_tasks_completed: 0,
      expertise: cfg.expertise || []
    };
    fs.writeFileSync(agentFile, JSON.stringify(registryEntry, null, 2));
  }
}

function updateRegistry(cfg) {
  ensureAgentRegistry(cfg);
  const agentFile = path.join(AGENTS_DIR, `${cfg.id}.json`);
  const entry = JSON.parse(fs.readFileSync(agentFile, 'utf8'));
  entry.status = cfg.status;
  entry.current_task = cfg.current_task;
  entry.current_branch = cfg.current_branch;
  entry.last_transition = new Date().toISOString();
  entry.transition_trigger = cfg._transitionTrigger || 'manual';
  if (cfg.environment) {
    entry.environment = cfg.environment;
  }
  fs.writeFileSync(agentFile, JSON.stringify(entry, null, 2));
}

function loadRegistry() {
  if (!fs.existsSync(AGENTS_DIR)) return {};
  const entries = {};
  const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.json') && !f.includes('archived'));
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8'));
    entries[data.id] = data;
  }
  return entries;
}

// --- Environment Detection ---

function detectOS() {
  if (process.platform === 'win32') {
    try {
      const info = gitSafe('config --get init.defaultBranch') || '';
      return { os: 'windows', shell: 'powershell', shellVersion: process.env.PSVersion ? process.env.PSVersion.split('.')[0] + '.0' : 'unknown' };
    } catch {
      return { os: 'windows', shell: 'powershell', shellVersion: 'unknown' };
    }
  }
  if (process.platform === 'darwin') return { os: 'macos', shell: 'zsh', shellVersion: 'unknown' };
  return { os: 'linux', shell: 'bash', shellVersion: 'unknown' };
}

function detectTool(name) {
  const cmd = process.platform === 'win32'
    ? `where ${name} 2>nul && ${name} --version 2>nul`
    : `${name} --version 2>/dev/null`;
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
    const match = out.match(/(\d+\.\d+(\.\d+)?)/);
    return match ? match[1] : 'unknown';
  } catch {
    return null;
  }
}

function detectEnvironment() {
  const osInfo = detectOS();
  const tools = {
    git: detectTool('git'),
    node: detectTool('node'),
    python: detectTool(process.platform === 'win32' ? 'python' : 'python3'),
    docker: detectTool('docker'),
    gh: detectTool('gh')
  };
  const installed = Object.entries(tools).filter(([, v]) => v !== null).map(([k]) => k);
  const missing = Object.entries(tools).filter(([, v]) => v === null).map(([k]) => k);
  return {
    os: osInfo.os,
    os_version: process.platform === 'win32' ? '10/11' : (process.platform === 'darwin' ? 'unknown' : 'unknown'),
    shell: osInfo.shell,
    shell_version: osInfo.shellVersion,
    tools,
    installed,
    missing
  };
}

// --- Branch ---

function createBranch(taskId, description, cfg) {
  const branchName = `${cfg.id}/${taskId}-${description.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '')}`;

  git('fetch origin');
  git('checkout -b ' + branchName + ' origin/main');

  return branchName;
}

function pushBranch(branchName) {
  git('push -u origin ' + branchName);
  return branchName;
}

function getBranchList() {
  const out = gitSafe('branch -a') || '';
  return out.split('\n').map(l => l.trim().replace(/^[\* ]+/, '')).filter(Boolean);
}

function getActiveAgents() {
  const registry = loadRegistry();
  const branches = getBranchList();
  const active = {};

  for (const [id, entry] of Object.entries(registry)) {
    const matchingBranch = branches.find(b => b.startsWith(id + '/'));
    if (entry.status === 'working' || entry.status === 'reviewing' || matchingBranch) {
      active[id] = { ...entry, activeBranch: matchingBranch || null };
    }
  }

  return active;
}

// --- PR ---

function createPR(branchName, taskId, cfg) {
  const settings = loadSettings();
  const templatePath = path.join(REPO_ROOT, 'examples', 'pr-template.md');
  let body = '';

  if (fs.existsSync(templatePath)) {
    body = fs.readFileSync(templatePath, 'utf8')
      .replace('{TASK-ID}', taskId)
      .replace('{TASK TITLE}', taskId)
      .replace('{AGENT-ID}', cfg.id);
  } else {
    body = `## Task\n${taskId}\n\n## Agent\n${cfg.id}\n\n## Changes\n- See branch for changes\n\n## Tests\n- [ ] Unit tests included\n- [ ] Integration tests included\n- [ ] All tests passing\n\n## Notes\nAutomated PR from tr0n agent.`;
  }

  if (!gitSafe('which gh') && !gitSafe('command -v gh')) {
    console.log(`\n[tr0n] gh CLI not found. Please create PR manually:\n`);
    console.log(`  git push origin ${branchName}`);
    console.log(`  gh pr create --base main --head ${branchName} --title "${taskId}: ${cfg.id}"`);
    return null;
  }

  try {
    const result = execSync(
      `gh pr create --base main --head ${branchName} --title "${taskId}: ${cfg.id}" --body-file -`,
      { cwd: REPO_ROOT, encoding: 'utf8', input: body }
    );
    return result;
  } catch (e) {
    console.error(`[tr0n] Failed to create PR: ${e.message}`);
    return null;
  }
}

// --- Claim ---

function createClaim(taskId, scope, claimWindow, cfg) {
  const now = new Date();
  const expiresMs = parseDuration(claimWindow);
  const expires = new Date(now.getTime() + expiresMs);

  const claim = {
    task: taskId,
    agent: cfg.id,
    scope,
    claimed_at: now.toISOString(),
    claim_window: claimWindow,
    expires_at: expires.toISOString(),
    status: 'pending'
  };

  const activeDir = path.join(TASKS_DIR, 'active');
  if (!fs.existsSync(activeDir)) {
    fs.mkdirSync(activeDir, { recursive: true });
  }

  const claimFile = path.join(activeDir, `${taskId}-${cfg.id}.md`);
  fs.writeFileSync(claimFile, formatClaim(claim));

  // Also create JSON version for machine reading
  const jsonFile = path.join(activeDir, `${taskId}-${cfg.id}.json`);
  fs.writeFileSync(jsonFile, JSON.stringify(claim, null, 2));

  return claim;
}

function formatClaim(claim) {
  let md = `## Task\n${claim.task}\n\n`;
  md += `## Agent\n${claim.agent}\n\n`;
  md += `## Scope\n`;
  for (const s of claim.scope) {
    md += `- ${s}\n`;
  }
  md += `\n## Claimed at\n${claim.claimed_at}\n\n`;
  md += `## Claim window\n${claim.claim_window}\n\n`;
  md += `## Expires at\n${claim.expires_at}\n\n`;
  md += `## Status\n${claim.status}\n`;
  return md;
}

function checkConflicts(claim) {
  const activeAgents = getActiveAgents();
  const conflicts = [];

  for (const [agentId, agent] of Object.entries(activeAgents)) {
    if (agentId === claim.agent) continue;
    if (agent.status !== 'working' && agent.status !== 'claiming') continue;

    const otherClaimFile = path.join(TASKS_DIR, 'active', `${agent.current_task}-${agentId}.json`);
    if (!fs.existsSync(otherClaimFile)) continue;

    const otherClaim = JSON.parse(fs.readFileSync(otherClaimFile, 'utf8'));
    const overlap = claim.scope.filter(s => otherClaim.scope.includes(s));
    if (overlap.length > 0) {
      conflicts.push({
        agent: agentId,
        task: otherClaim.task,
        overlap
      });
    }
  }

  return conflicts;
}

function confirmClaim(claim) {
  claim.status = 'confirmed';
  const jsonFile = path.join(TASKS_DIR, 'active', `${claim.task}-${claim.agent}.json`);
  fs.writeFileSync(jsonFile, JSON.stringify(claim, null, 2));

  const mdFile = path.join(TASKS_DIR, 'active', `${claim.task}-${claim.agent}.md`);
  fs.writeFileSync(mdFile, formatClaim(claim));

  return claim;
}

function rejectClaim(claim, reason) {
  claim.status = 'rejected';
  claim.expired_reason = reason;
  const jsonFile = path.join(TASKS_DIR, 'active', `${claim.task}-${claim.agent}.json`);
  fs.writeFileSync(jsonFile, JSON.stringify(claim, null, 2));
  return claim;
}

function parseDuration(str) {
  const match = str.match(/^(\d+)([smh])$/);
  if (!match) throw new Error(`Invalid duration: ${str}`);
  const [, val, unit] = match;
  const ms = parseInt(val);
  if (unit === 's') return ms * 1000;
  if (unit === 'm') return ms * 60 * 1000;
  if (unit === 'h') return ms * 60 * 60 * 1000;
  throw new Error(`Unknown unit: ${unit}`);
}

// --- Main ---

function main() {
  const args = process.argv.slice(2);
  const taskIdx = args.indexOf('--task');
  const windowIdx = args.indexOf('--claim-window');
  const protocolIdx = args.indexOf('--protocol');

  if (protocolIdx !== -1) {
    require('./protocol').start();
    return;
  }

  const taskId = taskIdx !== -1 ? args[taskIdx + 1] : null;
  const claimWindow = windowIdx !== -1 ? args[windowIdx + 1] : null;

  console.log('[tr0n] Starting agent...');

  // Load config
  const cfg = loadConfig();
  console.log(`[tr0n] Agent ID: ${cfg.id}`);

  // Detect environment
  const env = detectEnvironment();
  cfg.environment = env;
  console.log(`[tr0n] Environment: ${env.os} / ${env.shell} / tools: ${env.installed.join(', ')}`);
  if (env.missing.length > 0) {
    console.log(`[tr0n] Missing tools: ${env.missing.join(', ')}`);
  }

  // Ensure registry
  updateRegistry(cfg);
  const registry = loadRegistry();
  console.log(`[tr0n] Active agents: ${Object.keys(registry).join(', ') || 'none'}`);

  // Fetch latest
  console.log('[tr0n] Fetching latest main...');
  git('fetch origin');

  if (!taskId) {
    // No-args mode: look for available task
    console.log('[tr0n] No task specified. Looking for available tasks...');
    const assignedDir = path.join(TASKS_DIR, 'assigned');
    if (!fs.existsSync(assignedDir)) {
      console.log('[tr0n] No assigned tasks found. Agent idle.');
      cfg.status = 'idle';
      updateRegistry(cfg);
      return;
    }

    const taskFiles = fs.readdirSync(assignedDir).filter(f => f.endsWith('.md'));
    let foundTask = null;
    for (const f of taskFiles) {
      const content = fs.readFileSync(path.join(assignedDir, f), 'utf8');
      const taskMatch = content.match(/## Task\s*\n\s*(T-\d+)/);
      if (taskMatch) {
        foundTask = taskMatch[1];
        break;
      }
    }

    if (!foundTask) {
      console.log('[tr0n] No available tasks. Agent idle.');
      cfg.status = 'idle';
      updateRegistry(cfg);
      return;
    }

    console.log(`[tr0n] Found task: ${foundTask}`);
    processTask(foundTask, claimWindow || loadSettings().claim_window_default, cfg);
    return;
  }

  processTask(taskId, claimWindow || loadSettings().claim_window_default, cfg);
}

function processTask(taskId, claimWindow, cfg) {
  // Step 1: Create claim
  console.log(`[tr0n] Creating claim for ${taskId} (window: ${claimWindow})...`);

  // Read task definition for scope
  let scope = [];
  const backlogDir = path.join(TASKS_DIR, 'backlog');
  if (fs.existsSync(backlogDir)) {
    const taskFiles = fs.readdirSync(backlogDir).filter(f => f.includes(taskId));
    for (const f of taskFiles) {
      const content = fs.readFileSync(path.join(backlogDir, f), 'utf8');
      const scopeMatch = content.match(/## Scope\s*\n((?:- .+\n)+)/);
      if (scopeMatch) {
        scope = scopeMatch[1].split('\n').map(l => l.replace(/^-\s+/, '').trim()).filter(Boolean);
      }
    }
  }

  if (scope.length === 0) {
    scope = ['src/'];
    console.log(`[tr0n] No scope defined, using default: ${scope.join(', ')}`);
  }

  const claim = createClaim(taskId, scope, claimWindow, cfg);
  console.log(`[tr0n] Claim created: ${JSON.stringify(claim)}`);

  // Step 2: Check for conflicts
  console.log('[tr0n] Checking for conflicts...');
  const conflicts = checkConflicts(claim);

  if (conflicts.length > 0) {
    console.log(`[tr0n] Conflicts detected with: ${conflicts.map(c => c.agent).join(', ')}`);
    for (const c of conflicts) {
      console.log(`  ${c.agent} (${c.task}): overlaps on ${c.overlap.join(', ')}`);
    }

    // Apply conflict resolution
    const settings = loadSettings();
    if (settings.conflict_strategy === 'defer-later') {
      const earlierClaim = conflicts.find(c => {
        const otherFile = path.join(TASKS_DIR, 'active', `${c.task}-${c.agent}.json`);
        if (!fs.existsSync(otherFile)) return false;
        const other = JSON.parse(fs.readFileSync(otherFile, 'utf8'));
        return new Date(other.claimed_at) < new Date(claim.claimed_at);
      });

      if (earlierClaim) {
        console.log(`[tr0n] Conflict: ${earlierClaim.agent} claimed earlier. Deferring.`);
        rejectClaim(claim, `Conflict with earlier claim by ${earlierClaim.agent}`);
        cfg.status = 'idle';
        updateRegistry(cfg);
        return;
      }
    }
  }

  // Step 3: Confirm claim
  const settings = loadSettings();
  if (settings.auto_confirm) {
    console.log('[tr0n] Auto-confirming claim (no objections)...');
    confirmClaim(claim);
  } else {
    console.log(`[tr0n] Claim pending for ${claimWindow}. No auto-confirm.`);
    cfg.status = 'claiming';
    cfg.current_task = taskId;
    updateRegistry(cfg);
    return;
  }

  // Step 4: Create branch
  const desc = taskId; // Use task ID as short desc
  console.log(`[tr0n] Creating branch for ${taskId}...`);
  const branchName = createBranch(taskId, desc, cfg);
  console.log(`[tr0n] Branch created: ${branchName}`);

  // Step 5: Update state
  cfg.status = 'working';
  cfg.current_task = taskId;
  cfg.current_branch = branchName;
  updateRegistry(cfg);

  console.log(`\n[tr0n] Ready to work!`);
  console.log(`  Task: ${taskId}`);
  console.log(`  Branch: ${branchName}`);
  console.log(`  Scope: ${scope.join(', ')}`);
  console.log(`  Push when done: git push origin ${branchName}`);
  console.log(`  Create PR: gh pr create --base main --head ${branchName}\n`);
}

module.exports = {
  loadConfig,
  saveConfig,
  loadSettings,
  git,
  gitSafe,
  detectEnvironment,
  createBranch,
  pushBranch,
  createPR,
  createClaim,
  confirmClaim,
  rejectClaim,
  checkConflicts,
  loadRegistry,
  updateRegistry,
  processTask
};

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(`[tr0n] Error: ${e.message}`);
    process.exit(1);
  }
}
