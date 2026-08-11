# -*- coding: utf-8 -*-
"""
云侧 AI 顾问预生成 — 拾取 data/incoming/advisor/*.ready → advisor_published。

用法:
  python cloud_deploy/scripts/advisor_cloud_generate.py
  python cloud_deploy/scripts/advisor_cloud_generate.py --date 2026-07-12
  python cloud_deploy/scripts/advisor_cloud_generate.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import zipfile
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from cloud_deploy.scripts.bootstrap_env import bootstrap

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _cloud_root() -> str:
    return os.environ.get("XHS_CLOUD_ROOT", "/opt/xhs-cloud")


def _incoming_dir() -> str:
    return os.path.join(_cloud_root(), os.environ.get("XHS_ADVISOR_INCOMING_SUBDIR", "data/incoming/advisor"))


def _publish_dir() -> str:
    return os.path.join(_cloud_root(), os.environ.get("XHS_ADVISOR_PUBLISH_DIR", "data/advisor_published"))


def _work_dir() -> str:
    return os.path.join(_cloud_root(), os.environ.get("XHS_ADVISOR_WORK_DIR", "data/advisor_work"))


def _load_context(report_date: str) -> dict | None:
    path = os.path.join(_incoming_dir(), f"context_{report_date}.json")
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict) and isinstance(data.get("context"), dict):
        return data["context"]
    if isinstance(data, dict):
        return data
    return None


def _try_rank_engine_generate(report_date: str, context: dict, *, llm_enhance: bool = True) -> dict | None:
    """调云侧 AiAdvisor.run_batch，默认 llm_enhance=True 走 LLM 主路径。"""
    try:
        from cloud_deploy.rank_engine.ai_advisor import AiAdvisor

        return AiAdvisor().run_batch(
            target_date=report_date,
            context=context,
            llm_enhance=llm_enhance,
        )
    except ImportError as e:
        print(f"[advisor] rank_engine ImportError: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[advisor] rank_engine failed: {e}", file=sys.stderr)
        return None


def _try_rank_engine_ab_generate(report_date: str, context: dict) -> dict | None:
    """调云侧 AiAdvisor.run_ab_batch — A/B 并行生成两份报告 + 写入指标。

    返回 {report_date, mode_a, mode_b, metrics}。
    """
    try:
        from cloud_deploy.rank_engine.ai_advisor import AiAdvisor

        return AiAdvisor().run_ab_batch(
            target_date=report_date,
            context=context,
        )
    except ImportError as e:
        print(f"[advisor-AB] rank_engine ImportError: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[advisor-AB] run_ab_batch failed: {e}", file=sys.stderr)
        return None


def _write_ab_publish_bundle(report_date: str, ab_result: dict, *, sync_b_to_root: bool = True) -> dict:
    """把 A/B 两份报告分别写到 mode_a/ 和 mode_b/ 子目录，并打 zip。

    sync_b_to_root=True 时（默认），同步把 B 模式（80% 程序 + 20% AI）的
    advice.json / advisor.html / report_manifest.json 复制到根目录
    {publish_root}/{report_date}/，让会员端 AI 报告中心立即看到 B 模式效果。
    对应需求文档 48 §3.9.3。

    返回 {"mode_a_dir": ..., "mode_b_dir": ..., "metrics": ..., "root_synced": bool}
    """
    publish_root = _publish_dir()
    root_dir = os.path.join(publish_root, report_date)
    out_a = os.path.join(root_dir, "mode_a")
    out_b = os.path.join(root_dir, "mode_b")
    os.makedirs(out_a, exist_ok=True)
    os.makedirs(out_b, exist_ok=True)

    advice_a = ab_result.get("mode_a") or {}
    advice_b = ab_result.get("mode_b") or {}

    # 写 advice.json
    with open(os.path.join(out_a, "advice.json"), "w", encoding="utf-8") as f:
        json.dump(advice_a, f, ensure_ascii=False, indent=2)
    with open(os.path.join(out_b, "advice.json"), "w", encoding="utf-8") as f:
        json.dump(advice_b, f, ensure_ascii=False, indent=2)

    # 写 metrics.json（在父目录）
    metrics = ab_result.get("metrics") or {}
    metrics_path = os.path.join(root_dir, "ab_metrics.json")
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)

    # 简单 HTML 预览
    for out_dir, advice, label in ((out_a, advice_a, "A 模式（100% AI）"),
                                   (out_b, advice_b, "B 模式（80% 程序 + 20% AI）")):
        html = f"""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<title>AI 选品顾问 {report_date} — {label}</title></head><body>
<h1>{(advice.get('daily_overview') or {}).get('title', '今日市场观察')}</h1>
<pre style="white-space:pre-wrap;font-family:sans-serif;line-height:1.7">{
            (advice.get('daily_overview') or {}).get('content', '')
        }</pre>
