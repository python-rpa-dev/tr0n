const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- Setup ---

const TEST_DIR = path.join(__dirname, 'test-repo');
const AGENT_DIR = path.join(__dirname, '..', 'agent');

function setup() {
  // Clean up
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }

  // Create bare repo
  const bareDir = path.join(__dirname, 'bare-repo.git');
  if (fs.existsSync(bareDir)) {
    fs.rmSync(bareDir, { recursive: true });
  }
  execSync(`git init --bare ${bareDir}`, { cwd: __dirname });

  // Create working repo and initialize
  execSync(`git init`, { cwd: TEST_DIR });
  execSync('git config user.email "test@tr0n.dev"', { cwd: TEST_DIR });
  execSync('git config user.name "Test Agent"', { cwd: TEST_DIR });

  // Create initial content
  const srcDir = path.join(TEST_DIR, 'src');
  fs.mkdirSync(srcDir);
  fs.writeFileSync(path.join(srcDir, 'main.js'), '// Initial main\n');
  fs.writeFileSync(path.join(TEST_DIR, 'README.md'), '# Test Repo\n');

  execSync('git add .', { cwd: TEST_DIR });
  execSync('git commit -m "Initial commit"', { cwd: TEST_DIR });
  execSync(`git remote add origin ${bareDir}`, { cwd: TEST_DIR });
  execSync('git push -u origin main', { cwd: TEST_DIR });

  console.log('[test] Test repo created at:', TEST_DIR);
}

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
  const bareDir = path.join(__dirname, 'bare-repo.git');
  if (fs.existsSync(bareDir)) {
    fs.rmSync(bareDir, { recursive: true });
  }
  console.log('[test] Cleanup done');
}

// --- Test Helpers ---

