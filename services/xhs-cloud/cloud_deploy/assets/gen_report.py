# -*- coding: utf-8 -*-
"""
统一报告数据生成脚本
输出目录: 全量MMDD/（如 全量0616/），内含 data.js + index_with_gr.html + index_vue.html

流程（默认日报）:
  错峰等待 → Step 1 报告候选 velocity 重算（Phase1 双指标）
  → Step 2 查询组装 data.js
  可选: --history-backfill Step0a 补洞; --legacy-actual-recalc Step0b 旧日环比

指标口径（与 ⑥/APP/⑤ 统一）:
  真实增量 actual_v1d = 自上次有效快照的销量差值（4h~14d，非严格隔1天）
  预估日增量 v1d = 真实增量 × min(24/间隔小时, 1.5)

筛选: 实体 v1d>5 或 真实增量>=5；虚拟 v1d>1 或 真实增量>=1（虚拟门槛更低以覆盖低销慢涨品）
去重: 同标题保留真实增量最高（并列取预估日增量更高）
"""
import sqlite3
import json
import os
import re
import shutil
import sys
import time
import argparse
from datetime import datetime, timedelta
from collections import Counter
from product_classify import is_virtual_product

DB_PATH = os.environ.get(
    "XHS_DB_PATH",
    r"D:\jiekoufenxi\小红书多设备爬虫\crawl_data\xhs_burst_monitor.db",
)
CRAWLER_DIR = os.environ.get(
    "XHS_CRAWLER_ROOT",
    r"D:\jiekoufenxi\小红书多设备爬虫",
)
OUTPUT_DIR = os.environ.get(
    "XHS_REPORT_OUTPUT_DIR",
    os.path.dirname(os.path.abspath(__file__)),
)
HTML_SRC = os.path.join(OUTPUT_DIR, 'index_with_gr.html')
VUE_HTML_SRC = os.path.join(OUTPUT_DIR, 'index_vue.html')
OUT_LOG = os.path.join(OUTPUT_DIR, '_gen_report_log.txt')

DEFAULT_MIN_V1D = 5
DEFAULT_MIN_ACTUAL = 5
DEFAULT_MIN_V1D_VIRTUAL = 1
DEFAULT_MIN_ACTUAL_VIRTUAL = 1

if CRAWLER_DIR not in sys.path:
    sys.path.insert(0, CRAWLER_DIR)
try:
    from xhs_report_scope import candidate_where_clause, thresholds_for as _scope_thresholds_for
    CANDIDATE_WHERE = candidate_where_clause()
except ImportError:
    CANDIDATE_WHERE = (
        'lifecycle IN (0,1,2) '
        'AND (velocity_1d > ? OR actual_velocity_1d >= ?) '
        'AND sold_num <= 200000 '
        'AND (actual_velocity_1d IS NULL OR actual_velocity_1d <= 50000) '
        'AND (velocity_1d IS NULL OR velocity_1d <= 50000)'
    )


def _thresholds_for(is_virtual, min_v1d, min_actual, min_v1d_virtual, min_actual_virtual):
    try:
        return _scope_thresholds_for(bool(is_virtual))
    except NameError:
        if is_virtual:
            return min_v1d_virtual, min_actual_virtual
        return min_v1d, min_actual

REPORT_DISCLAIMER = {
    "title": "免责声明与使用须知",
    "version": "2026-06",
    "lines": [
        "本报告为基于公开页面信息与系统计算的选品数据分析参考，不构成投资建议、经营建议、收益承诺或平台官方意见。",
        "报告中的「真实增量」为自上次有效扫描快照起的销量差值（不要求严格隔1天）；「预估日增量」为按扫描间隔折算的日均估值；二者均可能存在延迟、误差或缺失，请以平台页面实时信息为准并自行核实。",
        "用户应独立判断商品合规性、知识产权、价格、库存及平台规则，因使用本报告所作决策产生的风险与责任由用户自行承担。",
        "本报告不意味着与小红书等任何平台存在授权、合作或背书关系；禁止将本报告用于侵权抄款、虚假宣传、刷量或其他违法违规用途。",
        "未经权利人书面许可，不得将本报告数据批量转售、公开传播或用于训练对外商业模型。",
        "继续使用本报告即视为您已阅读并理解上述条款。",
    ],
}

COLUMNS = [
    "goods_id", "title", "price", "sold", "actual_v1d", "v1d",
    "actual_gr", "actual_vsr", "vsr",
    "burst", "pool", "first_seen", "store_id", "store_name",
    "shop_sales", "shop_fans", "shop_fsr", "goods_fsr",
    "behavior", "is_virtual", "anomaly",
]
COL = {name: i for i, name in enumerate(COLUMNS)}

# build_item_row 所需的 goods 表 SELECT 前缀（20 列，不含 is_virtual / actual_velocity_1d）
GOODS_ITEM_SELECT = '''goods_id, title, deal_price, sold_num,
                          velocity_1h, velocity_6h, velocity_1d,
                          daily_growth_rate, acceleration, burst_score, pool,
                          first_seen, store_id, store_name, shelf_time,
                          shop_sales, shop_fans, fans_count, behavior_tags, keyword'''

