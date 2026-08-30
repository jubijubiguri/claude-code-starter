#!/usr/bin/env node
// Pre-commit Check - PreToolUse[Bash]
// Bash 도구로 `git commit`을 실행하기 전에 lint / build / test를 자동 실행한다.
// 하나라도 실패하면 exit 2로 커밋을 차단한다.
// --no-verify가 포함된 명령은 통과시킨다 (사용자가 의식적으로 우회).
//
// 개발 실천 가드이므로 예기치 못한 내부 오류 시에는 fail-open(exit 0)으로 동작한다.

'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// 명령 실행 — 자식 프로세스 출력은 모두 stderr로 보낸다 (hook stdout 오염 방지).
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

function fail(step) {
  console.error('');
  console.error(`❌ ${step} 실패 — 커밋 차단`);
  console.error('   수정 후 다시 시도하세요. 우회하려면: git commit --no-verify');
  process.exit(2);
}

function main() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch (e) {
    process.exit(0);
  }

  if (data.tool_name !== 'Bash') process.exit(0);

  const cmd = (data.tool_input || {}).command;
  if (typeof cmd !== 'string' || !cmd.includes('git commit')) process.exit(0);

  // 사용자가 명시적으로 --no-verify를 쓰면 통과
  if (cmd.includes('--no-verify')) process.exit(0);

  let cwd = typeof data.cwd === 'string' && data.cwd ? data.cwd : process.cwd();
  if (!fs.existsSync(cwd)) cwd = process.cwd();

  console.error('');
  console.error(`🔍 Pre-commit 검증 시작 (${cwd})`);

  let ranAny = false;

  // Node.js 프로젝트
  if (fs.existsSync(path.join(cwd, 'package.json'))) {
    if (hasNpmScript(cwd, 'lint')) {
      console.error('  ▸ npm run lint');
      if (run('npm run lint --silent', cwd).status !== 0) fail('Lint');
      ranAny = true;
    }
    if (hasNpmScript(cwd, 'build')) {
      console.error('  ▸ npm run build');
      if (run('npm run build --silent', cwd).status !== 0) fail('Build');
      ranAny = true;
    }
    if (hasNpmScript(cwd, 'test')) {
      console.error('  ▸ npm test');
      if (run('npm test --silent', cwd, { CI: 'true' }).status !== 0) fail('Test');
      ranAny = true;
    }
  }

  // Python 프로젝트
  const isPython = ['pyproject.toml', 'setup.py', 'requirements.txt']
    .some((f) => fs.existsSync(path.join(cwd, f)));
  if (isPython) {
    const ruff = run('ruff check .', cwd);
    if (!notInstalled(ruff)) {
      console.error('  ▸ ruff check .');
      if (ruff.status !== 0) fail('Lint (ruff)');
      ranAny = true;
    }
    const hasTestDir = fs.existsSync(path.join(cwd, 'tests')) || fs.existsSync(path.join(cwd, 'test'));
    if (hasTestDir) {
      const pytest = run('pytest -q', cwd);
      if (!notInstalled(pytest)) {
        console.error('  ▸ pytest -q');
        if (pytest.status !== 0) fail('Test (pytest)');
        ranAny = true;
      }
    }
  }

  if (!ranAny) {
    console.error('  ℹ️  실행할 lint/build/test 스크립트를 찾지 못함 — 통과');
  } else {
    console.error('✅ Pre-commit 검증 통과');
  }

  process.exit(0);
}

try {
  main();
} catch (e) {
  console.error(`Pre-commit Check 내부 오류(통과 처리): ${String(e && e.message ? e.message : e)}`);
  process.exit(0);
}
