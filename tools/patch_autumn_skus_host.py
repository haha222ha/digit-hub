# Host patch: autumn SKU sync with system design
# Run on server: sudo python3 /tmp/patch_autumn_skus.py
from __future__ import annotations

from pathlib import Path

ROOT = Path("/opt/digit-hub/apps/psy-dist/tests")


def patch_file(code: str, replacers: list[tuple[str, str]]) -> None:
    p = ROOT / code / "index.html"
    t = p.read_text(encoding="utf-8")
    changed = 0
    for old, new in replacers:
        if old in t:
            t = t.replace(old, new, 1)
            changed += 1
        else:
            print(f"  skip pattern not found: {old[:60]!r}...")
    if changed:
        p.write_text(t, encoding="utf-8")
    print(f"{code}: applied {changed}/{len(replacers)} → {p}")


def main() -> None:
    # irms: missing complete hook
    patch_file(
        "irms",
        [
            (
                "setTimeout(()=>{renderResult(best);show('result');window.scrollTo(0,0);},2900);",
                "setTimeout(()=>{renderResult(best);show('result');window.scrollTo(0,0);__psyHookComplete({test_code:'irms',source:'autumn-sku',spirit:best});},2900);",
            )
        ],
    )

    # ofpr: show result before complete
    patch_file(
        "ofpr",
        [
            (
                "setTimeout(()=>{(__psyHookComplete({test_code:'ofpr',score:(RESULT&&RESULT.prob)||0}),show('result'));renderResult();window.scrollTo(0,0);opened=false;},900);",
                "setTimeout(()=>{show('result');renderResult();window.scrollTo(0,0);opened=false;__psyHookComplete({test_code:'ofpr',score:(RESULT&&RESULT.prob)||0});},900);",
            )
        ],
    )

    # slpz: hook after show
    patch_file(
        "slpz",
        [
            (
                "function showResult(){__psyHookComplete({test_code:'slpz',source:'autumn-sku'});\n  const {order,pct,keys}=RES;",
                "function showResult(){\n  const {order,pct,keys}=RES||{};\n  if(!RES||!order){console.error('slpz missing RES',RES);show('result');return;}",
            ),
            (
                "show('result');window.scrollTo(0,0);\n  order.forEach((o,i)=>{setTimeout(()=>{",
                "show('result');window.scrollTo(0,0);\n  __psyHookComplete({test_code:'slpz',source:'autumn-sku'});\n  order.forEach((o,i)=>{setTimeout(()=>{",
            ),
        ],
    )

    # xzcp: hook after show (live still calls complete at function entry)
    patch_file(
        "xzcp",
        [
            (
                "function showReport(){__psyHookComplete({test_code:'xzcp',source:'autumn-sku'});\n  const {mods,pct,weakest}=RES;",
                "function showReport(){\n  const {mods,pct,weakest}=RES||{};\n  if(!RES){console.error('xzcp missing RES');show('result');return;}",
            ),
            (
                "show('result');window.scrollTo(0,0);\n}\n</script>\n\n<script>window.__PSY_TEST_CODE__ = \"xzcp\";</script>",
                "show('result');window.scrollTo(0,0);\n  __psyHookComplete({test_code:'xzcp',source:'autumn-sku',score:pct});\n}\n</script>\n\n<script>window.__PSY_TEST_CODE__ = \"xzcp\";</script>",
            ),
        ],
    )

    # note: xzcp catalog questions should be 14 not 36 (update DB / tests-catalog after deploy)

    # jlpf landing CSS white-on-white
    patch_file(
        "jlpf",
        [
            (
                "#landing{align-items:center;justify-content:center;text-align:center;padding:36px;color:#fff;}",
                "#landing{align-items:center;justify-content:center;text-align:center;padding:36px;color:#fff;background:linear-gradient(180deg,#0f766e,#0d9488);}",
            )
        ],
    )

    print("DONE")


if __name__ == "__main__":
    main()
