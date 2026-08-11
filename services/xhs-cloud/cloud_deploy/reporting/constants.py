# -*- coding: utf-8 -*-
"""选品报告列常量（与 sync_service / 桌面 gen_report 对齐；末尾可扩展）。"""

REPORT_COLUMNS = [
    "goods_id", "title", "price", "sold", "v1h", "v6h", "actual_v1d", "v1d",
    "actual_gr", "gr", "actual_vsr", "vsr", "acc", "burst",
    "pool", "first_seen", "store_id", "store_name", "shelf_time",
    "shop_sales", "shop_fans", "shop_fsr", "goods_fsr",
    "behavior", "is_virtual", "base_hours", "base_at", "anomaly",
    "category_tag",
]

COL = {name: i for i, name in enumerate(REPORT_COLUMNS)}

DEFAULT_MIN_V1D = 5
DEFAULT_MIN_ACTUAL = 5
DEFAULT_MIN_V1D_VIRTUAL = 1
DEFAULT_MIN_ACTUAL_VIRTUAL = 1

REPORT_DISCLAIMER = {
    "title": "免责声明与使用须知",
    "version": "2026-06",
    "lines": [
        "本报告为基于公开页面信息与系统计算的选品数据分析参考，不构成投资建议、经营建议、收益承诺或平台官方意见。",
        "报告中的「真实增量」为自上次有效扫描快照起的销量差值；「预估日增量」为按扫描间隔折算的日均估值；二者均可能存在延迟、误差或缺失，请以平台页面实时信息为准并自行核实。",
        "用户应独立判断商品合规性、知识产权、价格、库存及平台规则，因使用本报告所作决策产生的风险与责任由用户自行承担。",
        "本报告不意味着与小红书等任何平台存在授权、合作或背书关系；禁止将本报告用于侵权抄款、虚假宣传、刷量或其他违法违规用途。",
        "未经权利人书面许可，不得将本报告数据批量转售、公开传播或用于训练对外商业模型。",
        "继续使用本报告即视为您已阅读并理解上述条款。",
    ],
}

FIELD_GUIDE = [
    {"field": "商品ID", "key": "goods_id", "formula": "—", "desc": "平台唯一标识，用于搜索、导出与溯源。", "reference": "复制ID到小红书搜索验证商品是否仍在售。"},
    {"field": "商品名称", "key": "title", "formula": "—", "desc": "抓取时的标题快照，同标题多规格已去重保留最高真实增量。", "reference": "含「定制/专属/活动」等词需警惕短期活动品；优先常青需求词。"},
    {"field": "价格", "key": "price", "formula": "deal_price", "desc": "当前成交价（券后/活动价）。", "reference": "虚拟品 9.9~59 走量；实体 30~150 利润带；超 200 需更高实际增量支撑。"},
    {"field": "销量", "key": "sold", "formula": "sold_num 快照", "desc": "平台累计已售，可能因活动结束、展示规则或退款回调。", "reference": "<100 新品窗口；100~1k 验证期；>1k 红海，靠实际增量/增速突围。"},
    {"field": "真实增量", "key": "actual_v1d", "formula": "sold_history.delta", "desc": "相对上次扫描的真实销量差（PG delta 字段），不外推、不用算法重算。选品第一优先级。", "reference": "≥5 值得看；≥20 强动销；≥50 爆款候选。默认按此列降序。"},
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
        "reference": "≤0.02 强低粉高销；0.02~0.1 值得关注；>0.3 粉丝杠杆低。",
    },
    {"field": "行为数据", "key": "behavior", "formula": "—", "desc": "如「自动发货」等标签，辅助判断虚拟/实体。", "reference": "含自动发货→高概率虚拟品，交付成本低。"},
    {"field": "首次发现", "key": "first_seen", "formula": "—", "desc": "系统首次入库时间。", "reference": "<24h 为 NEW；无真实增量时重点看标题需求与 pool。"},
    {"field": "数据异常", "key": "anomaly", "formula": "销量/增量超合理上限", "desc": "脏数据已在报告生成时排除；标黄为轻度异常。", "reference": "sold>20万或增量>5万或增量>销量35% 不入报告。"},
]

SELECTION_GUIDE = {
    "title": "统一选品标准参考",
    "principle": "本报告采用「真实动销优先、预估动销辅助」：决策以「真实增量 + 真实日增速 + 真实增销比」为核心；「预估」系列仅作加速参考，不可单信。",
    "workflow": [
        {"step": "1", "name": "定赛道", "text": "切换「虚拟/实体」Tab。虚拟=无需物流；实体=需发货。两赛道分开排序，不混比。"},
        {"step": "2", "name": "缩范围", "text": "点击 BURST + ACCEL 分层按钮，或搜索关键词/店铺。排除标黄异常行（除非 actual 仍优秀）。"},
        {"step": "3", "name": "验动销", "text": "表格按「真实增量」降序。核心门槛：真实增量≥5 且 pool 为 ACCEL/BURST；同时看真实日增速>10%、真实增销比>5%。"},
        {"step": "4", "name": "看趋势", "text": "预估增销比>50% 且真实增量也在涨=加速确认；pool 为 ACCEL/BURST 优先。"},
        {"step": "5", "name": "做决策", "text": "S 级直接跟进；A 级加入清单 24h 复验；B 级仅观察；C 级跳过。导出 CSV 留档，次日对比 actual 是否持续。"},
    ],
    "priority_fields": [
        "第一看：真实增量（卖了多少）",
        "第二看：真实日增速（涨得多快）",
        "第三看：真实增销比（动销占总量比例）",
        "第四看：商品粉销比 → 店铺粉销比（低粉高销）",
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
    "red_flags": [
        "标黄行：预估日增量>销量 或 预估增销比>100% — 以真实增量为准",
        "预估很高但真实增量<3 — 典型「看起来火、其实没卖多少」",
        "销量>1万 且真实增销比<1% — 红海存量品，增长空间有限",
    ],
    "daily_routine": "每日建议：① 看 BURST/ACCEL 数量与平均 actual 增量 → ② 按真实增量排序浏览 Top50 → ③ 导出 CSV 标记 S/A → ④ 次日对比 actual 是否持续。",
}

ARCHIVE_DAILY = "member_daily_zip"
ARCHIVE_WEEKLY = "member_weekly_zip"
ARCHIVE_MONTHLY = "member_monthly_zip"
ARCHIVE_CUSTOM = "member_custom_zip"


def item_at(item, key: str, default=None):
    if isinstance(item, dict):
        val = item.get(key, default)
        return default if val is None else val
    idx = COL.get(key)
    if idx is None or not isinstance(item, (list, tuple)) or idx >= len(item):
        return default
    val = item[idx]
    return default if val is None else val


def row_delta(row: dict, default: float = 0.0) -> float:
    """行 dict 主指标：sold_history / premium_goods_daily 的 delta。"""
    for key in ("delta", "pgd_delta"):
        v = row.get(key)
        if v is not None and v != "":
            try:
                n = float(v)
                if n > 0:
                    return n
            except (TypeError, ValueError):
                pass
    return default


def item_delta(item: list, default: float = 0.0) -> float:
    """28 列 item 主指标（actual_v1d 列存 delta 值，兼容 data.js 列名）。"""
    try:
        return float(item_at(item, "actual_v1d", default) or default)
    except (TypeError, ValueError):
        return default
