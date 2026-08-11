# -*- coding: utf-8 -*-
"""Export humor/funny copy as sellable content packs (markdown + json).

Run:
  python tools/export_style_assets.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKINS = ROOT / "apps" / "web" / "skins"
OUT = ROOT / "packages" / "content-packs"


def export_skin(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    pack = {
        "id": data["id"],
        "title": data["title"],
        "styles": {"humor": [], "funny": []},
    }
    for i, q in enumerate(data.get("questions") or [], 1):
        for st in ("humor", "funny"):
            block = (q.get("styles") or {}).get(st) or {}
            pack["styles"][st].append(
                {
                    "n": i,
                    "d": q.get("d"),
                    "q": block.get("q") or q.get("q"),
                    "o": [o.get("t") for o in (block.get("o") or q.get("o") or [])],
                }
            )
    for role, items in (data.get("roleQuestions") or {}).items():
        for i, q in enumerate(items, 1):
            for st in ("humor", "funny"):
                block = (q.get("styles") or {}).get(st) or {}
                pack["styles"][st].append(
                    {
                        "n": f"{role}-{i}",
                        "d": q.get("d"),
                        "q": block.get("q") or q.get("q"),
                        "o": [o.get("t") for o in (block.get("o") or q.get("o") or [])],
                        "role": role,
                    }
                )
    return pack


def to_md(pack: dict, style: str) -> str:
    lines = [
        f"# {pack['title']} · {style}",
        "",
        f"皮肤 `{pack['id']}` · 可运营文案资产（题干 + 选项）",
        "",
    ]
    for item in pack["styles"][style]:
        lines.append(f"## Q{item['n']} · {item.get('d') or ''}")
        lines.append("")
        lines.append(f"**{item['q']}**")
        lines.append("")
        for j, opt in enumerate(item["o"], 1):
            lines.append(f"{j}. {opt}")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    index = {"packs": [], "note": "幽默/搞笑题库导出 · 可单独卖给运营/投放"}
    for name in ("seven_sins.json", "mbti16.json", "mental_age.json"):
        pack = export_skin(SKINS / name)
        for st in ("humor", "funny"):
            stem = f"{pack['id']}_{st}"
            (OUT / f"{stem}.json").write_text(
                json.dumps({"id": stem, "skin": pack["id"], "style": st, "items": pack["styles"][st]}, ensure_ascii=False, indent=2)
                + "\n",
                encoding="utf-8",
            )
            (OUT / f"{stem}.md").write_text(to_md(pack, st), encoding="utf-8")
            index["packs"].append({"file": f"{stem}.md", "json": f"{stem}.json", "n": len(pack["styles"][st])})
            print("wrote", stem, len(pack["styles"][st]))
    (OUT / "catalog.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("out →", OUT)


if __name__ == "__main__":
    main()
