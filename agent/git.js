const { execSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

function runGit(args, silent) {
  try {
    const result = execSync(`git ${args}`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: silent ? 'pipe' : undefined
    });
    return result.trim();
  } catch (e) {
    if (silent) return null;
    throw new Error(`git ${args} failed: ${e.message}`);
  }
}

function fetch(remote, branch) {
  if (branch) {
    return runGit(`fetch ${remote} ${branch}`);
  }
  return runGit(`fetch ${remote || 'origin'}`);
}

function checkout(branch) {
  return runGit(`checkout ${branch}`);
}

function checkoutNew(branch, startPoint) {
  if (startPoint) {
    return runGit(`checkout -b ${branch} ${startPoint}`);
  }
  return runGit(`checkout -b ${branch}`);
}

function push(remote, branch, setUpstream) {
  if (setUpstream) {
    return runGit(`push -u ${remote} ${branch}`);
  }
  return runGit(`push ${remote} ${branch}`);
}

function rebase(target) {
  return runGit(`rebase ${target}`);
}

function merge(source) {
  return runGit(`merge ${source} --no-edit`);
}

function getCurrentBranch() {
  return runGit('rev-parse --abbrev-ref HEAD');
}

function getBranchList() {
  const out = runGit('branch -a', true);
  return out.split('\n').map(l => l.trim().replace(/^[\* ]+/, '')).filter(Boolean);
}

function getRemoteURL() {
  return runGit('config --get remote.origin.url');
}

function getLatestCommit(branch) {
  return runGit(`rev-parse origin/${branch}`);
}

function getBaseCommit() {
  return runGit('rev-parse HEAD');
}

function hasUncommittedChanges() {
  const out = runGit('status --porcelain', true);
  return out && out.length > 0;
}

function stageFiles(pattern) {
  return runGit(`add ${pattern}`);
}

function commit(message) {
  return runGit(`commit -m "${message}"`);
}

function listDiff(branch) {
  return runGit(`diff --name-only ${branch}...HEAD`);
}

function listFiles() {
  return runGit('ls-files');
}

module.exports = {
  fetch,
  checkout,
  checkoutNew,
  push,
  rebase,
  merge,
  getCurrentBranch,
  getBranchList,
  getRemoteURL,
  getLatestCommit,
  getBaseCommit,
  hasUncommittedChanges,
  stageFiles,
  commit,
  listDiff,
  listFiles
};
