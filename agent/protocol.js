const fs = require('fs');
const readline = require('readline');
const path = require('path');
const claim = require('./claim');
const git = require('./git');

const REPO_ROOT = path.resolve(__dirname, '..');
const TASKS_DIR = path.join(REPO_ROOT, 'tasks');
const AGENTS_DIR = path.join(REPO_ROOT, 'agents');

function start() {
  console.log('[tr0n-protocol] Protocol mode started. Send commands via stdin.');
  console.log('[tr0n-protocol] Commands: claim, check-conflicts, create-branch, push, create-pr, list-tasks, list-agents, status\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  rl.prompt();

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    try {
      const result = handleCommand(trimmed);
      console.log(JSON.stringify({ status: 'ok', result }));
    } catch (e) {
      console.log(JSON.stringify({ status: 'error', message: e.message }));
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n[tr0n-protocol] Protocol session ended.');
    process.exit(0);
  });
}

function handleCommand(line) {
  const parts = line.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case 'claim': {
      const taskId = args[0];
      const scope = args.slice(1) || ['src/'];
      return { action: 'claim-created', task: taskId, scope };
    }

    case 'check-conflicts': {
      const activeDir = path.join(TASKS_DIR, 'active');
      if (!fs.existsSync(activeDir)) return { conflicts: [] };

      const files = fs.readdirSync(activeDir).filter(f => f.endsWith('.json'));
      const claims = files.map(f => JSON.parse(fs.readFileSync(path.join(activeDir, f), 'utf8')));

      const conflicts = [];
      for (let i = 0; i < claims.length; i++) {
        for (let j = i + 1; j < claims.length; j++) {
          const overlap = claims[i].scope.filter(s => claims[j].scope.includes(s));
          if (overlap.length > 0) {
            conflicts.push({
              claimA: claims[i].agent,
              claimB: claims[j].agent,
              overlap
            });
          }
        }
      }

      return { conflicts };
    }

    case 'create-branch': {
      const branchName = args[0];
      const startPoint = args[1] || 'origin/main';
      return { branch: branchName, base: startPoint };
    }

    case 'push': {
      const branchName = args[0] || git.getCurrentBranch();
      return { status: 'ok', branch: branchName, pr_url: null };
    }

    case 'create-pr': {
      const branchName = args[0];
      const title = args[1] || 'Agent PR';
      return { pr_url: `https://github.com/placeholder/pr/1`, title, branch: branchName };
    }

    case 'list-tasks': {
      const backlogDir = path.join(TASKS_DIR, 'backlog');
      if (!fs.existsSync(backlogDir)) return { tasks: [] };

      const tasks = fs.readdirSync(backlogDir)
        .filter(f => f.endsWith('.md'))
        .map(f => {
          const content = fs.readFileSync(path.join(backlogDir, f), 'utf8');
          const match = content.match(/## Task\s*\n\s*(T-\d+)/);
          return match ? { id: match[1], file: f } : null;
        })
        .filter(Boolean);

      return { tasks };
    }

    case 'list-agents': {
      if (!fs.existsSync(AGENTS_DIR)) return { agents: [] };

      const agents = fs.readdirSync(AGENTS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8')));

      return { agents };
    }

    case 'status': {
      return {
        branch: git.getCurrentBranch(),
        remote: git.getRemoteURL(),
        ahead: git.getBranchList().length
      };
    }

    default:
      throw new Error(`Unknown command: ${cmd}. Available: claim, check-conflicts, create-branch, push, create-pr, list-tasks, list-agents, status`);
  }
}

module.exports = { start };
