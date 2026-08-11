"""检查 context rankings 数量。"""
import json
import os

path = "/opt/xhs-cloud/data/incoming/advisor/context_2026-07-13.json"
print("文件大小:", os.path.getsize(path), "bytes")

d = json.load(open(path))
r = d.get("rankings") or {}
print("rankings 数量:", len(r))
print("keys 样本:", list(r.keys())[:20])

# 看每个 ranking 的 item_count
counts = [(k, v.get("item_count", len(v.get("items", [])))) for k, v in r.items()]
counts.sort(key=lambda x: -x[1])
print("\nTOP 10 rankings by item_count:")
for k, c in counts[:10]:
    print("  %s: %d items" % (k, c))

print("\n总 items 数:", sum(c for _, c in counts))
print("meta:", d.get("meta"))
