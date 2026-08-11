# -*- coding: utf-8 -*-
"""Batch-import legacy quizzes into Skin JSON + update catalog."""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from import_legacy_quiz import build_score_bands, OUT, WEB  # noqa: E402

# (legacy folder, skin_id, title, group, lane, duo?)
BATCH = [
    ("暧昧段位深度检测", "ambiguity_rank", "暧昧段位", "emotion", "情感引流", False),
    ("职场内耗等级检测", "burnout", "职场内耗等级", "career", "职场链路", False),
    ("月度精神内耗复测", "monthly_drain", "月度精神内耗", "retest", "周期复测", False),
    ("情绪稳定度月度检测", "monthly_mood", "月度情绪稳定度", "retest", "周期复测", False),
    ("情侣婚恋适配度测试", "couple_fit", "情侣婚恋适配", "duo", "双人", True),
    ("闺蜜性格反差测试", "friend_contrast", "闺蜜性格反差", "duo", "双人", True),
    ("灵魂动物测试", "soul_animal", "灵魂动物", "fun", "集邮", False),
    ("城市氛围感", "city_vibe", "性格 × 城市", "fun", "集邮", False),
    ("职场PUA敏感度检测", "workplace_pua", "职场 PUA 敏感度", "career", "职场链路", False),
    ("职业倦怠程度检测", "job_burnout", "职业倦怠程度", "career", "职场链路", False),
    ("吸渣体质深度检测", "scam_magnet", "吸渣体质", "emotion", "情感引流", False),
    ("依恋类型测试", "attachment", "依恋类型", "emotion", "情感引流", False),
]


def patch_skin(skin_id: str, *, duo: bool = False, ask_demo: bool = False):
    path = OUT / f"{skin_id}.json"
    if not path.exists():
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    if duo:
        data["duo"] = True
        data["youGet"] = list(dict.fromkeys([*(data.get("youGet") or []), "同设备双人对照"]))
    if ask_demo or duo:
        data["askDemo"] = True
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    shutil.copy2(path, WEB / f"{skin_id}.json")


def update_catalog(ok_items: list[dict]):
    cat_path = OUT / "catalog.json"
    cat = json.loads(cat_path.read_text(encoding="utf-8"))
    group_map = {g["id"]: g for g in cat["groups"]}
    for item in ok_items:
        gid = item["group"]
        g = group_map.get(gid)
        if not g:
            g = {"id": gid, "label": gid, "items": []}
            cat["groups"].append(g)
            group_map[gid] = g
        existing = next((i for i in g["items"] if i["id"] == item["id"]), None)
        entry = {
            "id": item["id"],
            "title": item["title"],
            "minutes": item.get("minutes", 5),
            "promise": item.get("promise", ""),
            "status": "live",
            "file": f"{item['id']}.json",
            "lane": item.get("lane"),
            "source": item.get("source"),
        }
        if item.get("duo"):
            entry["duo"] = True
        if existing:
            existing.update({k: v for k, v in entry.items() if v is not None})
        else:
            g["items"].append(entry)

    cat_path.write_text(json.dumps(cat, ensure_ascii=False, indent=2), encoding="utf-8")
    shutil.copy2(cat_path, WEB / "catalog.json")
    print(
        "catalog updated, live count=",
        sum(1 for g in cat["groups"] for i in g["items"] if i.get("status") == "live"),
    )


def main():
    ok = []
    for folder, sid, title, group, lane, duo in BATCH:
        try:
            build_score_bands(folder, sid, title)
            ask_demo = duo or group == "emotion"
            patch_skin(sid, duo=duo, ask_demo=ask_demo)
            skin = json.loads((OUT / f"{sid}.json").read_text(encoding="utf-8"))
            ok.append(
                {
                    "id": sid,
                    "title": title,
                    "group": group,
                    "lane": lane,
                    "source": folder,
                    "minutes": skin.get("minutes", 5),
                    "promise": f"{len(skin.get('questions', []))} 题 · 段位量表 · 迁自生产版",
                    "duo": duo,
                }
            )
            print("OK", sid)
        except Exception as e:
            print("FAIL", sid, folder, e)
    update_catalog(ok)
    print("done", len(ok), "/", len(BATCH))


if __name__ == "__main__":
    main()
