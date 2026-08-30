#!/usr/bin/env node
// Dangerous Command Guard - PreToolUse[Bash]
//
// 목적:
//   Claude가 되돌리기 어렵거나 시스템/저장소를 크게 훼손할 수 있는
//   Bash 명령을 실행하기 전에 차단한다.
//
// 동작:
//   - stdin으로 Claude Code Hook JSON을 받는다.
//   - Bash 명령이 아니면 통과한다.
//   - 고위험 패턴이면 stderr에 이유를 출력하고 exit 2로 차단한다.
//
// 안전 가드이므로 예기치 못한 내부 오류 시에도 fail-closed(exit 2)로 동작한다.

'use strict';
const fs = require('fs');

function main() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch (e) {
    // Hook 입력을 읽지 못했다고 사용자 작업을 막지는 않는다.
    process.exit(0);
  }

  if (data.tool_name !== 'Bash') process.exit(0);

  const command = (data.tool_input || {}).command;
  if (typeof command !== 'string' || !command.trim()) process.exit(0);

  // 의도적으로 "모든 rm"을 막지는 않는다.
  // 예: rm -rf node_modules 같은 프로젝트 내부 정리는 허용한다.
  // 대신 절대경로/홈/현재 디렉터리/상위 디렉터리/와일드카드/.git 등
  // 피해 범위가 커질 수 있는 recursive+force 삭제를 막는다.
  const rules = [
    [
      /(^|[;&|]\s*)sudo\s+rm\b/i,
      'sudo rm은 시스템 파일까지 삭제할 수 있습니다.'
    ],
    [
      /\brm\s+(?=[^;\n]*(?:-[A-Za-z]*r[A-Za-z]*f[A-Za-z]*|-[A-Za-z]*f[A-Za-z]*r[A-Za-z]*|--recursive[^;\n]*--force|--force[^;\n]*--recursive))[^;\n]*\s(?:--\s+)?(?:\/[^ \t;\n]*|~(?:\/[^ \t;\n]*)?|\$HOME(?:\/[^ \t;\n]*)?|\$\{HOME\}(?:\/[^ \t;\n]*)?|\.{1,2}|\*|\.git(?:\/[^ \t;\n]*)?)(?:\s|$|[;&|])/i,
      '광범위한 rm -rf 삭제가 감지되었습니다.'
    ],
    // git 규칙들은 서브커맨드 앞에 오는 전역 옵션(-C <path>, -c <k=v>, --git-dir=, --work-tree=, --no-pager)을
    // 허용해야 우회(git -C . reset --hard 등)를 막을 수 있다.
    [
      /\bgit\b(?:\s+(?:-[Cc]\s+\S+|--(?:git-dir|work-tree)(?:=\S+|\s+\S+)|--no-pager))*\s+reset\s+--hard\b/i,
      'git reset --hard는 작업 중인 변경사항을 되돌릴 수 있습니다.'
    ],
    [
      /\bgit\b(?:\s+(?:-[Cc]\s+\S+|--(?:git-dir|work-tree)(?:=\S+|\s+\S+)|--no-pager))*\s+clean\b[^;\n]*(?:\s-[A-Za-z]*f[A-Za-z]*|\s--force\b)/i,
      'git clean -f 계열은 추적되지 않은 파일을 영구 삭제할 수 있습니다.'
    ],
    [
      /\bgit\b(?:\s+(?:-[Cc]\s+\S+|--(?:git-dir|work-tree)(?:=\S+|\s+\S+)|--no-pager))*\s+push\b[^;\n]*(?:--force(?:-with-lease)?|-f)(?:\s|$)/i,
      '강제 push는 원격 Git 이력을 덮어쓸 수 있습니다.'
    ],
    [
      /\bgit\b(?:\s+(?:-[Cc]\s+\S+|--(?:git-dir|work-tree)(?:=\S+|\s+\S+)|--no-pager))*\s+branch\s+-D\b/,
      'git branch -D는 병합되지 않은 로컬 브랜치도 강제로 삭제합니다.'
    ],
    [
      /\bgit\b(?:\s+(?:-[Cc]\s+\S+|--(?:git-dir|work-tree)(?:=\S+|\s+\S+)|--no-pager))*\s+(?:checkout|restore)\b[^;\n]*(?:--\s+)?(?:\.|\*)(?:\s|$)/i,
      '전체 작업 트리 변경사항을 버리는 Git 명령이 감지되었습니다.'
    ],
    [
      /(^|[;&|]\s*)(?:sudo\s+)?(?:mkfs(?:\.[A-Za-z0-9_+-]+)?|wipefs)\b/i,
      '파일시스템을 포맷/초기화하는 명령이 감지되었습니다.'
    ],
    [
      /\bdd\b[^;\n]*\bof=\/dev\/(?:sd|hd|vd|nvme|mmcblk)[A-Za-z0-9/_-]*/i,
      '블록 디바이스에 직접 쓰는 dd 명령이 감지되었습니다.'
    ],
    [
      /(^|[;&|]\s*)(?:sudo\s+)?(?:shutdown|reboot|poweroff|halt)\b/i,
      '시스템 종료/재부팅 명령이 감지되었습니다.'
    ],
    [
      /\bchmod\s+-R\s+(?:777|666)\s+\/(?:\s|$)/i,
      '루트 파일시스템 권한을 광범위하게 변경하는 명령이 감지되었습니다.'
    ],
    [
      /\bchown\s+-R\b[^;\n]*\s+\/(?:\s|$)/i,
      '루트 파일시스템 소유권을 광범위하게 변경하는 명령이 감지되었습니다.'
    ],
    [
      /\bkill\s+-9\s+-1\b/i,
      '다수 프로세스를 강제 종료할 수 있는 명령이 감지되었습니다.'
    ],
    [
      /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
      'fork bomb 패턴이 감지되었습니다.'
    ],
    [
      /\b(?:curl|wget)\b[^;\n|]*\|\s*(?:sudo\s+)?(?:ba)?sh\b/i,
      '원격 스크립트를 다운로드 후 즉시 shell로 실행하는 패턴이 감지되었습니다.'
    ],
    [
      // 전역 CLAUDE.md를 Bash/PowerShell 명령으로 쓰거나 옮기는 우회 시도 차단 (읽기는 허용)
      /(?:>|\btee\b|\bsed\b[^;\n]*-i|\bmv\b|\bcp\b|\bcopy\b|\bmove\b|\bSet-Content\b|\bAdd-Content\b|\bOut-File\b)[^;\n]*(?:~|\$HOME|\$\{HOME\}|\$env:USERPROFILE|%USERPROFILE%|\/Users\/[^\s'";|&]+|\/home\/[^\s'";|&]+|[A-Za-z]:[\\/]Users[\\/][^\s'";|&]+)[\\/]\.claude[\\/]CLAUDE\.md/i,
      '전역 CLAUDE.md(~/.claude/CLAUDE.md)는 공통 표준이라 Claude가 수정할 수 없습니다. 프로젝트 CLAUDE.md 작업은 계속 진행하고, 전역 파일 변경은 사용자에게 직접 편집하도록 안내하세요.'
    ]
  ];

  for (const [pattern, reason] of rules) {
    if (pattern.test(command)) {
      console.error('🛑 Dangerous Command Guard');
      console.error(reason);
      console.error(`차단된 명령: ${command}`);
      console.error('이 작업이 정말 필요하면 사용자가 명령을 직접 검토한 뒤 수동으로 실행하세요.');
      process.exit(2);
    }
  }

  process.exit(0);
}

try {
  main();
} catch (e) {
  console.error('🛑 Dangerous Command Guard 내부 오류 — 안전을 위해 차단합니다.');
  console.error(String(e && e.message ? e.message : e));
  process.exit(2);
}