FIELD_GUIDE = [
    {"field": "商品ID", "key": "goods_id", "formula": "—", "desc": "平台唯一标识，用于搜索、导出与溯源。", "reference": "复制ID到小红书搜索验证商品是否仍在售。"},
    {"field": "商品名称", "key": "title", "formula": "—", "desc": "抓取时的标题快照，同标题多规格已去重保留最高真实增量。", "reference": "含「定制/专属/活动」等词需警惕短期活动品；优先常青需求词。"},
    {"field": "价格", "key": "price", "formula": "deal_price", "desc": "当前成交价（券后/活动价）。", "reference": "虚拟品 9.9~59 走量；实体 30~150 利润带；超 200 需更高实际增量支撑。"},
    {"field": "销量", "key": "sold", "formula": "sold_num 快照", "desc": "平台累计已售，可能因活动结束、展示规则或退款回调。", "reference": "<100 新品窗口；100~1k 验证期；>1k 红海，靠实际增量/增速突围。"},
    {"field": "真实增量", "key": "actual_v1d", "formula": "当前销量 − 上次有效快照", "desc": "自上次扫描以来真实多卖的件数，不外推。选品第一优先级。", "reference": "≥5 值得看；≥20 强动销；≥50 爆款候选。默认按此列降序。"},
    {"field": "预估日增量", "key": "v1d", "formula": "按扫描间隔折算的日均估值", "desc": "辅助发现「正在加速」的商品，不能单独作为决策依据。", "reference": "与真实增量同涨时可提高优先级；二者背离时以真实增量为准。"},
    {"field": "真实日增速", "key": "actual_gr", "formula": "真实增量 ÷ 基准销量", "desc": "相对增幅（百分比），低销量新品上容易偏高。", "reference": ">10% 健康涨；>30% 高速；需结合真实增量绝对值看。"},
    {"field": "真实增销比", "key": "actual_vsr", "formula": "真实增量 ÷ 当前销量", "desc": "真实多卖部分占总量比例，通常 ≤100%。", "reference": ">5% 有感觉；>15% 强动销；>30% 极高关注（核实是否低基数）。"},
    {"field": "预估增销比", "key": "vsr", "formula": "预估日增量 ÷ 当前销量", "desc": "外推强度指标，>100% 表示预估值超过总销量。", "reference": ">50% 且真实增量也在涨：加速信号；>100% 标黄，必须对照真实增量。"},
    {"field": "爆发分", "key": "burst", "formula": "增量+短周期动销加权", "desc": "系统内部分层用综合分，不等同于平台热度。", "reference": "配合 pool 分层筛选；排序仍以真实增量为主。"},
    {"field": "分层", "key": "pool", "formula": "规则+爆发分", "desc": "NEW/WATCH/ACCEL/BURST 四级池。", "reference": "日常筛 ACCEL+BURST；NEW 跟踪 2~3 天再决策。"},
    {"field": "店铺名称", "key": "store_name", "formula": "—", "desc": "所属店铺，可看同店铺货策略。", "reference": "TOP 店铺反复出现的类目=验证过的需求方向。"},
    {
        "field": "店铺粉销比",
        "key": "shop_fsr",
        "formula": "店铺粉丝数 ÷ 店铺总销量",
        "desc": "粉丝相对店铺整体动销的占比；越低表示店铺以较少粉丝支撑更多销量。",
        "reference": "≤0.05 店铺整体偏「低粉高销」；>0.5 粉丝多、动销弱，慎跟新店款。",
    },
    {
        "field": "商品粉销比",
        "key": "goods_fsr",
        "formula": "店铺粉丝数 ÷ 本商品销量",
        "desc": "粉丝相对单品销量的占比；识别真·低粉高销的核心指标。",
        "reference": "≤0.02 强低粉高销（例：500粉卖3万）；0.02~0.1 值得关注；>0.3 粉丝杠杆低。",
    },
    {"field": "行为数据", "key": "behavior", "formula": "—", "desc": "如「自动发货」等标签，辅助判断虚拟/实体。", "reference": "含自动发货→高概率虚拟品，交付成本低。"},
    {"field": "首次发现", "key": "first_seen", "formula": "—", "desc": "系统首次入库时间。", "reference": "<24h 为 NEW；无真实增量时重点看标题需求与 pool。"},
    {"field": "数据异常", "key": "anomaly", "formula": "销量/增量超合理上限", "desc": "脏数据已在报告生成时排除；标黄为轻度异常。", "reference": "sold>20万或增量>5万或增量>销量35% 不入报告。"},
]

