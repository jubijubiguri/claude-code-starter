# Claude Code Starter (company-tools 마켓플레이스)

Claude Code 온보딩 키트입니다. 공통 표준(전역 CLAUDE.md), 팀 플러그인 3개(안전 가드 /
개발 실천 가드 / 도구 모음), 구성원 핸드북과 따라하기 문서를 하나의 저장소로 배포합니다.
hook 스크립트는 전부 Node.js로 작성되어 Windows / macOS / Linux에서 동일하게 동작하며,
외부 의존성(jq, python3, bash)이 없습니다.

## 설치 (구성원용)

Claude Code가 이미 설치되어 있다는 전제입니다. 5분이면 끝납니다.

**0. 준비물: Node.js** — 안전 가드(Hook)가 동작하려면 Node.js가 필요합니다. 설치되어 있는지 먼저 확인하세요. PowerShell에서:

```powershell
node --version
```

버전이 출력되면 설치된 것입니다. `찾을 수 없습니다` 오류가 나면 [nodejs.org](https://nodejs.org/)에서 **LTS 버전**을 내려받아 설치하세요 — 설치 중 옵션은 전부 기본값으로 "다음"만 누르면 됩니다. 설치 후 **PowerShell을 닫았다가 새로 열고** 위 명령으로 다시 확인하세요. (Python은 지금 필수가 아니라 진단 도구를 쓸 때 필요합니다 — 셋업 스크립트가 알려줍니다.)

**1. 저장소 받기** — 둘 중 편한 방법으로:

```powershell
git clone https://github.com/jubijubiguri/claude-code-starter.git
```

또는 GitHub 페이지에서 `Code → Download ZIP`을 받아 압축을 풀어주세요.

**2. 셋업 스크립트 실행** — PowerShell을 열고 받은 폴더에서:

```powershell
cd claude-code-starter
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

> `-ExecutionPolicy Bypass`는 "인터넷에서 받은 스크립트는 실행하지 않는다"는 Windows
> 기본 정책을 이번 한 번만 우회하는 옵션입니다. 스크립트가 하는 일은 화면에 전부 출력됩니다.

스크립트는 세 가지를 합니다: ① 공통 표준 CLAUDE.md를 전역 위치에 설치(기존 파일은 자동 백업)
② 사용자 설정에 마켓플레이스·플러그인 등록(기존 설정은 보존, 병합만) ③ Node/Python 확인.
여러 번 실행해도 안전합니다.

**3. 확인** — Claude Code를 새로 실행하고 `/plugin`을 입력해서 `team-guards`,
`team-toolbox`가 활성 상태인지 확인하세요. 처음에는 플러그인을 내려받느라 잠시 걸릴 수 있습니다.

**4. 시작** — [guides/onboarding-course.md](guides/onboarding-course.md)를 열고
1시간 체험 코스를 따라 해보세요. 개념 설명은 [guides/claude-code-handbook.md](guides/claude-code-handbook.md)에 있습니다.

## 구성

```text
.claude-plugin/marketplace.json     마켓플레이스 매니페스트 (플러그인 3개)
setup/CLAUDE.md                     전역 배포용 공통 표준 (Karpathy 행동 지침 한국어판)
plugins/
├── team-guards/                    안전 가드 — 전 구성원 기본 켜짐
│   └── hooks/
│       ├── dangerous-cmd-guard.js  위험 명령(rm -rf /, git push -f 등) + 전역 CLAUDE.md 쓰기 우회 차단
│       └── protected-files.js      .env, .git, secrets 등 민감 파일 + 전역 CLAUDE.md 수정 차단
├── team-dev-practice/              개발 실천 가드 — 팀/개인 옵트인
│   └── hooks/
│       ├── tdd-guard.js            테스트 없는 구현 파일 작성 차단 (deny)
│       ├── bash-file-change-guard.js  Bash로 소스 수정하여 TDD 가드 우회 방지
│       ├── pre-commit-check.js     git commit 전 lint/build/test 자동 실행
│       ├── quality-gate.js         세션 종료(Stop) 시 변경사항 검증
│       └── circuit-breaker.js      동일 호출 반복 실패 시 재시도 차단
└── team-toolbox/                   진단·유틸 스킬 모음 — 기본 켜짐, 호출 시만 동작
    └── skills/
        ├── ai-readiness-cartography/  레포 AI-readiness 감사 (100점·7 카테고리, HTML 대시보드)
        ├── improve-token-efficiency/  세션 로그 기반 토큰·비용 분석 대시보드 + 절감안
        └── sdd-harness/               SDD 스캐폴드 — 스펙 문서 골격 + /harness + execute.py를 현재 프로젝트에 심음
guides/
├── claude-code-handbook.md         구성원 핸드북 (3부 8장 통합본)
└── onboarding-course.md            온보딩 코스 — 설치부터 심화까지 치면서 배우는 따라하기
```

## 동작 원칙

- 차단은 exit 2로만 이루어집니다 (Claude Code hook 규약).
- **안전 가드(team-guards)는 fail-closed**: 스크립트 내부 오류가 나도 차단합니다.
- **개발 실천 가드(team-dev-practice)는 fail-open**: 내부 오류 시 경고만 남기고 통과합니다.
- circuit-breaker 상태 파일은 OS 임시 폴더의 `claude-code-circuit-breaker/`에 세션별로 저장됩니다.
- 조정 가능한 환경변수: `CLAUDE_CB_THRESHOLD`(기본 3회), `CLAUDE_CB_TTL`(기본 900초).

## 배포 구조

이 저장소 자체가 플러그인 마켓플레이스(`company-tools`)입니다. setup.ps1이 각 사용자의
`~\.claude\settings.json`에 아래 설정을 병합하며, 이후 플러그인 설치와 업데이트는
Claude Code가 이 GitHub 저장소에서 직접 받아갑니다 (공개 저장소라 인증 불필요).

```json
{
  "extraKnownMarketplaces": {
    "company-tools": {
      "source": { "source": "github", "repo": "jubijubiguri/claude-code-starter" }
    },
    "claude-plugins-official": {
      "source": { "source": "github", "repo": "anthropics/claude-plugins-official" }
    }
  },
  "enabledPlugins": {
    "team-guards@company-tools": true,
    "team-toolbox@company-tools": true,
    "claude-md-management@claude-plugins-official": true,
    "team-dev-practice@company-tools": false
  }
}
```

- `team-guards`·`team-toolbox`는 기본 켜짐, `team-dev-practice`는 설치만 되고 꺼진 상태(false)입니다.
- 팀 옵트인: 해당 프로젝트의 `.claude/settings.json`에서 `team-dev-practice@company-tools`를 `true`로 커밋하면 그 프로젝트 전체에 적용됩니다.
- 개인 옵트인: Claude Code에서 `/plugin install team-dev-practice@company-tools`.
- 저장소를 업데이트하면(push) 구성원들의 플러그인도 자동으로 따라 갱신됩니다.

## 사전 조건

- Node.js가 PATH에 있어야 합니다. 팀 셋업 스크립트가 설치 여부를 확인합니다.
  (node가 없으면 hook이 "command not found"로 조용히 무시되므로, 셋업 단계에서 반드시 보장해야 합니다.)
- team-toolbox의 분석 스킬(ai-readiness-cartography, improve-token-efficiency)과 sdd-harness의
  execute.py는 Python이 필요합니다 (외부 라이브러리 없음). 실행하는 시점에만 필요하며,
  없으면 스킬이 설치를 안내합니다.
- pre-commit-check / quality-gate는 프로젝트에 npm scripts(lint/build/test) 또는
  ruff/pytest가 있을 때만 해당 검증을 실행합니다. 없으면 통과합니다.

## 검증 (테스트)

테스트가 저장소에 포함되어 있습니다. Node.js만 있으면 실행됩니다.

```bash
node tests/run-tests.js
```

hook 차단/허용(위험 명령·git 전역 옵션 우회·보호 파일의 Windows/POSIX/상대경로·
전역 CLAUDE.md 보호·TDD Guard·Circuit Breaker 등)과 마켓플레이스 구조를 검증하며,
Python이 있으면 AI-Readiness 경로 추출 테스트까지 실행합니다.

수동 확인: 아무 프로젝트에서 Claude Code로 `git push --force`를 요청하면
"Dangerous Command Guard" 차단 메시지가 떠야 합니다.

## 변경 이력

- 2026-08-31 — 실사용 피드백 반영 2차.
  배포 정책 변경: 매니페스트의 고정 version 제거 — 커밋이 갱신되면 플러그인도 따라 업데이트됩니다.
  setup.ps1에 Claude Code 최소 버전(2.1.139) 검사 추가.
  보호 파일 검사를 경로 세그먼트 방식으로 개선(상대경로 `.env`, Windows 경로 등 전부 커버).
  AI-Readiness 경로 추출 수정(점 시작 경로 허용, .js/.json 오매칭 방지, ~·./ 정규화).
  테스트를 저장소에 포함(`tests/`, 90건). 토큰 분석 문서의 미구현 옵션 안내 제거.
- team-guards 1.1.1 — git 전역 옵션 우회 차단: `git -C <경로> reset --hard`, `git --git-dir=... push --force` 등
  서브커맨드 앞에 전역 옵션(-C/-c, --git-dir, --work-tree, --no-pager)이 오면 규칙을 비켜가던 문제 수정.
  git 위험 명령 패턴 5종 전부 갱신 (실사용 피드백 반영).
- team-toolbox 1.2.0 — improve-token-efficiency 스킬 추가: 세션 JSONL 로그를 분석해
  토큰·캐시·비용 대시보드와 $ 절감안 생성. SKILL.md에 Windows 보정(python/$env:TEMP/start) 적용.
- team-toolbox 1.1.0 — sdd-harness 스킬 추가: "이 프로젝트에 SDD 세팅해줘" 한 마디로 스펙 문서 골격,
  /harness·/review 커맨드, execute.py를 현재 프로젝트에 스캐폴드 (기존 파일 덮어쓰기 없음, CLAUDE.md는 병합).
  가이드 문서(01~07)를 guides/로 이 레포에 통합.
- team-guards 1.1.0 — 전역 CLAUDE.md(`~/.claude/CLAUDE.md`, 공통 표준) 보호 추가.
  Edit/Write 차단(protected-files) + Bash/PowerShell 쓰기 우회 차단(dangerous-cmd-guard, 읽기는 허용).
  차단 메시지에 "프로젝트 CLAUDE.md 작업은 계속 진행" 안내를 포함해 과잉 중단을 방지.
- 1.0.0 — 초기 bash 구현을 Node.js로 전면 포팅 (bash 원본은 저장소 외부에 별도 보관). 플러그인 2개(team-guards / team-dev-practice)로 분리.
  Windows 경로 호환(백슬래시 정규화), jq/python3 의존성 제거, 안전 가드 fail-closed 처리.
