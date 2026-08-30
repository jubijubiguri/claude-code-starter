#!/usr/bin/env node
// Bash File Change Guard - PreToolUse[Bash]
// Claude가 Bash를 이용해 소스 코드를 직접 변경하여
// Edit/Write의 TDD Guard를 우회하는 것을 방지한다.
//
// 개발 실천 가드이므로 예기치 못한 내부 오류 시에는 fail-open(exit 0)으로 동작한다.

'use strict';
const fs = require('fs');

function main() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch (e) {
    process.exit(0);
  }

  if (data.tool_name !== 'Bash') process.exit(0);

  const cmd = (data.tool_input || {}).command;
  if (typeof cmd !== 'string' || !cmd) process.exit(0);

  // 소스 파일(.ts/.tsx/.js/.jsx)을 다루는 명령인지 확인
  if (!/\.(ts|tsx|js|jsx)(["'\s;|&]|$)/i.test(cmd)) process.exit(0);

  const writePatterns = [
    />/,
    /\btee\b/i,
    /\bsed\s+.*-i/i,
    /\bperl\s+.*-i/i,
    /\bcp\s+/i,
    /\bmv\s+/i,
    /\btouch\s+/i,
    /\btruncate\s+/i,
    /\bwrite_text\s*\(/i,
    /\bwriteFile\s*\(/i,
    /\bwriteFileSync\s*\(/i
  ];

  for (const pattern of writePatterns) {
    if (pattern.test(cmd)) {
      console.error('');
      console.error('🛑 Bash File Change Guard');
      console.error('소스 코드(.ts/.tsx/.js/.jsx)를 Bash로 직접 변경하지 마세요.');
      console.error('Edit 또는 Write Tool을 사용하세요.');
      console.error('그러면 TDD Guard가 자동으로 적용됩니다.');
      process.exit(2);
    }
  }

  process.exit(0);
}

try {
  main();
} catch (e) {
  console.error(`Bash File Change Guard 내부 오류(통과 처리): ${String(e && e.message ? e.message : e)}`);
  process.exit(0);
}