SELECTION_GUIDE = {
    "title": "统一选品标准参考",
    "principle": "本报告采用「真实动销优先、预估动销辅助」：决策以「真实增量 + 真实日增速 + 真实增销比」为核心；「预估」系列仅作加速参考，不可单信。",
    "workflow": [
        {"step": "1", "name": "定赛道", "text": "切换「虚拟/实体」Tab。虚拟=无需物流（资料/课程/模板/券码，交付快、可复制）；实体=需发货（供应链、物流、退货成本更高）。两赛道分开排序，不混比。"},
        {"step": "2", "name": "缩范围", "text": "点击 BURST + ACCEL 分层按钮，或搜索关键词/店铺。排除标黄异常行（除非 actual 仍优秀）。价格带结合赛道：虚拟偏 9.9~59，实体偏 30~150。"},
        {"step": "3", "name": "验动销", "text": "表格按「真实增量」降序。核心门槛：真实增量≥5 且 pool 为 ACCEL/BURST；同时看真实日增速>10%、真实增销比>5%。三指标同时成立=真实在卖。"},
        {"step": "4", "name": "看趋势", "text": "预估增销比>50% 且真实增量也在涨=加速确认；pool 为 ACCEL/BURST 优先。"},
        {"step": "5", "name": "做决策", "text": "S 级直接跟进；A 级加入清单 24h 复验；B 级仅观察；C 级跳过。导出 CSV 留档，次日对比 actual 是否持续。"},
    ],
    "priority_fields": [
        "第一看：真实增量（卖了多少）",
        "第二看：真实日增速（涨得多快）",
        "第三看：真实增销比（动销占总量比例）",
        "第四看：商品粉销比 → 店铺粉销比（低粉高销，表格列紧随三角指标之后）",
        "第五看：分层 pool（趋势确认）",
        "第六看：预估日增量 / 预估增销比 / 爆发分（加速参考，不可单信）",
        "辅助看：价格、销量、店铺、行为标签、首次发现",
    ],
    "table_column_order": [
        "商品ID/名称",
        "真实增量 → 真实日增速 → 真实增销比",
        "商品粉销比 → 店铺粉销比",
        "分层",
        "预估日增量 → 预估增销比 → 爆发分",
        "价格 → 销量",
        "店铺信息 → 行为 → 首次发现",
    ],
    "grade_criteria": [
        {
            "grade": "S",
            "label": "强推跟进",
            "color": "#ff4757",
            "conditions": [
                "pool = BURST 或 ACCEL",
                "实际增量 ≥ 20（或销量<100 时 ≥10 且实际日增速>30%）",
                "实际日增速 > 15%",
                "实际增销比 > 8%",
                "非异常标黄，或标黄但 actual 增量仍 ≥10",
            ],
            "action": "优先上架/跟款，24h 内再次验证 actual 是否维持",
        },
        {
            "grade": "A",
            "label": "值得跟进",
            "color": "#ffa502",
            "conditions": [
                "pool = ACCEL 或 BURST/WATCH 且 actual ≥5",
                "实际日增速 8%~30%",
                "实际增销比 3%~15%",
            ],
            "action": "加入候选清单，观察 1~2 天 actual 趋势",
        },
        {
            "grade": "B",
            "label": "观察",
            "color": "#58a6ff",
            "conditions": [
                "pool = WATCH 或 NEW",
                "实际增量 1~5，或仅有预估指标偏高",
                "预估指标高但 actual 一般",
            ],
            "action": "记录关键词方向，暂不投入，等 actual 突破 5 再议",
        },
        {
            "grade": "C",
            "label": "跳过",
            "color": "#6e7681",
            "conditions": [
                "actual 增量 = 0",
                "标黄且 actual 增量 < 3",
                "实际日增速 < 0 或销量回调",
                "红海类目（销量>5000）且 actual 增销比 < 1%",
            ],
            "action": "不做跟进，避免被外推数据误导",
        },
    ],
    "pool_tips": {
        "BURST": "系统判定爆发期：流量大、竞争骤增。适合快反跟款/笔记，速度比完美更重要。",
        "ACCEL": "加速上升期：性价比最高的窗口，actual 三角指标达标即可重点做。",
        "WATCH": "有动销未爆发：适合挖关键词方向，等 actual 连续 2 天>5 再进。",
        "NEW": "24h 内新发现：数据不完整，重点看标题需求强度与 actual 是否突破。",
    },
    "track_tips": {
        "virtual": {
            "title": "虚拟品选品要点",
            "items": [
                "优先「自动发货」、模板/资料/课程/券码类，边际成本趋近 0",
                "价格带 9.9~59 最易起量；actual 增销比>10% 即为强品",
                "关注标题是否含考试/季节/平台活动词（时效性需标注跟进截止）",
                "同标题去重后仍多条=说明需求真，可对比选 actual 最高款",
            ],
        },
        "physical": {
            "title": "实体品选品要点",
            "items": [
                "actual 增量要覆盖物流与退货成本，建议 actual≥10 起评",
                "价格 30~150 为报告主力带；超 200 需 actual 增量≥20",
                "销量 100~3000 为甜区：有验证且仍有增长空间",
                "看店铺销量/粉丝：店本身有动销时，新品 actual 更可信",
            ],
        },
    },
    "price_bands": [
        {"range": "0~30", "virtual": "走量引流款，actual≥5 即可测", "physical": "低客单需 actual≥15 才有利润"},
        {"range": "30~50", "virtual": "主力价格带，actual 增销比>8% 优先", "physical": "入门利润带，配合 actual 增速>10%"},
        {"range": "50~100", "virtual": "中高客单虚拟，看 actual≥10", "physical": "主流利润带，actual≥10 且 pool=ACCEL"},
        {"range": "100~200", "virtual": "专项资料/课程，看增速>20%", "physical": "需 actual≥20，谨慎库存"},
        {"range": ">200", "virtual": "高端课/服务，小圈层", "physical": "仅跟 S 级 actual 爆发"},
    ],
    "red_flags": [
        "标黄行：预估日增量>销量 或 预估增销比>100% — 以真实增量为准",
        "预估很高但真实增量<3 — 典型「看起来火、其实没卖多少」",
        "销量>1万 且真实增销比<1% — 红海存量品，增长空间有限",
    ],
    "daily_routine": "每日建议流程：① 打开报告看 BURST/ACCEL 数量与平均 actual 增量 → ② 按 actual 增量排序浏览 Top50 → ③ 导出 CSV 标记 S/A → ④ 次日对比 actual 是否持续（持续=确认，回落=放弃）。",
    "filters": "操作提示：入选=预估日增量>5 或 真实增量>=5（满足任一）；默认按真实增量降序；点击表头排序；导出 CSV 含全部决策字段。",
}

STOP_WORDS = {
    '的', '和', '与', '及', '或', '在', '是', '有', '了', '等', '可', '为', '中', '对', '到', '从', '上', '下',
    '用', '送', '含', '版', '款', '套', '个', '本', '件', '组', '包', '盒', '双', '条', '支', '瓶', '袋', '册',
    '第', '新', '全', '大', '小', '多', '少', '高', '低', '长', '短', '厚', '薄', '加', '超', '特', '精', '优',
    '最', '自', '同', '不', '无', '非', '未', '已', '被', '把', '让', '给', '比', '更', '还', '又', '再',
    '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '百', '千', '万', '亿',
    '年', '月', '日', '时', '分', '秒', '号', '期', '次', '回', '遍', '场', '步', '天', '周', '季',
}

PRICE_ORDER = ['0-30', '30-50', '50-100', '100-200', '200-500', '>500']
SOLD_ORDER = ['0-100', '100-500', '500-1k', '1k-5k', '5k-1w', '>1w']
V1D_ORDER = ['0-5', '5-10', '10-20', '20-50', '50-100', '>100']
GR_ORDER = ['0-5%', '5-10%', '10-20%', '20-50%', '50-100%', '>100%']
VSR_ORDER = ['0-1%', '1-5%', '5-10%', '10-20%', '20-50%', '>50%']


def price_bucket(p):
    if p <= 30:
        return '0-30'
    if p <= 50:
        return '30-50'
    if p <= 100:
        return '50-100'
    if p <= 200:
        return '100-200'
    if p <= 500:
        return '200-500'
    return '>500'


def sold_bucket(s):
    if s <= 100:
        return '0-100'
    if s <= 500:
        return '100-500'
    if s <= 1000:
        return '500-1k'
    if s <= 5000:
        return '1k-5k'
    if s <= 10000:
        return '5k-1w'
    return '>1w'


def v1d_bucket(v):
    if v <= 5:
        return '0-5'
    if v <= 10:
        return '5-10'
    if v <= 20:
        return '10-20'
    if v <= 50:
        return '20-50'
    if v <= 100:
        return '50-100'
    return '>100'


def gr_bucket(gr_pct):
    """daily_growth_rate 在库中已是百分比数值，如 5.6 表示 5.6%"""
    if gr_pct <= 5:
        return '0-5%'
    if gr_pct <= 10:
        return '5-10%'
    if gr_pct <= 20:
        return '10-20%'
    if gr_pct <= 50:
        return '20-50%'
    if gr_pct <= 100:
        return '50-100%'
    return '>100%'


def vsr_bucket(vsr_ratio):
    """增销比 = velocity_1d / sold_num，为小数比例"""
    if vsr_ratio <= 0.01:
        return '0-1%'
    if vsr_ratio <= 0.05:
        return '1-5%'
    if vsr_ratio <= 0.1:
        return '5-10%'
    if vsr_ratio <= 0.2:
        return '10-20%'
    if vsr_ratio <= 0.5:
        return '20-50%'
    return '>50%'