<p style="color:#666;font-size:12px">{advice.get('disclaimer', '')}</p>
</body></html>"""
        with open(os.path.join(out_dir, "advisor.html"), "w", encoding="utf-8") as f:
            f.write(html)

    # §3.9.3 同步 B 模式到根目录 — 让会员端 AI 报告中心立即可见 B 模式效果
    root_synced = False
    if sync_b_to_root and advice_b:
        try:
            shutil.copy2(os.path.join(out_b, "advice.json"), os.path.join(root_dir, "advice.json"))
            shutil.copy2(os.path.join(out_b, "advisor.html"), os.path.join(root_dir, "advisor.html"))
            # report_manifest.json 与普通 advisor 路径保持一致格式
            manifest = {
                "report_date": report_date,
                "summary": (advice_b.get("daily_overview") or {}).get("summary", ""),
                "archive_type": "member_ai_advisor_zip",
                "published_at": datetime.now(timezone.utc).isoformat(),
                "source_mode": "B",  # 标记来源于 B 模式（A/B 测试期间）
            }
            with open(os.path.join(root_dir, "report_manifest.json"), "w", encoding="utf-8") as f:
                json.dump(manifest, f, ensure_ascii=False, indent=2)
            root_synced = True
        except OSError as e:
            print(f"[advisor-AB] 同步 B 模式到根目录失败: {e}", file=sys.stderr, flush=True)

    return {
        "mode_a_dir": out_a,
        "mode_b_dir": out_b,
        "metrics_path": metrics_path,
        "metrics": metrics,
        "root_synced": root_synced,
    }


def process_one_ab(report_date: str, *, dry_run: bool = False) -> dict:
    """A/B 测试入口：同时生成 A 模式 + B 模式两份报告并写入指标。"""
    if not _DATE_RE.match(report_date):
        return {"report_date": report_date, "status": "error", "detail": "invalid date"}

    ready = os.path.join(_incoming_dir(), f"context_{report_date}.ready")
    if not os.path.isfile(ready):
        return {"report_date": report_date, "status": "skipped", "detail": "no .ready marker"}

    context = _load_context(report_date)
    if not context:
        return {"report_date": report_date, "status": "error", "detail": "context missing"}

    if dry_run:
        return {"report_date": report_date, "status": "dry-run", "detail": "context loaded",
                "has_feature_summaries": bool(context.get("feature_summaries"))}

    if not context.get("feature_summaries"):
        return {
            "report_date": report_date,
            "status": "error",
            "detail": "context 缺少 feature_summaries — A/B 测试要求 B 模式预计算已注入（请先跑 advisor_daily_pipeline.py 默认带 b_mode）",
        }

    ab_result = _try_rank_engine_ab_generate(report_date, context)
    if not ab_result:
        return {"report_date": report_date, "status": "error", "detail": "run_ab_batch 失败"}

    bundle = _write_ab_publish_bundle(report_date, ab_result)
    try:
        os.remove(ready)
    except OSError:
        pass

    totals = (ab_result.get("metrics") or {}).get("totals") or {}
    return {
        "report_date": report_date,
        "status": "published_ab",
        "mode_a_dir": bundle["mode_a_dir"],
        "mode_b_dir": bundle["mode_b_dir"],
        "metrics_path": bundle["metrics_path"],
        "root_synced": bundle.get("root_synced", False),
        "totals": totals,
    }


def _stub_advice(report_date: str, context: dict) -> dict:
    summary = str(context.get("market_summary") or context.get("summary") or "市场数据已接收，AI 全文生成待 rank_engine 部署。")
    directions = []
    for block in context.get("directions") or context.get("direction_blocks") or []:
        if not isinstance(block, dict):
            continue
        key = str(block.get("key") or block.get("direction") or "")
        if not key:
            continue
        directions.append({
            "key": key,
            "title": block.get("title") or key,
            "summary": (block.get("summary") or "")[:200],
            "content": block.get("content") or block.get("summary") or "",
        })
    return {
        "report_date": report_date,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "daily_overview": {
            "title": "今日市场观察",
            "summary": summary[:240],
            "content": summary,
        },
        "direction_advices": directions[:8],
        "disclaimer": "仅供参考，不构成投资建议。",
    }


def _write_publish_bundle(report_date: str, advice: dict) -> str:
    out = os.path.join(_publish_dir(), report_date)
    os.makedirs(out, exist_ok=True)
    advice_path = os.path.join(out, "advice.json")
    with open(advice_path, "w", encoding="utf-8") as f:
        json.dump(advice, f, ensure_ascii=False, indent=2)

    html = f"""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<title>AI 选品顾问 {report_date}</title></head><body>
<h1>{advice.get('daily_overview', {}).get('title', '今日市场观察')}</h1>
<pre style="white-space:pre-wrap;font-family:sans-serif;line-height:1.7">{
        (advice.get('daily_overview') or {}).get('content', '')
    }</pre>
