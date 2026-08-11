# -*- coding: utf-8 -*-
"""将 gen_report / cloud_gen_report 产出的 全量MMDD/ 目录打成 zip。"""
from __future__ import annotations

import argparse
import hashlib
import os
import zipfile
from datetime import datetime


def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def pack_report_dir(report_dir: str, zip_path: str | None = None) -> dict:
    report_dir = os.path.abspath(report_dir)
    if not os.path.isdir(report_dir):
        raise FileNotFoundError(report_dir)

    base = os.path.basename(report_dir.rstrip("/\\"))
    parent = os.path.dirname(report_dir)
    if not zip_path:
        zip_path = os.path.join(parent, f"{base}.zip")

    required = ("data.js", "index_with_gr.html", "index_vue.html")
    for name in required:
        if not os.path.isfile(os.path.join(report_dir, name)):
            raise FileNotFoundError(f"缺少 {name} in {report_dir}")

    readme = os.path.join(report_dir, "README.txt")
    if not os.path.isfile(readme):
        with open(readme, "w", encoding="utf-8") as f:
            f.write(
                "选品报告离线包\n"
                f"生成时间: {datetime.now():%Y-%m-%d %H:%M:%S}\n"
                "解压后请右键 index_with_gr.html，选择「打开方式」→ Google Chrome 打开\n"
                "数据为系统估算参考，非平台官方数据。禁止转售与违规用途。\n"
            )

    if os.path.isfile(zip_path):
        os.remove(zip_path)

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for root, _dirs, files in os.walk(report_dir):
            for fn in files:
                full = os.path.join(root, fn)
                arc = os.path.join(base, os.path.relpath(full, report_dir))
                zf.write(full, arc)

    size = os.path.getsize(zip_path)
    return {
        "report_dir": report_dir,
        "zip_path": zip_path,
        "file_name": os.path.basename(zip_path),
        "file_size_bytes": size,
        "sha256": _sha256_file(zip_path),
    }


def main():
    ap = argparse.ArgumentParser(description="打包选品报告目录为 zip")
    ap.add_argument("report_dir", help="例如 /opt/xhs/reports/全量0619")
    ap.add_argument("--zip", default="", help="输出 zip 路径")
    args = ap.parse_args()
    info = pack_report_dir(args.report_dir, args.zip or None)
    print(info)


if __name__ == "__main__":
    main()