def ordered_dict(counter, order):
    return {k: counter.get(k, 0) for k in order}


def parse_chinese_count(text):
    """解析 shop_fans / shop_sales 等文本：'1.2万+'、'5000'、'已售 3万'。"""
    if text is None:
        return 0
    s = str(text).replace(",", "").replace("，", "").strip()
    if not s or s in ("0", "-", "—", "None"):
        return 0
    m = re.search(r"([\d.]+)\s*[万萬]", s)
    if m:
        try:
            return int(float(m.group(1)) * 10000)
        except ValueError:
            return 0
    m = re.search(r"([\d.]+)", s)
    if m:
        try:
            return int(float(m.group(1)))
        except ValueError:
            return 0
    return 0


def calc_fan_sales_ratios(fans_count, shop_fans_text, sold_num, shop_sales_text):
    """
    粉销比 = 粉丝数 ÷ 销量（越低越「低粉高销」）。
    返回 (shop_fsr, goods_fsr)，无法计算时为 None。
    """
    fans = parse_chinese_count(shop_fans_text)
    if fans <= 0 and fans_count:
        try:
            fans = int(fans_count or 0)
        except (TypeError, ValueError):
            fans = 0
    sold = int(sold_num or 0)
    shop_sales = parse_chinese_count(shop_sales_text)
    shop_fsr = round(fans / shop_sales, 6) if fans > 0 and shop_sales > 0 else None
    goods_fsr = round(fans / sold, 6) if fans > 0 and sold > 0 else None
    return shop_fsr, goods_fsr


