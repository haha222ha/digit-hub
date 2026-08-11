"""检查 context 顶层结构。"""
import json

path = "/opt/xhs-cloud/data/incoming/advisor/context_2026-07-13.json"
d = json.load(open(path))

print("顶层 keys:", list(d.keys()))
for k in d.keys():
    v = d[k]
    if isinstance(v, dict):
        print("  %s: dict, %d keys, sample=%s" % (k, len(v), list(v.keys())[:5]))
    elif isinstance(v, list):
        print("  %s: list, %d items" % (k, len(v)))
    elif isinstance(v, str):
        print("  %s: str, len=%d, preview=%s" % (k, len(v), v[:100]))
    else:
        print("  %s: %s = %s" % (k, type(v).__name__, v))
