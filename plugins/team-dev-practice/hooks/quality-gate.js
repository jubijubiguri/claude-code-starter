#!/usr/bin/env node
// Quality Gate - Stop Hook
// Claude가 작업을 끝내려 할 때 변경사항이 있으면 lint/build/test를 실행한다.
// 실패하면 exit 2로 종료를 막고 Claude가 계속 수정하도록 한다.
//
// 개발 실천 가드이므로 예기치 못한 내부 오류 시에는 fail-open(exit 0)으로 동작한다.

'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function run(cmd, cwd, extraEnv) {
  return spawnSync(cmd, {
    shell: true,
    cwd,
    stdio: ['ignore', 2, 2],
    env: Object.assign({}, process.env, extraEnv || {})
  });
}

// 127(sh) / 9009(cmd.exe) = command not found
function notInstalled(result) {
  return result.error || result.status === 127 || result.status === 9009;
}

function hasNpmScript(cwd, name) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    return Boolean(pkg.scripts && pkg.scripts[name]);
  } catch (e) {
    return false;
  }
}

function findProjectRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 50; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function fail(step) {
  console.error('');
  console.error(`❌ Quality Gate 실패: ${step}`);
  console.error('Claude는 문제를 수정한 후 다시 검증해야 합니다.');
  process.exit(2);
}

function main() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch (e) {
    process.exit(0);
  }

  let cwd = typeof data.cwd === 'string' && data.cwd ? data.cwd : process.cwd();
  if (!fs.existsSync(cwd)) process.exit(0);

  const projectRoot = findProjectRoot(cwd);
  if (!projectRoot) process.exit(0);

  const status = spawnSync('git', ['status', '--porcelain'], {
    cwd: projectRoot,
    encoding: 'utf8'
  });
  if (status.error || status.status !== 0) {
    // git을 실행할 수 없으면 게이트를 강제하지 않는다.
    process.exit(0);
  }

  if (!String(status.stdout || '').trim()) {
    console.error('✅ 변경사항 없음 — Quality Gate 생략');
    process.exit(0);
  }

  console.error('');
  console.error('🔍 Quality Gate 시작');
  console.error(`프로젝트: ${projectRoot}`);

  let ranAny = false;

  // Node.js
  if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
    if (hasNpmScript(projectRoot, 'lint')) {
      console.error('  ▸ npm run lint');
      if (run('npm run lint --silent', projectRoot).status !== 0) fail('Lint');
      ranAny = true;
    }
    if (hasNpmScript(projectRoot, 'build')) {
      console.error('  ▸ npm run build');
      if (run('npm run build --silent', projectRoot).status !== 0) fail('Build');
      ranAny = true;
    }
    if (hasNpmScript(projectRoot, 'test')) {
      console.error('  ▸ npm test');
      if (run('npm test --silent', projectRoot, { CI: 'true' }).status !== 0) fail('Test');
      ranAny = true;
    }
  }

  // Python
  const isPython = ['pyproject.toml', 'setup.py', 'requirements.txt']
    .some((f) => fs.existsSync(path.join(projectRoot, f)));
  if (isPython) {
    const ruff = run('ruff check .', projectRoot);
    if (!notInstalled(ruff)) {
      console.error('  ▸ ruff check .');
      if (ruff.status !== 0) fail('Lint (ruff)');
      ranAny = true;
    }
    const hasTestDir = fs.existsSync(path.join(projectRoot, 'tests')) || fs.existsSync(path.join(projectRoot, 'test'));
    if (hasTestDir) {
      const pytest = run('pytest -q', projectRoot);
      if (!notInstalled(pytest)) {
        console.error('  ▸ pytest -q');
        if (pytest.status !== 0) fail('Test (pytest)');
        ranAny = true;
      }
    }
  }

  if (!ranAny) {
    console.error('ℹ️ 실행 가능한 lint/build/test를 찾지 못했습니다.');
    process.exit(0);
  }

  console.error('');
  console.error('✅ Quality Gate 통과');
  process.exit(0);
}

try {
  main();
} catch (e) {
  console.error(`Quality Gate 내부 오류(통과 처리): ${String(e && e.message ? e.message : e)}`);
  process.exit(0);
}
