"""AI-Readiness 경로 추출 검증.

임시 저장소를 만들어 score.py를 실행하고, E1(경로 참조 정확도)이
- 점으로 시작하는 경로(.claude/settings.json)를 정상 인식하고
- .js가 .json 앞부분에 잘못 매칭되지 않으며
- ./ 상대경로를 저장소 기준으로 정규화하고
- 실제로 없는 경로만 hallucinated로 집계하는지 확인한다.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCORE = ROOT / "plugins/team-toolbox/skills/ai-readiness-cartography/scripts/score.py"


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        repo = Path(td)
        (repo / ".claude").mkdir()
        (repo / ".claude" / "settings.json").write_text("{}", encoding="utf-8")
        (repo / "src").mkdir()
        (repo / "src" / "app.ts").write_text("export {}\n", encoding="utf-8")
        (repo / "CLAUDE.md").write_text(
            "# test\n"
            "설정 파일은 .claude/settings.json 에 있다.\n"
            "진입점은 ./src/app.ts 이다.\n"
            "존재하지 않는 ghost/missing.py 도 언급한다.\n",
            encoding="utf-8",
        )
        out = repo / "score.json"
        subprocess.run(
            [sys.executable, str(SCORE), str(repo), "--json", str(out), "--quiet"],
            check=True,
            capture_output=True,
        )
        data = json.loads(out.read_text(encoding="utf-8"))

        # ref_total / ref_broken이 담긴 카테고리(E)를 찾는다
        evidence = None
        cats = data.get("categories")
        items = cats.values() if isinstance(cats, dict) else (cats or [])
        for cat in items:
            ev = cat.get("evidence", {}) if isinstance(cat, dict) else {}
            if "ref_total" in ev:
                evidence = ev
                break
        assert evidence is not None, f"ref_total evidence를 찾지 못함: {list(data.keys())}"

        total = evidence["ref_total"]
        broken = evidence["ref_broken"]
        # 유효 참조 2건(.claude/settings.json, ./src/app.ts) + 깨진 참조 1건(ghost/missing.py)
        assert total == 3, f"ref_total={total} (expected 3) — 경로 추출 누락/과잉"
        assert broken == 1, f"ref_broken={broken} (expected 1) — .js/.json 오매칭 또는 정규화 실패 의심"
    print("  score.py E1: ref_total=3, ref_broken=1 확인")
    return 0


if __name__ == "__main__":
    sys.exit(main())
