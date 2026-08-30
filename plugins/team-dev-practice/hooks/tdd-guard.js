#!/usr/bin/env node
// TDD Guard Hook — PreToolUse[Edit|Write]
// 구현 코드를 작성하려 할 때, 해당 모듈의 테스트 파일이 먼저 존재하는지 체크.
// 테스트 없이 구현 코드를 작성하려 하면 permissionDecision "deny"로 차단.
//
// 개발 실천 가드이므로 예기치 못한 내부 오류 시에는 fail-open(exit 0)으로 동작한다.

'use strict';
const fs = require('fs');
const path = require('path');

const SOURCE_EXTS = ['ts', 'tsx', 'js', 'jsx'];

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

function main() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch (e) {
    process.exit(0);
  }

  const filePath = (data.tool_input || {}).file_path;
  if (typeof filePath !== 'string' || !filePath) process.exit(0);

  // Windows 경로에서도 패턴 매칭이 동작하도록 정규화한 경로로 검사한다.
  const p = filePath.replace(/\\/g, '/');

  // 테스트 파일 자체를 수정하는 건 허용
  if (/(test|spec|__tests__)/.test(p) || /\.(test|spec)\./.test(p)) process.exit(0);

  // 설정/타입/스타일 파일은 테스트 불필요 — 허용
  if (/\.(json|css|scss|md|yml|yaml)$/.test(p)) process.exit(0);
  if (/\.env/.test(p) || /\.config\./.test(p)) process.exit(0);
  if (/(tailwind|postcss|next\.config|tsconfig)/.test(p)) process.exit(0);

  // types/ 폴더는 테스트 불필요 — 허용
  if (/\/types\//.test(p) || /\/types\.ts$/.test(p) || /\/types\.d\.ts$/.test(p)) process.exit(0);

  // Next.js 프레임워크 파일은 허용
  if (/\/(layout\.(ts|tsx)|page\.(ts|tsx)|loading\.tsx|error\.tsx|not-found\.tsx|globals\.css)$/.test(p)) {
    process.exit(0);
  }

  // 소스 파일이면 테스트 파일 존재 여부 확인
  const extMatch = p.match(/\.(ts|tsx|js|jsx)$/);
  if (!extMatch) process.exit(0);

  const dir = path.dirname(filePath);
  const basename = path.basename(filePath).replace(/\.(ts|tsx|js|jsx)$/, '');

  const candidates = [];
  for (const ext of SOURCE_EXTS) {
    // 같은 폴더에 .test / .spec 파일
    candidates.push(path.join(dir, `${basename}.test.${ext}`));
    candidates.push(path.join(dir, `${basename}.spec.${ext}`));
    // __tests__ 폴더 (같은 폴더 및 상위 폴더)
    candidates.push(path.join(dir, '__tests__', `${basename}.test.${ext}`));
    candidates.push(path.join(path.dirname(dir), '__tests__', `${basename}.test.${ext}`));
  }

  // src/__tests__/ 루트 테스트 폴더
  const projectRoot = findProjectRoot(dir);
  if (projectRoot) {
    for (const ext of SOURCE_EXTS) {
      candidates.push(path.join(projectRoot, 'src', '__tests__', `${basename}.test.${ext}`));
    }
  }

  const found = candidates.some((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch (e) {
      return false;
    }
  });

  if (!found) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `TDD GUARD: '${basename}'에 대한 테스트 파일이 존재하지 않습니다. 구현 코드를 작성하기 전에 테스트를 먼저 작성하세요. (테스트 파일 예: ${basename}.test.ts)`
      }
    }));
  }

  process.exit(0);
}

try {
  main();
} catch (e) {
  console.error(`TDD Guard 내부 오류(통과 처리): ${String(e && e.message ? e.message : e)}`);
  process.exit(0);
}