<p style="color:#666;font-size:12px">{advice.get('disclaimer', '')}</p>
</body></html>"""
    with open(os.path.join(out, "advisor.html"), "w", encoding="utf-8") as f:
        f.write(html)

    manifest = {
        "report_date": report_date,
        "summary": (advice.get("daily_overview") or {}).get("summary", ""),
        "archive_type": "member_ai_advisor_zip",
        "published_at": datetime.now(timezone.utc).isoformat(),
    }
    with open(os.path.join(out, "report_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    return out


def _pack_zip(report_date: str, publish_dir: str) -> str:
    work = os.path.join(_work_dir(), report_date)
    os.makedirs(work, exist_ok=True)
    zip_path = os.path.join(work, f"ai_advisor_{report_date}.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in ("advice.json", "advisor.html", "report_manifest.json"):
            full = os.path.join(publish_dir, name)
            if os.path.isfile(full):
                zf.write(full, arcname=name)
    return zip_path


def process_one(report_date: str, *, dry_run: bool = False, llm_enhance: bool = True) -> dict:
    if not _DATE_RE.match(report_date):
        return {"report_date": report_date, "status": "error", "detail": "invalid date"}

    ready = os.path.join(_incoming_dir(), f"context_{report_date}.ready")
    if not os.path.isfile(ready):
        return {"report_date": report_date, "status": "skipped", "detail": "no .ready marker"}

    context = _load_context(report_date)
    if not context:
        return {"report_date": report_date, "status": "error", "detail": "context missing"}

    if dry_run:
        return {"report_date": report_date, "status": "dry-run", "detail": "context loaded"}

    advice = _try_rank_engine_generate(report_date, context, llm_enhance=llm_enhance) or _stub_advice(report_date, context)
    publish_dir = _write_publish_bundle(report_date, advice)
    zip_path = _pack_zip(report_date, publish_dir)

    from cloud_deploy.scripts.register_advisor_archive import register_advisor_zip

    reg = register_advisor_zip(zip_path, report_date)
    try:
        os.remove(ready)
    except OSError:
        pass
    return {
        "report_date": report_date,
        "status": "published",
        "publish_dir": publish_dir,
        "zip": reg.get("path"),
    }


def process_pending(report_date: str | None = None, *, dry_run: bool = False, llm_enhance: bool = True) -> list[dict]:
    incoming = _incoming_dir()
    if not os.path.isdir(incoming):
        return []

    dates: list[str] = []
    if report_date:
        dates = [report_date]
    else:
        for name in sorted(os.listdir(incoming)):
            if not name.startswith("context_") or not name.endswith(".ready"):
                continue
            d = name[len("context_") : -len(".ready")]
            if _DATE_RE.match(d):
                dates.append(d)

    out = []
    for d in dates:
        out.append(process_one(d, dry_run=dry_run, llm_enhance=llm_enhance))
    return out


def main() -> int:
    bootstrap()
    from cloud_deploy.scripts.insight_llm_runtime import apply_admin_insight_llm

    apply_admin_insight_llm(log_prefix="advisor")
    ap = argparse.ArgumentParser(description="AI 顾问云侧预生成")
    ap.add_argument("--date", default="", help="仅处理指定日期 YYYY-MM-DD")
    ap.add_argument("--dry-run", action="store_true", help="只验证 context，不写发布目录")
    ap.add_argument("--llm-enhance", action="store_true", help="（已默认开启）强制走 LLM 主路径")
    ap.add_argument("--no-llm", action="store_true", help="禁用 LLM，仅走模板兜底（调试用）")
    ap.add_argument("--ab-test", action="store_true",
                    help="A/B 测试模式：同时生成 A（100% AI）+ B（80%程序+20%AI）两份报告并写入指标")
    args = ap.parse_args()

    if args.ab_test:
        # A/B 测试模式
        target = args.date
        if not target:
            # 自动找最新 ready 的 context
            incoming = _incoming_dir()
            if os.path.isdir(incoming):
                for name in sorted(os.listdir(incoming), reverse=True):
                    if name.startswith("context_") and name.endswith(".ready"):
                        d = name[len("context_"):-len(".ready")]
                        if _DATE_RE.match(d):
                            target = d
                            break
        if not target:
            print("[advisor-AB] 未找到可处理的 context_{date}.ready")
            return 0
        print(f"[advisor-AB] 开始 A/B 测试: {target}")
        result = process_one_ab(target, dry_run=args.dry_run)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result.get("status") in ("published_ab", "dry-run") else 1

    llm_on = not args.no_llm
    results = process_pending(report_date=args.date or None, dry_run=args.dry_run, llm_enhance=llm_on)
    if not results:
        print("[advisor] no pending context")
        return 0
    for r in results:
        print(r)
    failed = [r for r in results if r.get("status") == "error"]
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
