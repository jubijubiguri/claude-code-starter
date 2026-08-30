#!/usr/bin/env node
// Protected Files Guard - PreToolUse[Edit|Write]
// Claude가 Edit/Write로 민감하거나 시스템에 중요한 파일을 직접 수정하지 못하도록 차단한다.
//
// 안전 가드이므로 예기치 못한 내부 오류 시에도 fail-closed(exit 2)로 동작한다.

'use strict';
const fs = require('fs');

function main() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch (e) {
    process.exit(0);
  }

  const filePath = (data.tool_input || {}).file_path;
  if (typeof filePath !== 'string' || !filePath) process.exit(0);

  // Windows 경로(백슬래시)에서도 동일하게 매칭되도록 정규화한 뒤,
  // 문자열 포함이 아니라 경로 세그먼트 단위로 검사한다 (상대경로 .env, ./.env 등 커버).
  const normalized = filePath.replace(/\\/g, '/');
  const segments = normalized.toLowerCase().split('/').filter(Boolean);
  const basename = segments.length ? segments[segments.length - 1] : '';

  // 전역 CLAUDE.md(공통 표준)는 Claude가 수정할 수 없다.
  // 프로젝트의 CLAUDE.md(레포 루트)는 여기 걸리지 않는다 — .claude 폴더 안의 CLAUDE.md만 해당.
  if (segments.length >= 2 && segments[segments.length - 2] === '.claude' && basename === 'claude.md') {
    console.error('');
    console.error('🛑 Protected Files Guard');
    console.error('전역 CLAUDE.md(~/.claude/CLAUDE.md)는 공통 표준이라 Claude가 수정할 수 없습니다.');
    console.error('프로젝트의 CLAUDE.md 수정은 허용되어 있으니 그쪽 작업은 계속 진행하세요.');
    console.error('전역 파일 변경이 필요하면 사용자에게 직접 편집하도록 안내하세요.');
    process.exit(2);
  }

  let matchedRule = null;
  if (basename === '.env' || basename.startsWith('.env.')) {
    matchedRule = '.env 계열 파일';
  } else if (segments.includes('.git')) {
    matchedRule = '.git 내부';
  } else if (
    basename.startsWith('credentials.') ||
    basename.startsWith('secret.') ||
    basename.startsWith('secrets.')
  ) {
    matchedRule = '자격증명/시크릿 파일';
  }

  if (matchedRule) {
    console.error('');
    console.error('🛑 Protected Files Guard');
    console.error('보호된 파일 수정이 차단되었습니다.');
    console.error(`파일: ${filePath}`);
    console.error(`보호 규칙: ${matchedRule}`);
    process.exit(2);
  }

  process.exit(0);
}

try {
  main();
} catch (e) {
  console.error('🛑 Protected Files Guard 내부 오류 — 안전을 위해 차단합니다.');
  console.error(String(e && e.message ? e.message : e));
  process.exit(2);
}