def log(msg):
    with open(OUT_LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')
    print(msg, flush=True)


def load_sold_snapshot(c, date):
    c.execute('SELECT goods_id, sold_num FROM sold_history WHERE snapshot_date=?', (date,))
    return {gid: int(sn) for gid, sn in c.fetchall() if sn is not None}


def load_yesterday_sold(c):
    c.execute("SELECT date('now','localtime','-1 day')")
    yesterday = c.fetchone()[0]
    sold_map = load_sold_snapshot(c, yesterday)
    if not sold_map:
        c.execute(
            'SELECT MAX(snapshot_date) FROM sold_history WHERE snapshot_date < date("now","localtime")',
        )
        latest = c.fetchone()[0]
        if latest:
            log(f'  昨日({yesterday})无快照，回退最近可用日 {latest}')
            yesterday = latest
            sold_map = load_sold_snapshot(c, yesterday)
    return sold_map, yesterday


def resolve_sold_baseline(gid, baseline_map, fallback_map=None, first_seen=None, today=None):
    if gid not in baseline_map:
        return None, False
    base = int(baseline_map[gid])
    used_fallback = False
    is_new_today = bool(first_seen and today and str(first_seen)[:10] == today)
    if base == 0:
        if fallback_map and gid in fallback_map:
            prev = int(fallback_map[gid])
            if prev > 0:
                base = prev
                used_fallback = True
            elif not is_new_today:
                return None, False
        elif not is_new_today:
            return None, False
    return base, used_fallback


def calc_actual_v1d(gid, sold, baseline_map, first_seen, today, fallback_map=None):
    base, _ = resolve_sold_baseline(gid, baseline_map, fallback_map, first_seen, today)
    if base is not None:
        return round(max(0, sold - base), 1)
    if first_seen and str(first_seen)[:10] == today:
        return round(float(sold), 1) if sold > 0 else 0.0
    return None


def normalize_gr_pct(gr_val):
    gr_val = gr_val or 0
    if gr_val <= 0:
        return 0.0
    if gr_val < 1:
        return round(gr_val * 100, 2)
    return round(gr_val, 2)


def calc_actual_gr(gid, sold, baseline_map, first_seen, today, fallback_map=None):
    base, _ = resolve_sold_baseline(gid, baseline_map, fallback_map, first_seen, today)
    if base is not None:
        if base <= 0:
            return None
        if sold > base:
            return round((sold - base) / base * 100, 2)
        return 0.0
    if first_seen and str(first_seen)[:10] == today:
        return None
    return None


def get_velocity_columns(c):
    """报告所需的 Phase1 velocity 扩展字段（daily_growth_rate 已在主 SELECT）。"""
    c.execute("PRAGMA table_info(goods)")
    cols = {row[1] for row in c.fetchall()}
    wanted = ['actual_velocity_1d']
    return [name for name in wanted if name in cols]


def get_goods_extra_columns(c):
    """兼容旧脚本别名。"""
    return get_velocity_columns(c)


def build_item_row(row, is_v):
    n = len(row)
    gid, title, price, sold, v1h, v6h, v1d, gr, acc, burst, pool, \
        first_seen, store_id, store_name, shelf_time, shop_sales, shop_fans, fans_count, behavior, keyword = row[:20]

    db_actual_v1d = row[20] if n > 20 else None

    price = price or 0
    sold = sold or 0
    v1h = v1h or 0
    v6h = v6h or 0
    v1d = v1d or 0
    gr = gr or 0
    acc = acc or 0
    burst = burst or 0
    pool = pool or 'WATCH'
    if sold == 0 and pool in ('BURST', 'ACCEL'):
        pool = 'WATCH'
    store_name = store_name or ''
    shelf_time = shelf_time or ''
    behavior = behavior or ''
    keyword = keyword or ''

    actual_v1d = round(float(db_actual_v1d or 0), 1) if db_actual_v1d not in (None, '') else 0.0

    gr_pct = normalize_gr_pct(gr)
    actual_gr = gr_pct
    vsr = round(v1d / sold, 4) if sold > 0 else 0
    actual_vsr = round(actual_v1d / sold, 4) if sold > 0 and actual_v1d > 0 else 0.0

    try:
        from xhs_sold_sanity import is_dirty_sold_metrics
        dirty, _dirty_reason = is_dirty_sold_metrics(sold, actual_v1d, v1d)
    except Exception:
        dirty = False

    anomaly = 1 if dirty or (sold > 0 and v1d > sold) or vsr > 1 else 0
    classified = 1 if is_virtual_product(title, behavior, is_v) else 0
    shop_fsr, goods_fsr = calc_fan_sales_ratios(fans_count, shop_fans, sold, shop_sales)

    return [
        gid, title, round(price, 2), sold,
        actual_v1d, round(v1d, 1),
        actual_gr,
        actual_vsr, vsr,
        round(burst, 1),
        pool, first_seen or '', store_id or '',
        store_name,
        shop_sales or '', shop_fans or '',
        shop_fsr, goods_fsr,
        behavior, classified, anomaly,
    ], keyword, (classified != is_v)


def dedup_by_title(items):
    best = {}
    for item in items:
        title = (item[1] or '').strip()
        if not title:
            continue
        prev = best.get(title)
        if not prev:
            best[title] = item
            continue
        a_act, a_v1d = item[COL['actual_v1d']], item[COL['v1d']]
        p_act, p_v1d = prev[COL['actual_v1d']], prev[COL['v1d']]
        if a_act > p_act or (a_act == p_act and a_v1d > p_v1d):
            best[title] = item
    result = list(best.values())
    result.sort(key=lambda x: (x[COL['actual_v1d']], x[COL['v1d']]), reverse=True)
    return result


def aggregate(items):
    price_dist = Counter()
    sold_dist = Counter()
    v1d_dist = Counter()
    actual_gr_dist = Counter()
    vsr_dist = Counter()
    actual_vsr_dist = Counter()
    keyword_counter = Counter()
    store_counter = Counter()
    physical_v1d = 0
    virtual_v1d = 0

    for item in items:
        price, sold = item[COL['price']], item[COL['sold']]
        v1d = item[COL['v1d']]
        actual_gr = item[COL['actual_gr']]
        vsr = item[COL['vsr']]
        actual_vsr = item[COL['actual_vsr']]
        is_v = item[COL['is_virtual']]

        if is_v == 1:
            virtual_v1d += 1
        elif is_v == 0:
            physical_v1d += 1

        if price > 0:
            price_dist[price_bucket(price)] += 1
        sold_dist[sold_bucket(sold)] += 1
        v1d_dist[v1d_bucket(v1d)] += 1
        if actual_gr is not None and actual_gr > 0:
            actual_gr_dist[gr_bucket(actual_gr)] += 1
        if vsr > 0:
            vsr_dist[vsr_bucket(vsr)] += 1
        if actual_vsr is not None and actual_vsr > 0:
            actual_vsr_dist[vsr_bucket(actual_vsr)] += 1

        store_name = item[COL['store_name']]
        if store_name:
            store_counter[store_name] += 1

        title = item[1] or ''
        words = re.split(r'[\s·|/\\【】\[\]（）()《》<>「」""\'\'\-—_+,.;:!?~`@#$%^&*+=|{}]', title)
        for w in words:
            w = w.strip()
            if len(w) >= 2 and len(w) <= 8 and w not in STOP_WORDS and not w.isdigit():
                keyword_counter[w] += 1

    return {
        'price_dist': price_dist,
        'sold_dist': sold_dist,
        'v1d_dist': v1d_dist,
        'actual_gr_dist': actual_gr_dist,
        'gr_dist': actual_gr_dist,  # 兼容旧脚本
        'vsr_dist': vsr_dist,
        'actual_vsr_dist': actual_vsr_dist,
        'keyword_counter': keyword_counter,
        'store_counter': store_counter,
        'physical_v1d': physical_v1d,
        'virtual_v1d': virtual_v1d,
    }


def fetch_items(c, dedup=True, min_v1d=DEFAULT_MIN_V1D, min_actual=DEFAULT_MIN_ACTUAL,
                min_v1d_virtual=DEFAULT_MIN_V1D_VIRTUAL, min_actual_virtual=DEFAULT_MIN_ACTUAL_VIRTUAL):
    items = []
    keyword_counter = Counter()
    raw_count = 0
    reclassified = 0
    dirty_skipped = 0

    try:
        from xhs_sold_sanity import is_dirty_sold_metrics
    except Exception:
        is_dirty_sold_metrics = None

    vel_cols = get_velocity_columns(c)
    extra_sql = (', ' + ', '.join(vel_cols)) if vel_cols else ''
    if len(vel_cols) < 1:
        log(f'  警告: goods 表缺少 velocity 扩展字段，请先运行爬虫 init_database')

    select_cols = f'''{GOODS_ITEM_SELECT}
                          {extra_sql}'''

    for is_v, label in [(0, '实体'), (1, '虚拟')]:
        t0 = time.time()
        th_v1d, th_actual = _thresholds_for(
            is_v, min_v1d, min_actual, min_v1d_virtual, min_actual_virtual,
        )

        sql_v1d = f'''SELECT {select_cols} FROM goods
                      WHERE is_virtual=? AND lifecycle IN (0,1,2) AND velocity_1d > ?
                      AND sold_num <= 200000
                      AND (actual_velocity_1d IS NULL OR actual_velocity_1d <= 50000)
                      AND (velocity_1d IS NULL OR velocity_1d <= 50000)'''
        c.execute(sql_v1d, (is_v, th_v1d))
        rows_v1d = c.fetchall()

        sql_actual = f'''SELECT {select_cols} FROM goods
                         WHERE is_virtual=? AND lifecycle IN (0,1,2) AND actual_velocity_1d >= ?
                         AND sold_num <= 200000
                         AND (actual_velocity_1d IS NULL OR actual_velocity_1d <= 50000)
                         AND (velocity_1d IS NULL OR velocity_1d <= 50000)'''
        c.execute(sql_actual, (is_v, th_actual))
        rows_actual = c.fetchall()

        seen_ids = set()
        rows = []
        for row in rows_v1d + rows_actual:
            if row[0] not in seen_ids:
                seen_ids.add(row[0])
                rows.append(row)
        rows.sort(key=lambda r: (-(r[20] if len(r) > 20 and r[20] else 0), -(r[6] or 0)))

        raw_count += len(rows)
        for row in rows:
            item, keyword, changed = build_item_row(row, is_v)
            if is_dirty_sold_metrics and is_dirty_sold_metrics(item[COL['sold']], item[COL['actual_v1d']], item[COL['v1d']])[0]:
                dirty_skipped += 1
                continue
            items.append(item)
            if changed:
                reclassified += 1
            if keyword and keyword != 'web_store':
                keyword_counter[keyword] += 1
        log(f'  [{label}] {len(rows)} 条 (v1d={len(rows_v1d)} actual={len(rows_actual)}) ({time.time()-t0:.1f}s)')

    if dedup:
        before = len(items)
        items = dedup_by_title(items)
        log(f'  标题去重: {before} -> {len(items)} (移除 {before - len(items)} 条变体)')

    log(f'  分类校正: {reclassified} 条与数据库 is_virtual 不一致')
    if dirty_skipped:
        log(f'  脏数据排除: {dirty_skipped} 条 (sold>20万或增量异常)')
    return items, keyword_counter, raw_count, reclassified


def recalc_report_candidates(min_v1d=DEFAULT_MIN_V1D, min_actual=DEFAULT_MIN_ACTUAL,
                             min_v1d_virtual=DEFAULT_MIN_V1D_VIRTUAL,
                             min_actual_virtual=DEFAULT_MIN_ACTUAL_VIRTUAL, batch_size=500):
    """报告生成前对候选批跑 Phase1 velocity 重算（实体/虚拟分档阈值）。"""
    from xhs_db_schema import init_database
    from xhs_sold_velocity import recalc_velocity_for_goods

    init_database()
    conn = sqlite3.connect(DB_PATH, timeout=300)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA busy_timeout=300000')
    c = conn.cursor()
    ids = []
    for is_v, label in [(0, '实体'), (1, '虚拟')]:
        th_v1d, th_actual = _thresholds_for(
            is_v, min_v1d, min_actual, min_v1d_virtual, min_actual_virtual,
        )
        c.execute(
            f'''SELECT goods_id FROM goods WHERE is_virtual=? AND lifecycle IN (0,1,2)
               AND velocity_1d > ? AND sold_num <= 200000
               AND (actual_velocity_1d IS NULL OR actual_velocity_1d <= 50000)
               AND (velocity_1d IS NULL OR velocity_1d <= 50000)''',
            (is_v, th_v1d),
        )
        ids.extend(row[0] for row in c.fetchall())
        c.execute(
            f'''SELECT goods_id FROM goods WHERE is_virtual=? AND lifecycle IN (0,1,2)
               AND actual_velocity_1d >= ? AND sold_num <= 200000
               AND (actual_velocity_1d IS NULL OR actual_velocity_1d <= 50000)
               AND (velocity_1d IS NULL OR velocity_1d <= 50000)''',
            (is_v, th_actual),
        )
        ids.extend(row[0] for row in c.fetchall())
    ids = list(dict.fromkeys(ids))
    log(
        f'Step 1: velocity 重算（候选 {len(ids):,} 条, '
        f'实体 v1d>{min_v1d}/真实>={min_actual}, '
        f'虚拟 v1d>{min_v1d_virtual}/真实>={min_actual_virtual}）...'
    )
    if not ids:
        conn.close()
        return 0

    t0 = time.time()
    updated = 0
    for i in range(0, len(ids), batch_size):
        chunk = ids[i:i + batch_size]
        updated += recalc_velocity_for_goods(c, chunk)
        conn.commit()
        done = min(i + batch_size, len(ids))
        if done % 2000 == 0 or done >= len(ids):
            log(f'  进度 {done}/{len(ids)} ({time.time()-t0:.1f}s)')
    conn.close()
    log(f'  velocity 重算完成: {updated}/{len(ids)} ({time.time()-t0:.1f}s)')
    return updated


def resolve_output_dir(date_obj=None, custom_dir=''):
    if custom_dir:
        out_dir = custom_dir if os.path.isabs(custom_dir) else os.path.join(OUTPUT_DIR, custom_dir)
    else:
        mmdd = (date_obj or datetime.now()).strftime('%m%d')
        out_dir = os.path.join(OUTPUT_DIR, f'全量{mmdd}')
    os.makedirs(out_dir, exist_ok=True)
    return out_dir


def main(dedup=True, output_dir='', min_v1d=DEFAULT_MIN_V1D, min_actual=DEFAULT_MIN_ACTUAL,
         min_v1d_virtual=DEFAULT_MIN_V1D_VIRTUAL, min_actual_virtual=DEFAULT_MIN_ACTUAL_VIRTUAL,
         skip_velocity_recalc=False, legacy_actual_recalc=False,
         skip_wait_idle=False, history_backfill=False, actual_scope='report'):
    with open(OUT_LOG, 'w', encoding='utf-8') as f:
        f.write(f'Start: {datetime.now()}\n')

    if CRAWLER_DIR not in sys.path:
        sys.path.insert(0, CRAWLER_DIR)

    if not skip_wait_idle:
        try:
            from xhs_db_idle import report_time_hint, wait_main_db_idle
            hint = report_time_hint()
            log(hint['hint'])
            ok, waited = wait_main_db_idle(max_wait_sec=180, log_func=log)
            if not ok:
                log('  警告: 主库 180s 内仍 busy，继续执行可能 database locked')
        except Exception as e:
            log(f'  错峰等待跳过: {e}')
    else:
        log('已跳过主库错峰等待 (--no-wait-idle)')

    if history_backfill:
        log('Step 0a: sold_history 完整性检查与补洞...')
        try:
            from xhs_sold_history_health import ensure_sold_history_health
            ensure_sold_history_health(db_path=DB_PATH, log_func=log)
        except Exception as e:
            log(f'  警告: sold_history 补洞异常 ({e})')
    else:
        log('Step 0a: 跳过 sold_history 补洞（日报默认；维护用 --history-backfill）')

    if legacy_actual_recalc:
        log(f'Step 0b: 旧版日环比 actual 回写（scope={actual_scope}, v1d>{min_v1d}）...')
        try:
            from actual_metrics_recalc import recalc_actual_metrics
            stats = recalc_actual_metrics(
                db_path=DB_PATH,
                log_func=log,
                scope=actual_scope,
                min_v1d=min_v1d,
            )
            if not stats.get('ok'):
                log(f"  警告: 实际指标回写失败 ({stats.get('error', 'unknown')})")
            else:
                log(f"  已回写 {stats.get('updated', 0):,} 条（范围共 {stats.get('total', 0):,} 条）")
        except Exception as e:
            log(f'  警告: 实际指标回写异常 ({e})')
    else:
        log('Step 0b: 跳过旧版日环比回写（默认使用 Phase1 快照双指标）')

    if not skip_velocity_recalc:
        try:
            recalc_report_candidates(
                min_v1d=min_v1d, min_actual=min_actual,
                min_v1d_virtual=min_v1d_virtual, min_actual_virtual=min_actual_virtual,
            )
        except Exception as e:
            log(f'  警告: velocity 重算失败 ({e})，将使用库内现有 velocity 字段')
    else:
        log('Step 1: 跳过 velocity 重算 (--skip-velocity-recalc)')

    conn = sqlite3.connect(DB_PATH, timeout=300, isolation_level=None)
    conn.execute('PRAGMA query_only = ON')
    conn.execute('PRAGMA read_uncommitted = 1')
    c = conn.cursor()

    now = datetime.now()
    date_str = now.strftime('%Y-%m-%d')
    time_str = now.strftime('%Y-%m-%d %H:%M:%S')

    log(
        f'Step 2: 查询商品并聚合（实体 v1d>{min_v1d}/真实>={min_actual}；'
        f'虚拟 v1d>{min_v1d_virtual}/真实>={min_actual_virtual}）...'
    )
    t0 = time.time()
    items, keyword_counter, raw_count, reclassified = fetch_items(
        c, dedup=dedup, min_v1d=min_v1d, min_actual=min_actual,
        min_v1d_virtual=min_v1d_virtual, min_actual_virtual=min_actual_virtual,
    )
    agg = aggregate(items)
    for kw, cnt in agg['keyword_counter'].items():
        keyword_counter[kw] += cnt

    c.execute('SELECT COUNT(*) FROM goods')
    total_goods = c.fetchone()[0]

    c.execute('SELECT COUNT(*) FROM goods WHERE is_virtual=0 AND lifecycle IN (0,1,2)')
    physical_total = c.fetchone()[0]
    c.execute('SELECT COUNT(*) FROM goods WHERE is_virtual=1 AND lifecycle IN (0,1,2)')
    virtual_total = c.fetchone()[0]
    active_goods = physical_total + virtual_total

    pool_map = {}
    for is_v in (0, 1):
        th_v1d, th_actual = _thresholds_for(
            is_v, min_v1d, min_actual, min_v1d_virtual, min_actual_virtual,
        )
        for th_col, th_val in [('velocity_1d', th_v1d), ('actual_velocity_1d', th_actual)]:
            c.execute(
                f'''SELECT pool, COUNT(*) FROM goods
                   WHERE is_virtual=? AND lifecycle IN (0,1,2) AND {th_col} >= ?
                   AND sold_num <= 200000
                   AND (actual_velocity_1d IS NULL OR actual_velocity_1d <= 50000)
                   AND (velocity_1d IS NULL OR velocity_1d <= 50000)
                   GROUP BY pool''',
                (is_v, th_val),
            )
            for pool, cnt in c.fetchall():
                pool_map[pool] = pool_map.get(pool, 0) + cnt

    prices = sorted([item[COL['price']] for item in items if item[COL['price']] > 0])
    median_price = round(prices[len(prices) // 2], 1) if prices else 0
    avg_price = round(sum(prices) / len(prices), 1) if prices else 0
    avg_v1d = round(sum(item[COL['v1d']] for item in items) / len(items), 1) if items else 0

    actual_values = [item[COL['actual_v1d']] for item in items if item[COL['actual_v1d']] > 0]
    avg_actual_v1d = round(sum(actual_values) / len(actual_values), 1) if actual_values else 0
    anomaly_count = sum(1 for item in items if item[COL['anomaly']] == 1)

    actual_gr_values = [item[COL['actual_gr']] for item in items if item[COL['actual_gr']] > 0]
    avg_actual_gr = round(sum(actual_gr_values) / len(actual_gr_values), 2) if actual_gr_values else 0
    avg_gr = avg_actual_gr

    vsr_values = [item[COL['vsr']] for item in items if item[COL['vsr']] > 0]
    avg_vsr = round(sum(vsr_values) / len(vsr_values), 4) if vsr_values else 0

    actual_vsr_values = [item[COL['actual_vsr']] for item in items if item[COL['actual_vsr']] > 0]
    avg_actual_vsr = round(sum(actual_vsr_values) / len(actual_vsr_values), 4) if actual_vsr_values else 0

    top_keywords = keyword_counter.most_common(20)
    top_stores = agg['store_counter'].most_common(20)
    out_dir = resolve_output_dir(now, output_dir)

    risk_bundle = None
    try:
        from xhs_goods_risk_registry import load_report_risk_bundle, write_risk_csv, ensure_risk_tables
        ensure_risk_tables()
        risk_bundle = load_report_risk_bundle(report_date=date_str, fallback_days=7, limit=2000, db_path=DB_PATH)
        risk_csv = os.path.join(out_dir, f'风险商品清单_{date_str}.csv')
        write_risk_csv(risk_csv, risk_bundle)
        log(
            f'  风险品: 今日新发现 {risk_bundle["meta"]["today_count"]} 个, '
            f'报告附表 {risk_bundle["meta"]["count"]} 个, '
            f'累计注册 {risk_bundle["meta"]["total_registry"]:,}'
        )
        log(f'  风险 CSV: {risk_csv}')
    except Exception as e:
        log(f'  警告: 风险商品清单生成失败 ({e})')

    log(f'  原始: {raw_count}, 输出: {len(items)}, 实体: {agg["physical_v1d"]}, 虚拟: {agg["virtual_v1d"]} ({time.time()-t0:.1f}s)')
    log(f'  均价: {avg_price}, 均日增量: {avg_v1d}, 均实际日增速: {avg_actual_gr}%, 均实际增销比: {avg_actual_vsr * 100:.2f}%')

    filter_label = (
        f'实体 v1d>{min_v1d}/真实>={min_actual}；'
        f'虚拟 v1d>{min_v1d_virtual}/真实>={min_actual_virtual}'
    )
    data = {
        "meta": {
            "date": date_str,
            "filter_mode": "v1d_or_actual_split",
            "filter_label": filter_label,
            "min_v1d": min_v1d,
            "min_actual": min_actual,
            "min_v1d_virtual": min_v1d_virtual,
            "min_actual_virtual": min_actual_virtual,
            "time": time_str,
            "total_goods": total_goods,
            "active_goods": active_goods,
            "count": len(items),
            "count_raw": raw_count,
            "physical_v1d": agg['physical_v1d'],
            "virtual_v1d": agg['virtual_v1d'],
            "physical_total": physical_total,
            "virtual_total": virtual_total,
            "avg_price": avg_price,
            "median_price": median_price,
            "avg_v1d": avg_v1d,
            "avg_actual_v1d": avg_actual_v1d,
            "avg_gr": avg_gr,
            "avg_actual_gr": avg_actual_gr,
            "avg_vsr": avg_vsr,
            "avg_actual_vsr": avg_actual_vsr,
            "anomaly_count": anomaly_count,
            "metric_mode": "snapshot_phase1",
            "metric_note": "真实增量=上次有效扫描以来的销量差值；预估日增量=按动销节奏折算；脏数据已排除",
            "output_dir": out_dir,
            "deduped": dedup,
            "field_guide": FIELD_GUIDE,
            "selection_guide": SELECTION_GUIDE,
            "reclassified": reclassified,
            "classify_rule": "strict_no_shipping",
            "pool_new": pool_map.get('NEW', 0),
            "pool_watch": pool_map.get('WATCH', 0),
            "pool_accel": pool_map.get('ACCEL', 0),
            "pool_burst": pool_map.get('BURST', 0),
            "disclaimer": REPORT_DISCLAIMER,
            "risk_today_count": risk_bundle["meta"]["today_count"] if risk_bundle else 0,
            "risk_registry_total": risk_bundle["meta"]["total_registry"] if risk_bundle else 0,
        },
        "charts": {
            "price": ordered_dict(agg['price_dist'], PRICE_ORDER),
            "sold": ordered_dict(agg['sold_dist'], SOLD_ORDER),
            "v1d": ordered_dict(agg['v1d_dist'], V1D_ORDER),
            "gr": ordered_dict(agg['actual_gr_dist'], GR_ORDER),
            "vsr": ordered_dict(agg['actual_vsr_dist'], VSR_ORDER),
            "vsr_est": ordered_dict(agg['vsr_dist'], VSR_ORDER),
        },
        "top_keywords": top_keywords,
        "top_stores": top_stores,
        "columns": COLUMNS,
        "items": items,
    }
    if risk_bundle:
        data["risk"] = risk_bundle

    js_content = 'var REPORT_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    js_path = os.path.join(out_dir, 'data.js')
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(js_content)

    html_dst = os.path.join(out_dir, 'index_with_gr.html')
    if os.path.isfile(HTML_SRC):
        shutil.copy2(HTML_SRC, html_dst)
    else:
        log(f'  警告: 未找到 {HTML_SRC}')

    vue_dst = os.path.join(out_dir, 'index_vue.html')
    if os.path.isfile(VUE_HTML_SRC):
        shutil.copy2(VUE_HTML_SRC, vue_dst)
    else:
        log(f'  警告: 未找到 {VUE_HTML_SRC}')

    assets_dir = os.path.dirname(os.path.abspath(__file__))
    for theme_name in ('report_theme.css', 'report_theme.js'):
        theme_src = os.path.join(assets_dir, theme_name)
        if os.path.isfile(theme_src):
            shutil.copy2(theme_src, os.path.join(out_dir, theme_name))

    log(f'\n输出目录: {out_dir}')
    log(f'data.js 已生成: {js_path}')
    if os.path.isfile(html_dst):
        log(f'HTML 已复制: {html_dst}')
    if os.path.isfile(vue_dst):
        log(f'Vue报告已复制: {vue_dst}')
    log(f'商品数据: {len(items)} 条 (去重后, 实体{agg["physical_v1d"]}+虚拟{agg["virtual_v1d"]})')

    try:
        from track_queue_db import sync_daily_report
        inj = sync_daily_report(items, report_date=date_str, min_v1d=min_v1d)
        log(f'跟踪库注入: {inj.get("daily", 0)} 条 → daily_report_rank ({inj.get("report_date")})')
    except Exception as e:
        log(f'  警告: 跟踪库注入失败 ({e})，可手动运行 track_queue_db.py')

    try:
        from xhs_track_queue_db import ensure_history_seeded, count_sold_sync_ready
        ready, seeded, src = ensure_history_seeded(min_v1d=min_v1d, min_ready=1000)
        msg = f'跟踪库 v1d>{min_v1d} 可扫: {ready:,} 条'
        if seeded:
            msg += f' (已从 {os.path.basename(src or "主库")} 自动 seed)'
        log(msg)
    except Exception as e:
        log(f'  警告: 跟踪库 seed 检查失败 ({e})')

    log(f'Done: {datetime.now()}')

    conn.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='生成选品报告（全量MMDD 文件夹）')
    parser.add_argument('--no-dedup', action='store_true', help='禁用同标题变体去重')
    parser.add_argument('--output-dir', default='', help='自定义输出目录，默认 全量MMDD（当天）')
    parser.add_argument('--min-v1d', type=float, default=DEFAULT_MIN_V1D,
                        help=f'预估日增量下限，默认 {DEFAULT_MIN_V1D}')
    parser.add_argument('--min-actual', type=float, default=DEFAULT_MIN_ACTUAL,
                        help=f'实体真实增量下限（OR 入选），默认 {DEFAULT_MIN_ACTUAL}')
    parser.add_argument('--min-v1d-virtual', type=float, default=DEFAULT_MIN_V1D_VIRTUAL,
                        help=f'虚拟预估日增量下限，默认 {DEFAULT_MIN_V1D_VIRTUAL}')
    parser.add_argument('--min-actual-virtual', type=float, default=DEFAULT_MIN_ACTUAL_VIRTUAL,
                        help=f'虚拟真实增量下限（OR 入选），默认 {DEFAULT_MIN_ACTUAL_VIRTUAL}')
    parser.add_argument('--skip-velocity-recalc', action='store_true',
                        help='跳过 Step1 velocity 重算（仅用库内现有字段）')
    parser.add_argument('--legacy-actual-recalc', action='store_true',
                        help='启用旧版 Step0b 日环比 actual 回写（与 Phase1 口径冲突，不推荐）')
    parser.add_argument('--no-wait-idle', action='store_true',
                        help='跳过启动前主库错峰等待')
    parser.add_argument('--history-backfill', action='store_true',
                        help='启用 Step0a sold_history 补洞（维护任务，日报默认跳过）')
    parser.add_argument('--actual-scope', choices=('report', 'yesterday', 'full'), default='report',
                        help='--legacy-actual-recalc 时的回写范围')
    args = parser.parse_args()
    try:
        main(
            dedup=not args.no_dedup,
            output_dir=args.output_dir,
            min_v1d=args.min_v1d,
            min_actual=args.min_actual,
            min_v1d_virtual=args.min_v1d_virtual,
            min_actual_virtual=args.min_actual_virtual,
            skip_velocity_recalc=args.skip_velocity_recalc,
            legacy_actual_recalc=args.legacy_actual_recalc,
            skip_wait_idle=args.no_wait_idle,
            history_backfill=args.history_backfill,
            actual_scope=args.actual_scope,
        )
    except KeyboardInterrupt:
        print('\n[中断] 用户中断，退出')
        sys.exit(130)
    except Exception as e:
        import traceback
        print(f'\n[错误] {e}')
        traceback.print_exc()
        sys.exit(1)