function runAgent(args, cwd) {
  try {
    const result = execSync(`node ${path.join(AGENT_DIR, 'agent.js')} ${args}`, {
      cwd: cwd || TEST_DIR,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return { success: true, output: result };
  } catch (e) {
    return { success: false, output: e.stderr || e.stdout || e.message };
  }
}

function readTaskFile(taskId, agentId) {
  const file = path.join(TEST_DIR, 'tasks', 'active', `${taskId}-${agentId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readAgentRegistry(agentId) {
  const file = path.join(TEST_DIR, 'agents', `${agentId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function getBranches() {
  const out = execSync('git branch', { cwd: TEST_DIR, encoding: 'utf8' });
  return out.split('\n').map(l => l.trim().replace(/^\*/, '').trim()).filter(Boolean);
}

// --- Tests ---

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}`);
    failed++;
  }
}

// Test 1: Single agent claims a task
async function testSingleAgentClaim() {
  console.log('\n[Test 1] Single agent claims a task');

  // Setup config
  const configLocal = path.join(TEST_DIR, 'config', 'local');
  fs.mkdirSync(configLocal, { recursive: true });
  const settingsLocal = path.join(configLocal, 'settings.json');
  fs.writeFileSync(settingsLocal, JSON.stringify({
    claim_window_default: '1h',
    auto_confirm: true,
    conflict_strategy: 'defer-later',
    stale_branch_action: 'rebase',
    ci_timeout: 300,
    max_concurrent_agents: 5
  }));

  const agentConfig = {
    id: 'agent-1',
    name: 'Test Agent 1',
    platform: process.platform === 'win32' ? 'windows' : 'linux',
    shell: process.platform === 'win32' ? 'powershell' : 'bash',
    created: new Date().toISOString(),
    status: 'idle',
    current_task: null,
    current_branch: null,
    total_tasks_completed: 0,
    expertise: ['auth', 'security'],
    python: '3.12',
    node: '20',
    installed_tools: ['git', 'node'],
    missing_tools: [],
    last_sync: null
  };
  fs.writeFileSync(path.join(configLocal, 'agent.json'), JSON.stringify(agentConfig, null, 2));

  // Run agent with task
  const result = runAgent('--task T-001-test-claim --claim-window 1s', TEST_DIR);
  assert(result.success, 'Agent ran without error');

  // Check claim was created
  const claim = readTaskFile('T-001-test-claim', 'agent-1');
  assert(claim !== null, 'Claim file created');
  assert(claim !== null && claim.status === 'confirmed', 'Claim auto-confirmed (1s window)');
  assert(claim !== null && claim.scope.length > 0, 'Claim has scope defined');

  // Check branch was created
  const branches = getBranches();
  const branchExists = branches.some(b => b.startsWith('agent-1/T-001'));
  assert(branchExists, 'Branch created for task');

  // Check agent registry
  const registry = readAgentRegistry('agent-1');
  assert(registry !== null, 'Agent registry file exists');
  assert(registry !== null && registry.status === 'working', 'Agent status is working');
  assert(registry !== null && registry.current_task === 'T-001-test-claim', 'Agent current_task set');
}

// Test 2: Two agents on same scope (conflict detection)
async function testTwoAgentsConflict() {
  console.log('\n[Test 2] Two agents on same scope');

  // Setup second agent config
  const configLocal = path.join(TEST_DIR, 'config', 'local');
  const agentConfig2 = {
    id: 'agent-2',
    name: 'Test Agent 2',
    platform: process.platform === 'win32' ? 'windows' : 'linux',
    shell: process.platform === 'win32' ? 'powershell' : 'bash',
    created: new Date().toISOString(),
    status: 'idle',
    current_task: null,
    current_branch: null,
    total_tasks_completed: 0,
    expertise: ['db', 'migrations'],
    python: '3.11',
    node: '20',
    installed_tools: ['git', 'node'],
    missing_tools: [],
    last_sync: null
  };
  fs.writeFileSync(path.join(configLocal, 'agent.json'), JSON.stringify(agentConfig2, null, 2));

  // Create backlog task with overlapping scope
  const backlogDir = path.join(TEST_DIR, 'tasks', 'backlog');
  fs.mkdirSync(backlogDir, { recursive: true });

  // T-001 still active (agent-1 working)
  // Create T-002 with same scope
  const task2Content = `## Task\nT-002: Database migration\n\n## Priority\nmedium\n\n## Scope\n- src/main.js\n`;
  fs.writeFileSync(path.join(backlogDir, 'T-002.md'), task2Content);

  // Agent-2 tries to claim T-002 (overlaps with agent-1's T-001)
  const result = runAgent('--task T-002 --claim-window 1s', TEST_DIR);
  assert(result.success, 'Agent-2 ran without error');

  // Check claim was rejected due to conflict
  const claim = readTaskFile('T-002', 'agent-2');
  assert(claim !== null, 'Agent-2 claim file created');
  assert(claim !== null && claim.status === 'rejected', 'Agent-2 claim rejected due to conflict');

  // Check agent-2 status is idle (not working)
  const registry2 = readAgentRegistry('agent-2');
  assert(registry2 !== null, 'Agent-2 registry exists');
  assert(registry2 !== null && registry2.status === 'idle', 'Agent-2 status is idle after rejection');
}

// Test 3: Two agents on different scopes (no conflict)
async function testTwoAgentsNoConflict() {
  console.log('\n[Test 3] Two agents on different scopes');

  // Setup agent config back to agent-1
  const configLocal = path.join(TEST_DIR, 'config', 'local');
  const agentConfig1 = {
    id: 'agent-1',
    name: 'Test Agent 1',
    platform: process.platform === 'win32' ? 'windows' : 'linux',
    shell: process.platform === 'win32' ? 'powershell' : 'bash',
    created: new Date().toISOString(),
    status: 'working',
    current_task: 'T-001-test-claim',
    current_branch: 'agent-1/T-001-test-claim',
    total_tasks_completed: 0,
    expertise: ['auth', 'security'],
    python: '3.12',
    node: '20',
    installed_tools: ['git', 'node'],
    missing_tools: [],
    last_sync: new Date().toISOString()
  };
  fs.writeFileSync(path.join(configLocal, 'agent.json'), JSON.stringify(agentConfig1, null, 2));

  // Create T-003 with non-overlapping scope
  const backlogDir = path.join(TEST_DIR, 'tasks', 'backlog');
  fs.writeFileSync(path.join(backlogDir, 'T-003.md'), `## Task\nT-003: Add logging module\n\n## Priority\nlow\n\n## Scope\n- src/logging/\n`);

  // Setup as agent-2
  const agentConfig2 = {
    id: 'agent-2',
    name: 'Test Agent 2',
    platform: process.platform === 'win32' ? 'windows' : 'linux',
    shell: process.platform === 'win32' ? 'powershell' : 'bash',
    created: new Date().toISOString(),
    status: 'idle',
    current_task: null,
    current_branch: null,
    total_tasks_completed: 0,
    expertise: ['logging', 'utils'],
    python: '3.12',
    node: '20',
    installed_tools: ['git', 'node'],
    missing_tools: [],
    last_sync: new Date().toISOString()
  };
  fs.writeFileSync(path.join(configLocal, 'agent.json'), JSON.stringify(agentConfig2, null, 2));

  const result = runAgent('--task T-003 --claim-window 1s', TEST_DIR);
  assert(result.success, 'Agent-2 ran without error');

  const claim = readTaskFile('T-003', 'agent-2');
  assert(claim !== null, 'Agent-2 claim file created');
  assert(claim !== null && claim.status === 'confirmed', 'Agent-2 claim confirmed (no conflict)');

  const branches = getBranches();
  const branchExists = branches.some(b => b.startsWith('agent-2/T-003'));
  assert(branchExists, 'Agent-2 branch created (no conflict)');
}

// Test 4: Protocol mode command parsing
async function testProtocolMode() {
  console.log('\n[Test 4] Protocol mode command parsing');

  const protocol = require(path.join(AGENT_DIR, 'protocol.js'));

  // Test list-tasks (empty)
  const result = protocol.handleCommand('list-tasks');
  assert(result !== null && typeof result === 'object', 'list-tasks returns object');
  assert(Array.isArray(result.tasks), 'list-tasks returns tasks array');

  // Test list-agents
  const agentsResult = protocol.handleCommand('list-agents');
  assert(agentsResult !== null && typeof agentsResult === 'object', 'list-agents returns object');
  assert(Array.isArray(agentsResult.agents), 'list-agents returns agents array');

  // Test unknown command
  let threw = false;
  try {
    protocol.handleCommand('unknown-cmd');
  } catch (e) {
    threw = true;
    assert(e.message.includes('Unknown command'), 'Unknown command throws error');
  }
  assert(threw, 'Unknown command throws error');

  // Test check-conflicts
  const conflictsResult = protocol.handleCommand('check-conflicts');
  assert(conflictsResult !== null && typeof conflictsResult === 'object', 'check-conflicts returns object');
  assert(Array.isArray(conflictsResult.conflicts), 'check-conflicts returns conflicts array');
}

// Test 5: Claim expiration
async function testClaimExpiration() {
  console.log('\n[Test 5] Claim expiration');

  const claimMod = require(path.join(AGENT_DIR, 'claim.js'));

  const futureClaim = {
    task: 'T-999',
    agent: 'agent-test',
    scope: ['src/'],
    claimed_at: new Date().toISOString(),
    claim_window: '1h',
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    status: 'pending'
  };

  assert(!claimMod.isClaimExpired(futureClaim), 'Future claim is not expired');

  const pastClaim = {
    task: 'T-999',
    agent: 'agent-test',
    scope: ['src/'],
    claimed_at: new Date().toISOString(),
    claim_window: '1h',
    expires_at: new Date(Date.now() - 3600000).toISOString(),
    status: 'pending'
  };

  assert(claimMod.isClaimExpired(pastClaim), 'Past claim is expired');

  const remaining = claimMod.getRemainingTime(futureClaim);
  assert(remaining > 0, 'Remaining time is positive for future claim');
}

// Test 6: Conflict resolution priority rules
async function testConflictResolution() {
  console.log('\n[Test 6] Conflict resolution priority rules');

  const conflict = require(path.join(AGENT_DIR, 'conflict.js'));

  const claimA = {
    task: 'T-010',
    agent: 'agent-alpha',
    scope: ['src/auth/', 'src/session/'],
    claimed_at: '2026-05-16T10:00:00Z'
  };

  const claimB = {
    task: 'T-011',
    agent: 'agent-beta',
    scope: ['src/auth/', 'src/api/'],
    claimed_at: '2026-05-16T10:05:00Z'
  };

  // Detect conflict
  const detected = conflict.detectConflicts(claimA, claimB);
  assert(detected.hasConflict, 'Conflict detected between overlapping scopes');
  assert(detected.overlap.includes('src/auth/'), 'Overlap includes src/auth/');

  // Rule 1: Earlier claim wins
  const resolved = conflict.resolveByPriority(claimA, claimB);
  assert(resolved.winner.agent === 'agent-alpha', 'Earlier claim wins (rule 1)');
  assert(resolved.rule === 1, 'Rule 1 applied');

  // Rule 2: Shorter scope wins (same time)
  const claimC = {
    task: 'T-012',
    agent: 'agent-gamma',
    scope: ['src/auth/'],
    claimed_at: '2026-05-16T10:00:00Z'
  };

  const claimD = {
    task: 'T-013',
    agent: 'agent-delta',
    scope: ['src/auth/', 'src/session/'],
    claimed_at: '2026-05-16T10:00:00Z'
  };

  const resolved2 = conflict.resolveByPriority(claimC, claimD);
  assert(resolved2.winner.agent === 'agent-gamma', 'Shorter scope wins (rule 2)');
  assert(resolved2.rule === 2, 'Rule 2 applied');
}

// --- Run ---

async function run() {
  console.log('=== tr0n Agent Tests ===\n');

  setup();

  await testSingleAgentClaim();
  await testTwoAgentsConflict();
  await testTwoAgentsNoConflict();
  await testProtocolMode();
  await testClaimExpiration();
  await testConflictResolution();

  console.log(`\n=== Results ===`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}`);

  cleanup();

  process.exit(failed > 0 ? 1 : 0);
}

run();
