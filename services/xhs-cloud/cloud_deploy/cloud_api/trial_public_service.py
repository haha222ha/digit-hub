# -*- coding: utf-8
"""免费体验包 · 免登录公开访问。"""
from __future__ import annotations

import json
import os
from typing import Any

from fastapi import HTTPException
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse

_TRIAL_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "assets",
    "trial_experience",
)
_TRIAL_ZIP = _TRIAL_DIR + ".zip"
_META_CACHE: dict[str, Any] | None = None

_ALLOWED_FILES = frozenset({
    "trial_preview.html",
    "index_trial_gr.html",
    "index_with_gr.html",
    "index_vue.html",
    "index_trial.html",
    "data.js",
    "trial_theme.css",
    "trial_gr_theme.css",
    "report_theme.js",
    "report_theme.css",
    "README.txt",
})

_TRIAL_THEME_INJECT = (
    '<script>(function(){try{localStorage.setItem("xhs_report_theme","trial");'
    'localStorage.setItem("pa_ui_theme","trial");}catch(e){}'
    'document.documentElement.dataset.theme="trial";})();</script>'
)

_TRIAL_ASSET_BASE_INJECT = '<script>window.__TRIAL_ASSET_BASE__="/public/trial/";</script>'

_TRIAL_HTML_FILES = frozenset({
    "index_trial_gr.html",
    "index_vue.html",
    "index_with_gr.html",
    "index_trial.html",
    "trial_preview.html",
})


def _inject_after_head(html: str, snippet: str) -> str:
    if snippet in html:
        return html
    marker = "<head>"
    if marker in html:
        return html.replace(marker, marker + "\n" + snippet, 1)
    return snippet + html


def _inject_trial_theme(html: str) -> str:
    """体验包报告页强制明亮科技极简主题。"""
    return _inject_after_head(html, _TRIAL_THEME_INJECT)


def _inject_trial_asset_base(html: str) -> str:
    return _inject_after_head(html, _TRIAL_ASSET_BASE_INJECT)


def _prepare_trial_html(html: str, filename: str) -> str:
    html = _inject_trial_theme(html)
    if filename in ("index_trial_gr.html", "index_vue.html", "index_trial.html"):
        html = _inject_trial_asset_base(html)
    return html


def trial_dir() -> str:
    return _TRIAL_DIR


def trial_zip_path() -> str:
    return _TRIAL_ZIP


def trial_available() -> bool:
    return os.path.isfile(os.path.join(_TRIAL_DIR, "data.js"))


def _load_meta() -> dict[str, Any]:
    global _META_CACHE
    if _META_CACHE is not None:
        return _META_CACHE
    js_path = os.path.join(_TRIAL_DIR, "data.js")
    if not os.path.isfile(js_path):
        return {}
    with open(js_path, "r", encoding="utf-8") as f:
        raw = f.read().strip()
    if raw.startswith("var REPORT_DATA"):
        raw = raw.split("=", 1)[1].strip().rstrip(";")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    meta = data.get("meta") or {}
    _META_CACHE = meta
    return meta


def invalidate_meta_cache() -> None:
    global _META_CACHE
    _META_CACHE = None


def trial_info() -> dict[str, Any]:
    if not trial_available():
        raise HTTPException(status_code=404, detail="体验包尚未部署")
    meta = _load_meta()
    upsell = meta.get("upsell") or {}
    return {
        "available": True,
        "title": meta.get("title") or "选品报告 · 免费体验包",
        "subtitle": meta.get("subtitle") or "",
        "date": meta.get("date") or "",
        "count": meta.get("count") or 0,
        "virtual_count": meta.get("virtual_count") or 0,
        "physical_count": meta.get("physical_count") or 0,
        "max_items": meta.get("max_items") or 3000,
        "source_total": meta.get("source_total") or 0,
        "tier_counts": meta.get("tier_counts") or {},
        "pack_version": meta.get("pack_version") or "v1",
        "preview_url": "/public/trial/preview",
        "download_url": "/api/v1/public/trial-report/download",
        "upsell": upsell,
        "pc_client_paid_only": bool(upsell.get("pc_client_paid_only", True)),
        "custom_keyword_member_price": upsell.get("custom_keyword_member_price", 9.9),
        "custom_keyword_guest_price": upsell.get("custom_keyword_guest_price", 29.9),
    }


def resolve_trial_file(filename: str) -> str:
    name = (filename or "").strip().replace("\\", "/").split("/")[-1]
    if name not in _ALLOWED_FILES:
        raise HTTPException(status_code=404, detail="文件不存在")
    path = os.path.join(_TRIAL_DIR, name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="体验包文件缺失")
    return path


def trial_file_response(filename: str) -> FileResponse:
    path = resolve_trial_file(filename)
    media = "application/octet-stream"
    if filename.endswith(".html"):
        media = "text/html; charset=utf-8"
        if filename in _TRIAL_HTML_FILES:
            with open(path, "r", encoding="utf-8") as f:
                html = _prepare_trial_html(f.read(), filename)
            return HTMLResponse(html, headers={"Cache-Control": "public, max-age=300"})
    elif filename.endswith(".js"):
        media = "application/javascript; charset=utf-8"
    elif filename.endswith(".css"):
        media = "text/css; charset=utf-8"
    elif filename.endswith(".txt"):
        media = "text/plain; charset=utf-8"
    return FileResponse(path, media_type=media, headers={"Cache-Control": "public, max-age=300"})


def trial_preview_html() -> RedirectResponse:
    """在线预览：默认直达表格 GR（明亮科技极简），与全量报告 index_with_gr 同布局。"""
    for candidate in (
        os.path.join(_TRIAL_DIR, "index_trial_gr.html"),
        os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "assets",
            "index_trial_gr.html",
        ),
    ):
        if os.path.isfile(candidate):
            return RedirectResponse(
                url="/public/trial/index_trial_gr.html",
                status_code=302,
                headers={"Cache-Control": "no-cache"},
            )
    raise HTTPException(status_code=404, detail="体验包预览页未部署")


def trial_download_response() -> FileResponse:
    if os.path.isfile(_TRIAL_ZIP):
        return FileResponse(
            _TRIAL_ZIP,
            media_type="application/zip",
            filename="选品报告体验包.zip",
            headers={"Cache-Control": "public, max-age=300"},
        )
    if not trial_available():
        raise HTTPException(status_code=404, detail="体验包尚未部署")
    raise HTTPException(status_code=404, detail="体验包 ZIP 未生成，请运行 build_trial_experience_pack.py")
