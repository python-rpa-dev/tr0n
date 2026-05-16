const fs = require('fs');
const path = require('path');

const TASKS_DIR = path.resolve(__dirname, '..', 'tasks');

function detectConflicts(claimA, claimB) {
  const overlap = claimA.scope.filter(s => claimB.scope.includes(s));
  return {
    hasConflict: overlap.length > 0,
    overlap,
    claimA,
    claimB
  };
}

function resolveByPriority(claimA, claimB) {
  // Rule 1: Earlier confirmed claim wins
  const dateA = new Date(claimA.claimed_at);
  const dateB = new Date(claimB.claimed_at);

  if (dateA.getTime() !== dateB.getTime()) {
    const earlier = dateA < dateB ? claimA : claimB;
    const later = dateA < dateB ? claimB : claimA;
    return {
      winner: earlier,
      loser: later,
      rule: 1,
      reason: `${earlier.agent} claimed earlier (${earlier.claimed_at})`
    };
  }

  // Rule 2: Shorter scope wins
  const scopeA = claimA.scope.length;
  const scopeB = claimB.scope.length;

  if (scopeA !== scopeB) {
    const shorter = scopeA < scopeB ? claimA : claimB;
    const longer = scopeA < scopeB ? claimB : claimA;
    return {
      winner: shorter,
      loser: longer,
      rule: 2,
      reason: `${shorter.agent} has shorter scope (${scopeA} vs ${scopeB} files)`
    };
  }

  // Rule 3: Higher priority wins (read from task definition)
  const priorityA = getTaskPriority(claimA.task);
  const priorityB = getTaskPriority(claimB.task);
  const priorityMap = { critical: 4, high: 3, medium: 2, low: 1 };

  if (priorityA !== priorityB) {
    const higher = priorityA > priorityB ? claimA : claimB;
    const lower = priorityA > priorityB ? claimB : claimA;
    return {
      winner: higher,
      loser: lower,
      rule: 3,
      reason: `${higher.agent} has higher priority (${priorityA} vs ${priorityB})`
    };
  }

  // Rule 4: FIFO (same claim time, same scope, same priority)
  return {
    winner: claimA,
    loser: claimB,
    rule: 4,
    reason: 'Tie — FIFO, first to claim wins'
  };
}

function getTaskPriority(taskId) {
  const backlogDir = path.join(TASKS_DIR, 'backlog');
  if (!fs.existsSync(backlogDir)) return 0;

  const taskFiles = fs.readdirSync(backlogDir).filter(f => f.includes(taskId));
  for (const f of taskFiles) {
    const content = fs.readFileSync(path.join(backlogDir, f), 'utf8');
    const match = content.match(/## Priority\s*\n\s*(critical|high|medium|low)/i);
    if (match) {
      return priorityMap[match[1].toLowerCase()] || 0;
    }
  }
  return 0;
}

function suggestScopeSplit(claimA, claimB) {
  const overlap = claimA.scope.filter(s => claimB.scope.includes(s));

  const splits = [];
  for (const file of overlap) {
    splits.push({
      agentA: claimA.agent,
      agentB: claimB.agent,
      file,
      action: `${claimA.agent} keeps ${file}, ${claimB.agent} adjusts scope`
    });
  }

  return {
    type: 'split',
    splits,
    message: `Scope split suggested: ${splits.map(s => s.action).join('; ')}`
  };
}

function suggestDeferral(loser, winner) {
  return {
    type: 'defer',
    loser: loser.agent,
    loserTask: loser.task,
    winner: winner.agent,
    winnerTask: winner.task,
    message: `${loser.agent} (${loser.task}) defers to ${winner.agent} (${winner.task})`
  };
}

function checkStaleBranch(currentBranch, mainBranch) {
  const { execSync } = require('child_process');
  const REPO_ROOT = path.resolve(__dirname, '..');

  try {
    const localCommit = execSync(`git rev-parse ${currentBranch}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const mainCommit = execSync(`git rev-parse origin/${mainBranch}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();

    return {
      stale: localCommit !== mainCommit,
      localCommit,
      mainCommit,
      branchesAhead: getBranchesAhead(currentBranch, mainBranch)
    };
  } catch {
    return { stale: false, error: 'Could not compare commits' };
  }
}

function getBranchesAhead(currentBranch, mainBranch) {
  const { execSync } = require('child_process');
  const REPO_ROOT = path.resolve(__dirname, '..');

  try {
    const out = execSync(`git rev-list --left-right --count ${mainBranch}...${currentBranch}`, {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    }).trim();
    const [ahead, behind] = out.split('\t').map(Number);
    return { ahead, behind };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}

module.exports = {
  detectConflicts,
  resolveByPriority,
  suggestScopeSplit,
  suggestDeferral,
  checkStaleBranch,
  getTaskPriority
};
