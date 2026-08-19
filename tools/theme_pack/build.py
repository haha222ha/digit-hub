# -*- coding: utf-8 -*-
"""Theme Pack OS — validate & export theme packs to runtime skins."""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
PACKS = ROOT / "packages" / "theme-packs"
SKINS_PKG = ROOT / "packages" / "skins"
SKINS_WEB = ROOT / "apps" / "web" / "skins"
BRAND = ROOT / "packages" / "psy-dist" / "brand"
CATALOG = SKINS_PKG / "catalog.json"

REQUIRED = ("pack.json", "brief.json", "design.json", "interaction.json", "content.json", "reveal.json")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def pack_dir(code: str) -> Path:
    d = PACKS / code
    if not d.is_dir():
        raise SystemExit(f"theme pack not found: {d}")
    return d


def validate(code: str) -> list[str]:
    d = pack_dir(code)
    errors: list[str] = []
    for name in REQUIRED:
        if not (d / name).is_file():
            errors.append(f"missing {name}")

    if errors:
        return errors

    pack = load_json(d / "pack.json")
    content = load_json(d / "content.json")
    interaction = load_json(d / "interaction.json")

    for key in ("id", "skin_id", "dist_code", "title"):
        if not pack.get(key):
            errors.append(f"pack.json missing {key}")

    dims = content.get("dimensions") or []
    dim_ids = {x["id"] for x in dims if x.get("id")}
    if not dim_ids:
        errors.append("content.json: dimensions empty")

    qs = content.get("questions") or []
    if len(qs) < 4:
        errors.append(f"content.json: need >=4 questions, got {len(qs)}")

    for i, q in enumerate(qs):
        if q.get("d") not in dim_ids:
            errors.append(f"question[{i}] unknown dimension {q.get('d')!r}")
        opts = q.get("o") or []
        if len(opts) < 2:
            errors.append(f"question[{i}] need >=2 options")

    results = content.get("results") or {}
    for did in dim_ids:
        if did not in results:
            errors.append(f"content.json: missing result for dimension {did}")

    scoring = interaction.get("scoring", "dims")
    if scoring not in ("dims", "score_bands", "mbti", "mental_age", "holland"):
        errors.append(f"unsupported scoring: {scoring}")

    expected = interaction.get("question_count")
    if expected and len(qs) != expected:
        errors.append(f"question_count={expected} but got {len(qs)}")

    return errors


def _apply_voice(content: dict, voice: dict) -> dict:
    """Merge partial voice overrides into questions (styles field)."""
    overrides = voice.get("question_overrides") or {}
    if not overrides:
        return content
    qs = []
    for idx, q in enumerate(content.get("questions") or []):
        key = f"{q.get('d')}_q{(idx % 5) + 1}"
        alt = overrides.get(key)
        if alt:
            q = {**q, "styles": alt}
        qs.append(q)
    return {**content, "questions": qs}


def build_skin(code: str) -> dict:
    d = pack_dir(code)
    pack = load_json(d / "pack.json")
    brief = load_json(d / "brief.json")
    design = load_json(d / "design.json")
    interaction = load_json(d / "interaction.json")
    content = load_json(d / "content.json")
    voice = load_json(d / "voice.json") if (d / "voice.json").is_file() else {}

    content = _apply_voice(content, voice)

    skin: dict[str, Any] = {
        "id": pack["skin_id"],
        "title": pack["title"],
        "badge": interaction.get("badge"),
        "minutes": interaction.get("minutes", 5),
        "intro": content.get("intro", ""),
        "disclaimer": brief.get("compliance", {}).get("disclaimer", ""),
        "youGet": content.get("youGet", []),
        "dimensions": content.get("dimensions", []),
        "scoring": interaction.get("scoring", "dims"),
        "questions": content.get("questions", []),
        "results": content.get("results", {}),
        "theme": {
            "pack_id": pack["id"],
            "dist_code": pack.get("dist_code"),
            "motif": design.get("motif"),
            "tokens": design.get("tokens", {}),
            "materials": design.get("materials", []),
            "hero": design.get("hero", {}),
        },
    }

    if interaction.get("duo"):
        skin["duo"] = True
    if interaction.get("askDemo"):
        skin["askDemo"] = True
    if interaction.get("retest"):
        skin["retest"] = True

    return skin


