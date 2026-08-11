#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在服务器上一次性修补 cloud_daemon 循环状态（无需 git pull）。

用法:
  /opt/xhs-cloud/venv/bin/python /opt/xhs-cloud/cloud_deploy/scripts/hotfix_daemon_cycle_state.py
  sudo systemctl restart xhs-daemon
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "cloud_deploy" / "daemon" / "cloud_daemon.py"
MARKER = "_load_cycle_state"


def main() -> int:
    if not TARGET.is_file():
        print(f"找不到 {TARGET}", file=sys.stderr)
        return 1
    text = TARGET.read_text(encoding="utf-8")
    if MARKER in text:
        print("已修补，无需重复执行")
        return 0

    if "from datetime import datetime" in text and "import json" not in text:
        text = text.replace(
            "from datetime import datetime",
            "from datetime import datetime\nfrom pathlib import Path",
            1,
        )
    if "import json" not in text:
        text = text.replace(
            "import os\n",
            "import json\nimport os\n",
            1,
        )

    text = text.replace(
        "        self._maybe_force_api_only_on_start()\n",
        "        self._maybe_force_api_only_on_start()\n"
        "        self._load_cycle_state()\n",
        1,
    )

    insert_after = "        self._maybe_force_api_only_on_start()\n        self._load_cycle_state()\n"
    block = '''
    def _cycle_state_path(self) -> Path:
        base = os.environ.get("XHS_CLOUD_ROOT", CLOUD_ROOT)
        data_dir = Path(base) / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        return data_dir / "daemon_cycle_state.json"

    def _save_cycle_state(self) -> None:
        if not self._pool_cycle_enabled():
            return
        try:
            payload = {
                "scan_date": self._scan_date or datetime.now().strftime("%Y-%m-%d"),
                "phase": self._phase,
                "full_round_until": self._full_round_until,
            }
            self._cycle_state_path().write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except OSError:
            pass

    def _load_cycle_state(self) -> None:
        if not self._pool_cycle_enabled():
            return
        today = datetime.now().strftime("%Y-%m-%d")
        self._scan_date = today
        path = self._cycle_state_path()
        if not path.is_file():
            return
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return
        if data.get("scan_date") != today:
            return
        phase = str(data.get("phase") or "daily")
        if phase in ("daily", "pause", "risk_full"):
            self._phase = phase
        self._full_round_until = float(data.get("full_round_until") or 0.0)

    def _count_today_attempted(self) -> int:
        from cloud_deploy.cloud_api.database_pg import _conn, init_db

        init_db()
        conn = _conn()
        try:
            with conn.cursor() as c:
                c.execute("SET search_path TO xhs_monitor, public")
                c.execute(
                    """SELECT COUNT(*) FROM monitor_goods
                       WHERE monitor_status IN ('active', 'idle')
                         AND last_scan_at IS NOT NULL
                         AND last_scan_at::date = CURRENT_DATE"""
                )
                return int(c.fetchone()[0] or 0)
        finally:
            conn.close()

    def _today_first_round_done(self) -> bool:
        return (
            bool(self.config.get("skip_today", True))
            and self._count_full_pool_pending() == 0
            and self._count_today_attempted() > 0
        )

'''
    text = text.replace(insert_after, insert_after + block, 1)

    text = text.replace(
        "            self._risk_round_until = 0.0\n",
        "            self._risk_round_until = 0.0\n"
        "            try:\n"
        "                self._cycle_state_path().unlink(missing_ok=True)\n"
        "            except OSError:\n"
        "                pass\n",
        1,
    )

    text = text.replace(
        "        self._phase = \"pause\"\n        self.log(",
        "        self._phase = \"pause\"\n        self._save_cycle_state()\n        self.log(",
        1,
    )

    old_run = re.search(
        r"    def _run_pool_cycle_once\(self\).*?(?=\n    def _setup_crawler_path)",
        text,
        re.DOTALL,
    )
    if not old_run:
        print("未找到 _run_pool_cycle_once，请手动更新 cloud_daemon.py", file=sys.stderr)
        return 1

    new_run = '''    def _run_pool_cycle_once(self) -> tuple[list[dict], str]:
        """大循环: 首轮全池 → 休5h → risk全池1000/30s → 休5h → …"""
        risk_cfg = self._risk_cfg()

        for _ in range(4):
            now = time.time()

            if self._phase == "pause":
                if now < self._full_round_until:
                    self._log_pause_remain()
                    self._last_cooldown = self.cooldown
                    return [], "full"
                self._phase = "risk_full"
                self._save_cycle_state()
                self.log(
                    f"[cloud-daemon] 休息结束，进入 risk全池补扫 "
                    f"(batch={self.batch_size} cd={self.cooldown}s "
                    f"≥{risk_cfg['min_age_hours']}h)"
                )
                continue

            if self._phase == "daily":
                batch = self._pick_batch()
                if batch:
                    return batch, "full"
                if self._count_full_pool_pending() > 0:
                    self.log(
                        f"[cloud-daemon] 待扫≈{self._count_full_pool_pending()} "
                        f"本批为空，{self.cooldown}s 后重试"
                    )
                    self._last_cooldown = self.cooldown
                    return [], "full"
                if self._full_round_until > now:
                    self._phase = "pause"
                    self._save_cycle_state()
                    continue
                if self._full_round_until > 0:
                    self._phase = "risk_full"
                    self._save_cycle_state()
                    self.log(
                        "[cloud-daemon] 今日首轮此前已完成且休息已过，"
                        "进入 risk全池补扫"
                    )
                    continue
                if self._today_first_round_done():
                    self._phase = "risk_full"
                    self._save_cycle_state()
                    self.log(
                        "[cloud-daemon] 检测到今日首轮已完成(重启恢复)，"
                        "直接进入 risk全池补扫"
                    )
                    continue
                self._schedule_pool_pause("今日首轮全池扫描完成")
                self._last_cooldown = self.cooldown
                return [], "full"

            if self._phase == "risk_full":
                batch = self._pick_risk_full_batch()
                if batch:
                    self.log(
                        f"[cloud-daemon] risk全池 本批={len(batch)} "
                        f"(距上次≥{risk_cfg['min_age_hours']}h claim)"
                    )
                    return batch, "risk_full"
                self._schedule_pool_pause("本轮 risk全池补扫完成")
                self._last_cooldown = self.cooldown
                return [], "risk_full"

            self.log(f"[cloud-daemon] 未知阶段 {self._phase!r}，重置为 daily")
            self._phase = "daily"
            self._last_cooldown = self.cooldown
            return [], "full"

        self._last_cooldown = self.cooldown
        return [], "full"

'''
    text = text[: old_run.start()] + new_run + text[old_run.end() :]
    TARGET.write_text(text, encoding="utf-8")
    print(f"已修补 {TARGET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
