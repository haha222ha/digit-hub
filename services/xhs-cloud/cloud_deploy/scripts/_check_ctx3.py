"""检查 context.context.rankings。"""
import json

path = "/opt/xhs-cloud/data/incoming/advisor/context_2026-07-13.json"
d = json.load(open(path))
ctx = d.get("context") or {}

print("context keys:", list(ctx.keys()))
print("meta:", ctx.get("meta"))

r = ctx.get("rankings") or {}
print("\nrankings 数量:", len(r))
print("keys 样本:", list(r.keys())[:20])

# 按类型分组
global_keys = [k for k in r.keys() if not k.startswith("cat_") and not k.startswith("price_")]
cat_keys = [k for k in r.keys() if k.startswith("cat_")]
price_keys = [k for k in r.keys() if k.startswith("price_")]
print("\n全局榜: %d, 类目榜: %d, 价格带榜: %d" % (len(global_keys), len(cat_keys), len(price_keys)))

# TOP 10 rankings by item_count
counts = [(k, v.get("item_count", len(v.get("items", [])))) for k, v in r.items()]
counts.sort(key=lambda x: -x[1])
print("\nTOP 10 rankings by item_count:")
for k, c in counts[:10]:
    print("  %s: %d items" % (k, c))

print("\n全局榜 keys:", global_keys)
print("\ndaily_brief keys:", list((ctx.get("daily_brief") or {}).keys()))