def export_brand_assets(code: str) -> None:
    d = pack_dir(code)
    pack = load_json(d / "pack.json")
    design = load_json(d / "design.json")
    reveal = load_json(d / "reveal.json")

    shelf = design.get("shelf_prompt")
    if shelf:
        out = BRAND / f"{pack['dist_code']}_shelf_v1.json"
        BRAND.mkdir(parents=True, exist_ok=True)
        payload = {
            "code": pack["dist_code"],
            "skin_id": pack["skin_id"],
            "title": pack["title"],
            **shelf,
        }
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print("wrote", out)

    note = reveal.get("note_cover_html")
    if note:
        out = BRAND / f"{pack['dist_code']}_result_reveal_v1.json"
        payload = {
            "code": pack["dist_code"],
            "skin_id": pack["skin_id"],
            **note,
        }
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print("wrote", out)


def register_catalog(code: str, skin: dict) -> None:
    pack = load_json(pack_dir(code) / "pack.json")
    if not CATALOG.is_file():
        return
    cat = load_json(CATALOG)
    item = {
        "id": skin["id"],
        "title": skin["title"].split("·")[0].strip(),
        "minutes": skin.get("minutes", 5),
        "promise": f"【主题】{len(skin.get('questions', []))} 题 · {len(skin.get('dimensions', []))} 型结果",
        "status": "review" if pack.get("status") != "live" else "live",
        "lane": "主题热点",
        "file": f"{skin['id']}.json",
        "source": f"theme-pack:{pack['id']}",
    }
    groups = cat.get("groups") or []
    fun = next((g for g in groups if g.get("id") == "fun"), None)
    if fun is None:
        fun = {"id": "fun", "label": "趣味集邮", "items": []}
        groups.append(fun)
    items = fun.get("items") or []
    idx = next((i for i, x in enumerate(items) if x.get("id") == skin["id"]), None)
    if idx is not None:
        items[idx] = {**items[idx], **item}
    else:
        items.append(item)
    fun["items"] = items
    cat["groups"] = groups
    CATALOG.write_text(json.dumps(cat, ensure_ascii=False, indent=2), encoding="utf-8")
    web_cat = SKINS_WEB / "catalog.json"
    if web_cat.parent.is_dir():
        shutil.copy2(CATALOG, web_cat)
    print("registered catalog →", skin["id"])


def export(code: str, *, register: bool = False) -> Path:
    errs = validate(code)
    if errs:
        raise SystemExit("validation failed:\n  " + "\n  ".join(errs))

    skin = build_skin(code)
    skin_id = skin["id"]
    out_pkg = SKINS_PKG / f"{skin_id}.json"
    out_web = SKINS_WEB / f"{skin_id}.json"

    SKINS_PKG.mkdir(parents=True, exist_ok=True)
    SKINS_WEB.mkdir(parents=True, exist_ok=True)

    text = json.dumps(skin, ensure_ascii=False, indent=2)
    out_pkg.write_text(text, encoding="utf-8")
    out_web.write_text(text, encoding="utf-8")
    print("exported skin →", out_pkg)
    print("exported skin →", out_web)

    export_brand_assets(code)

    if register:
        register_catalog(code, skin)

    return out_pkg


def init_pack(code: str, title: str) -> Path:
    dest = PACKS / code
    if dest.exists():
        raise SystemExit(f"pack already exists: {dest}")
    src = PACKS / "_template"
    shutil.copytree(src, dest)
    pack_path = dest / "pack.json"
    pack = load_json(pack_path)
    pack.update(
        {
            "id": code,
            "skin_id": code,
            "dist_code": code[:4] if len(code) > 4 else code,
            "title": title,
        }
    )
    pack_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")

    cat = load_json(PACKS / "catalog.json")
    cat.setdefault("packs", []).append(
        {
            "id": code,
            "skin_id": code,
            "dist_code": pack["dist_code"],
            "title": title,
            "status": "draft",
            "version": 1,
            "path": code,
        }
    )
    (PACKS / "catalog.json").write_text(json.dumps(cat, ensure_ascii=False, indent=2), encoding="utf-8")
    print("init pack →", dest)
    return dest


def main():
    import argparse

    ap = argparse.ArgumentParser(description="Theme Pack OS build tool")
    sub = ap.add_subparsers(dest="cmd", required=True)

    v = sub.add_parser("validate")
    v.add_argument("code")

    e = sub.add_parser("export")
    e.add_argument("code")
    e.add_argument("--register-catalog", action="store_true")

    i = sub.add_parser("init")
    i.add_argument("code")
    i.add_argument("--title", required=True)

    args = ap.parse_args()
    if args.cmd == "validate":
        errs = validate(args.code)
        if errs:
            print("FAIL:")
            for x in errs:
                print(" ", x)
            raise SystemExit(1)
        print("OK", args.code)
    elif args.cmd == "export":
        export(args.code, register=args.register_catalog)
    elif args.cmd == "init":
        init_pack(args.code, args.title)


if __name__ == "__main__":
    main()
