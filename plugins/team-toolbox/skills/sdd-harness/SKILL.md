---
name: sdd-harness
description: Scaffolds SDD (Spec-Driven Development) into the CURRENT project on demand — spec doc skeletons (PRD, ARCHITECTURE, ADR, UI_GUIDE), the /harness step-planning command, the /review command, and scripts/execute.py (sequential step runner with self-correction). Trigger when the user says "SDD 세팅해줘", "이 프로젝트에 SDD", "SDD로 시작", "스펙 주도 개발 세팅", "sdd-harness", "SDD 스캐폴드", or asks to set up spec-driven development / harness-style step execution for this project. Never overwrites existing files; merges rules into an existing CLAUDE.md instead of replacing it.
---

# SDD Harness Scaffold

현재 프로젝트에 SDD(Spec-Driven Development) 작업 환경을 심는다. 템플릿 원본은 이 스킬 디렉터리의 `templates/`에 있다.

## 절대 규칙

- **기존 파일을 절대 덮어쓰지 않는다.** 이미 존재하는 파일은 건너뛰고 보고만 한다.
- 프로젝트의 기존 CLAUDE.md는 교체하지 않고 **병합**한다 (아래 3단계).
- `settings.json`은 복사하지 않는다 — hook은 팀 플러그인(team-guards / team-dev-practice)이 담당한다.

## 스캐폴드 절차

### 1. 사전 확인

- git 저장소인지 확인 (`git rev-parse --show-toplevel`). 아니면 execute.py가 브랜치를 만들 수 없으므로, 사용자에게 `git init` 여부를 물어본다.
- Python 3.10+ 존재 확인 (Windows: `python --version` 또는 `py -3 --version`). 없으면 설치를 안내하되 스캐폴드는 계속 진행한다 (execute.py 실행 시점에만 필요).
- 현재 프로젝트에 `docs/`, `CLAUDE.md`, `.claude/commands/`, `scripts/`가 이미 있는지 확인한다.

### 2. 파일 복사 (없는 것만)

| 템플릿 | 대상 위치 |
|--------|----------|
| `templates/docs/*.md` (4개) | `docs/` — 파일별로 없는 것만 |
| `templates/commands/harness.md`, `review.md` | `.claude/commands/` |
| `templates/scripts/execute.py` | `scripts/execute.py` |

docs 템플릿의 `{placeholder}`는 그대로 둔다 — 채우는 것은 다음 단계에서 사용자와 함께 한다.

### 3. CLAUDE.md 처리

- **프로젝트에 CLAUDE.md가 있으면**: `templates/CLAUDE-additions.md`의 "개발 프로세스 (SDD)" 섹션을 파일 끝에 추가한다. 이미 SDD 섹션이 있으면 건너뛴다.
- **없으면**: `/init`을 먼저 실행하도록 권하고, 사용자가 원하면 `templates/CLAUDE.md` 골격으로 생성한다 (placeholder는 프로젝트를 훑어보고 아는 만큼 채운다).

### 4. 결과 보고 + 다음 단계 안내

생성/건너뜀 목록을 표로 보고한 뒤, 다음 단계를 안내한다:

1. **스펙 채우기** — `docs/PRD.md`부터. "제가 몇 가지 질문을 드리면서 초안을 채워드릴까요?"라고 제안한다 (목표, 사용자, 핵심 기능 순으로 인터뷰).
2. **새 커맨드 인식** — `.claude/commands/`에 새로 생긴 `/harness`, `/review`는 세션을 재시작해야 인식될 수 있다고 알린다.
3. **계획 → 실행** — 스펙이 준비되면 `/harness`로 step을 분해하고, 아래로 실행한다:

```bash
# Windows
python scripts/execute.py {task-name}

# macOS / Linux
python3 scripts/execute.py {task-name}
```

4. **주의 고지** — execute.py는 각 step을 권한 확인 없이 자동 실행한다(`--dangerously-skip-permissions`). 안전 가드(team-guards)가 위험 명령을 차단하는 안전망 역할을 하므로, 가드가 켜진 환경에서 사용할 것을 권장한다. TDD Guard(team-dev-practice)도 함께 켜는 것을 권장한다.
