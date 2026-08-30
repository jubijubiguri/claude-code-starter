## 개발 프로세스 (SDD)

- 이 프로젝트는 SDD(Spec-Driven Development)를 사용한다. 구현 전 `/docs/`의 스펙 문서(PRD, ARCHITECTURE, ADR)를 읽고 설계 의도를 파악할 것.
- 구현 계획은 `/harness` 커맨드로 step 단위로 분해하고, `scripts/execute.py`로 실행한다.
- CRITICAL: 새 기능 구현 시 반드시 테스트를 먼저 작성하고, 테스트가 통과하는 구현을 작성할 것 (TDD)
- 커밋 메시지는 conventional commits 형식을 따를 것 (feat:, fix:, docs:, refactor:)
