const fs = require('fs');
const path = require('path');

const TASKS_DIR = path.resolve(__dirname, '..', 'tasks');
const AGENTS_DIR = path.join(path.resolve(__dirname, '..'), 'agents');

// --- Claim Lifecycle ---

function createClaim(taskId, scope, claimWindow, agentId) {
  const now = new Date();
  const expiresMs = parseDuration(claimWindow);
  const expires = new Date(now.getTime() + expiresMs);

  const claim = {
    task: taskId,
    agent: agentId,
    scope,
    claimed_at: now.toISOString(),
    claim_window: claimWindow,
    expires_at: expires.toISOString(),
    status: 'pending'
  };

  const activeDir = path.join(TASKS_DIR, 'active');
  ensureDir(activeDir);

  const claimFile = path.join(activeDir, `${taskId}-${agentId}.json`);
  fs.writeFileSync(claimFile, JSON.stringify(claim, null, 2));

  return claim;
}

function getClaim(taskId, agentId) {
  const jsonFile = path.join(TASKS_DIR, 'active', `${taskId}-${agentId}.json`);
  if (!fs.existsSync(jsonFile)) return null;
  return JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
}

function updateClaim(taskId, agentId, updates) {
  const jsonFile = path.join(TASKS_DIR, 'active', `${taskId}-${agentId}.json`);
  if (!fs.existsSync(jsonFile)) {
    throw new Error(`Claim not found: ${taskId} (${agentId})`);
  }
  const claim = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  Object.assign(claim, updates);
  fs.writeFileSync(jsonFile, JSON.stringify(claim, null, 2));
  return claim;
}

function listActiveClaims() {
  const activeDir = path.join(TASKS_DIR, 'active');
  if (!fs.existsSync(activeDir)) return [];

  return fs.readdirSync(activeDir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(activeDir, f), 'utf8')));
}

function checkObjections(taskId, agentId) {
  const objectionsDir = path.join(TASKS_DIR, 'objections', `${taskId}-${agentId}`);
  if (!fs.existsSync(objectionsDir)) return [];

  return fs.readdirSync(objectionsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({
      file: f,
      agent: f.replace('.md', ''),
      content: fs.readFileSync(path.join(objectionsDir, f), 'utf8')
    }));
}

function submitObjection(taskId, targetAgent, objectingAgent, overlap, resolution) {
  const objectionsDir = path.join(TASKS_DIR, 'objections', `${taskId}-${targetAgent}`);
  ensureDir(objectionsDir);

  const now = new Date().toISOString();
  const objFile = path.join(objectionsDir, `${taskId}-${objectingAgent}.md`);

  const md = `## Objecting to\n${taskId} (${targetAgent})\n\n`;
  md += `## My overlapping task\n${taskId} (${objectingAgent})\n\n`;
  md += `## Overlap\n`;
  for (const s of overlap) {
    md += `- ${s}  ← both tasks modify this file\n`;
  }
  md += `\n## Proposed resolution\n`;
  for (const r of (resolution || ['Defer: return to backlog'])) {
    md += `- ${r}\n`;
  }
  md += `\n## Submitted at\n${now}\n`;

  fs.writeFileSync(objFile, md);
  return { file: objFile, agent: objectingAgent };
}

function resolveClaim(taskId, agentId, resolution, resolvedBy) {
  const jsonFile = path.join(TASKS_DIR, 'active', `${taskId}-${agentId}.json`);
  if (!fs.existsSync(jsonFile)) {
    throw new Error(`Claim not found: ${taskId} (${agentId})`);
  }
  const claim = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  claim.status = resolution.status;
  claim.resolution = resolution.reason;
  claim.resolved_by = resolvedBy;
  claim.resolved_at = new Date().toISOString();
  fs.writeFileSync(jsonFile, JSON.stringify(claim, null, 2));
  return claim;
}

function isClaimExpired(claim) {
  return new Date(claim.expires_at) < new Date();
}

function getRemainingTime(claim) {
  const diff = new Date(claim.expires_at) - new Date();
  if (diff <= 0) return 0;
  return diff;
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

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = {
  createClaim,
  getClaim,
  updateClaim,
  listActiveClaims,
  checkObjections,
  submitObjection,
  resolveClaim,
  isClaimExpired,
  getRemainingTime,
  parseDuration
};
