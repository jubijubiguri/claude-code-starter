#!/usr/bin/env node
// Circuit Breaker - PreToolUse / PostToolUse / PostToolUseFailure
//
// 목적:
//   동일한 Tool 호출이 반복 실패할 때 무한 재시도를 방지한다.
//
// 핵심:
//   1) PostToolUseFailure에서 동일 호출의 실패 횟수를 기록한다.
//   2) 임계치(기본 3회)에 도달하면 Claude에게 전략 변경 피드백을 준다.
//   3) 다음 PreToolUse에서 동일 호출을 실제로 차단한다.
//   4) 동일 호출이 성공(PostToolUse)하면 해당 실패 기록을 지운다.
//
// 왜 PreToolUse에도 연결하는가:
//   PostToolUseFailure는 이미 실패한 뒤 발생하므로 그 이벤트 자체는
//   다음 Tool 호출을 차단할 수 없다. 실제 차단은 PreToolUse에서 한다.
//
// 환경변수(선택):
//   CLAUDE_CB_THRESHOLD=3   # 같은 호출을 몇 번 실패하면 회로를 열지
//   CLAUDE_CB_TTL=900       # 실패 기록 유효시간(초)
//
// 개발 실천 가드이므로 예기치 못한 내부 오류 시에는 fail-open(exit 0)으로 동작한다.

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const IGNORED_KEYS = new Set(['description', 'timeout', 'run_in_background']);

function clampInt(raw, fallback, min, max) {
  const n = parseInt(raw, 10);
  const v = Number.isNaN(n) ? fallback : n;
  return Math.min(Math.max(v, min), max);
}

// 정렬된 키 순서로 안정적인 JSON 문자열을 만든다 (Python sort_keys 동치).
function canonicalJson(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function main() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch (e) {
    process.exit(0);
  }

  const event = data.hook_event_name || '';
  if (!['PreToolUse', 'PostToolUse', 'PostToolUseFailure'].includes(event)) process.exit(0);

  const toolName = data.tool_name || '';
  const toolInput = data.tool_input;
  const sessionId = String(data.session_id || 'unknown');

  if (!toolName || toolInput === null || typeof toolInput !== 'object' || Array.isArray(toolInput)) {
    process.exit(0);
  }

  const threshold = clampInt(process.env.CLAUDE_CB_THRESHOLD, 3, 2, 10);
  const ttl = clampInt(process.env.CLAUDE_CB_TTL, 900, 60, 86400);

  // 설명/timeout 등 비본질 값이 바뀌었다고 "다른 호출"로 보지 않도록 제외한다.
  function normalize(value) {
    if (Array.isArray(value)) return value.map(normalize);
    if (value !== null && typeof value === 'object') {
      const out = {};
      for (const k of Object.keys(value).sort()) {
        if (!IGNORED_KEYS.has(k)) out[k] = normalize(value[k]);
      }
      return out;
    }
    if (typeof value === 'string' && toolName === 'Bash') {
      // Bash 명령은 단순 공백 차이로 breaker를 우회하지 않도록 정규화한다.
      return value.replace(/\s+/g, ' ').trim();
    }
    return value;
  }

  const canonical = canonicalJson({
    tool_input: normalize(toolInput),
    tool_name: toolName
  });
  const signature = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');

  const safeSession = sessionId.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 120);
  const stateDir = path.join(os.tmpdir(), 'claude-code-circuit-breaker');
  fs.mkdirSync(stateDir, { recursive: true });
  const stateFile = path.join(stateDir, `${safeSession}.json`);

  const now = Date.now() / 1000;

  function loadState() {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (state === null || typeof state !== 'object') return { entries: {} };
      if (state.entries === null || typeof state.entries !== 'object') state.entries = {};
      return state;
    } catch (e) {
      return { entries: {} };
    }
  }

  function saveState(state) {
    // 오래된 항목 정리 + 최대 50개만 유지
    let entries = Object.entries(state.entries || {})
      .filter(([, item]) => now - Number(item.last_failure || 0) <= ttl);
    if (entries.length > 50) {
      entries = entries
        .sort((a, b) => Number(b[1].last_failure || 0) - Number(a[1].last_failure || 0))
        .slice(0, 50);
    }
    state.entries = Object.fromEntries(entries);

    const tmp = stateFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
    fs.renameSync(tmp, stateFile);
  }

  const state = loadState();
  const entries = state.entries;

  // TTL이 지난 기록은 미리 제거
  for (const sig of Object.keys(entries)) {
    if (now - Number(entries[sig].last_failure || 0) > ttl) delete entries[sig];
  }

  const entry = entries[signature];

  if (event === 'PreToolUse') {
    if (entry && Number(entry.count || 0) >= threshold) {
      const summary = entry.summary || toolName;
      const lastError = entry.last_error || '';
      console.error('🛑 Circuit Breaker OPEN');
      console.error(`동일한 Tool 호출이 ${Number(entry.count || 0)}회 연속 실패하여 재실행을 차단했습니다.`);
      console.error(`호출: ${summary}`);
      if (lastError) console.error(`최근 오류: ${lastError}`);
      console.error('같은 입력을 다시 시도하지 말고 오류 원인을 확인한 뒤 다른 명령/인자/접근법으로 변경하세요.');
      process.exit(2);
    }
    saveState(state);
    process.exit(0);
  }

  if (event === 'PostToolUse') {
    // 정확히 같은 호출이 성공하면 breaker 기록을 초기화한다.
    if (signature in entries) {
      delete entries[signature];
      saveState(state);
    }
    process.exit(0);
  }

  // PostToolUseFailure
  if (data.is_interrupt === true) {
    // 사용자/시스템 abort 성격의 실패는 재시도 루프 실패로 세지 않는다.
    process.exit(0);
  }

  const error = String(data.error || '');
  let errorFirst = error ? error.split('\n')[0].trim() : 'Unknown tool failure';
  errorFirst = errorFirst.slice(0, 300);

  let summary;
  if (toolName === 'Bash') {
    const command = String((toolInput || {}).command || '').replace(/\s+/g, ' ').trim();
    summary = `Bash: ${command.slice(0, 300)}`;
  } else {
    summary = `${toolName}: ${canonical.slice(0, 300)}`;
  }

  const count = entry ? Number(entry.count || 0) + 1 : 1;

  entries[signature] = {
    count,
    last_failure: now,
    tool_name: toolName,
    summary,
    last_error: errorFirst
  };
  saveState(state);

  if (count >= threshold) {
    // 공식 동작상 PostToolUseFailure의 exit 2는 이미 일어난 실패를 되돌리지는 못한다.
    // 대신 stderr가 Claude에게 전달되어 전략 변경을 강하게 유도한다.
    console.error('⚠️ Circuit Breaker threshold reached');
    console.error(`동일한 Tool 호출이 ${count}회 실패했습니다: ${summary}`);
    console.error(`최근 오류: ${errorFirst}`);
    console.error('다음 동일 호출은 PreToolUse에서 차단됩니다. 같은 시도를 반복하지 말고 원인을 분석해 접근법을 바꾸세요.');
    process.exit(2);
  }

  process.exit(0);
}

try {
  main();
} catch (e) {
  console.error(`Circuit Breaker 내부 오류(통과 처리): ${String(e && e.message ? e.message : e)}`);
  process.exit(0);
}
