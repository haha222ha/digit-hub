# -*- coding: utf-8 -*-
"""Rewrite humor/funny style copy for all skins — real wit, not prefix spam.

Run:
  python tools/rewrite_style_copy.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB_SKINS = ROOT / "apps" / "web" / "skins"
PKG_SKINS = ROOT / "packages" / "skins"


def _o(texts: list[str]) -> list[dict]:
    return [{"t": t} for t in texts]


# ─── seven_sins: fully authored ─────────────────────────────────────────────
SEVEN_SINS = [
    # pride 0-3
    {
        "humor": {
            "q": "庆功宴灯光一打，你脑子里第一个小剧场是？",
            "o": _o(["镜头有没有扫到我", "成色够不够发朋友圈", "大家有没有累坏", "这招下次还能白嫖"]),
        },
        "funny": {
            "q": "团队赢了！你内心弹幕更像？",
            "o": _o(["快夸，我准备好了", "审美过关，收工", "和平第一，别撕", "沉淀成 SOP 摸鱼"]),
        },
    },
    {
        "humor": {
            "q": "当着一圈人被纠错，你启动的是哪套剧本？",
            "o": _o(["先守住我的判断", "听完再优雅反击", "光速道歉止损", "散场后再私聊对证据"]),
        },
        "funny": {
            "q": "当众被纠正——你的人设崩了几秒？",
            "o": _o(["我没错，是场子不对", "先听完，再精准回旋", "对不起对不起（先活下来）", "记下账，私下清算"]),
        },
    },
    {
        "humor": {
            "q": "「标准」这两个字，在你这儿更像？",
            "o": _o(["我的尺子通常更严", "看场子换尺子", "跟着大部队走就行", "尺子本身就讨厌"]),
        },
        "funny": {
            "q": "你和「标准」的关系，鉴定为？",
            "o": _o(["我就是标准本人", "看天气改标准", "随缘标准", "标准是自由的天敌"]),
        },
    },
    {
        "humor": {
            "q": "聊到自己的成绩时，你更常怎么演？",
            "o": _o(["希望贡献被点名致谢", "轻描淡写滑过去", "赶紧把锅甩给团队（褒义）", "能不提就不提"]),
        },
        "funny": {
            "q": "分享成就环节，你打开的是？",
            "o": _o(["请精确到我的名字", "省略号本人", "团队赢了（我隐身）", "话题杀手：换一个"]),
        },
    },
    # greed 4-7
    {
        "humor": {
            "q": "又冒出来一个「不错的机会」，你手指先动了哪一步？",
            "o": _o(["能捞就捞，怕错过", "先算账再举手", "够用就好谢谢", "本能先摇头再说"]),
        },
        "funny": {
            "q": "多一个机会突然拍你肩膀——你？",
            "o": _o(["全部拿走，谢谢老板", "打开计算器冷静三秒", "我饱了，真的", "拒绝键是肌肉记忆"]),
        },
    },
    {
        "humor": {
            "q": "存钱、囤券、囤资源，对你更像？",
            "o": _o(["安全感的被子", "备用轮胎", "偶尔的小癖好", "几乎不碰的技能点"]),
        },
        "funny": {
            "q": "囤货人格检测：你是？",
            "o": _o(["仓鼠成精", "备一份就安心", "随缘囤一点点", "空空如也哲学家"]),
        },
    },
    {
        "humor": {
            "q": "倒计时优惠弹窗出现，你戏份是？",
            "o": _o(["手比脑子快", "进购物车冷静比价", "很难被感动", "直接叉掉，谢谢"]),
        },
        "funny": {
            "q": "限时优惠！你的手指命运是？",
            "o": _o(["已下单（后悔待定）", "先收藏，比三家", "免疫体质", "关掉！幻觉退散"]),
        },
    },
    {
        "humor": {
            "q": "同时开很多线，你的体感更接近？",
            "o": _o(["越多越踏实", "只留少数几条命", "一条条清完再开", "多线常把我绕晕"]),
        },
        "funny": {
            "q": "多线程人生，你是哪种 CPU？",
            "o": _o(["开一百个标签才安心", "三四个标签封顶", "单核专注战士", "标签多到自己卡死"]),
        },
    },
    # lust 8-11
    {
        "humor": {
            "q": "「好吸引」这件事，进你决策时音量多大？",
            "o": _o(["很大，感觉先发言", "有声音，但我会按静音", "几乎听不见", "太怕被带着跑，会警惕"]),
        },
        "funny": {
            "q": "吸引力来敲门，你开门幅度？",
            "o": _o(["大门敞开：感觉至上", "门缝看看再决定", "猫眼瞅一眼就关", "装死，谁叫我都不开"]),
        },
    },
    {
        "humor": {
            "q": "你更想收藏哪一种体验？",
            "o": _o(["高浓度的当下火花", "稳稳的亲密感", "干净的独处清静", "慢热、细水长流的陪"]),
        },
        "funny": {
            "q": "点菜：你的情感套餐是？",
            "o": _o(["麻辣烫：要烫要烈", "家常菜：稳定好吃", "清粥小菜：独处回血", "文火炖：慢慢陪"]),
        },
    },
    {
        "humor": {
            "q": "刷到特别好看的人/内容，你？",
            "o": _o(["会陷进去很久", "欣赏两眼就撤", "完全无感", "会主动少碰刺激源"]),
        },
        "funny": {
            "q": "颜值/名场面袭来，你的浏览史是？",
            "o": _o(["已沦陷，循环播放", "点赞走人，很体面", "滑走，下一道菜", "设置：减少推荐"]),
        },
    },
    {
        "humor": {
            "q": "长期关系里，你更怕哪句结局预告？",
            "o": _o(["平淡到没有火花", "忽冷忽热不稳定", "自由被收走", "被安排、被控制"]),
        },
        "funny": {
            "q": "恋爱恐怖片：你的最大恐惧是？",
            "o": _o(["变成室友式恋爱", "过山车情绪", "日程表被征用", "遥控人生开启"]),
        },
    },
    # envy 12-15
    {
        "humor": {
            "q": "朋友突然升职/暴富，你嘴上与心里的温差？",
            "o": _o(["恭喜，同时暗中对齐进度条", "真开心，顺便偷师", "有触动，但不反复嚼", "几乎平波无浪"]),
        },
        "funny": {
            "q": "好友发财新闻弹出——你？",
            "o": _o(["恭喜！（打开对比表）", "恭喜！求攻略链接", "哦吼有点酸，喝口水过了", "关通知，我在修仙"]),
        },
    },
    {
        "humor": {
            "q": "刷到别人「完美日常」，你更像？",
            "o": _o(["焦虑自己进度条", "当电影素材看看", "划走，不入戏", "直接屏蔽该类片场"]),
        },
        "funny": {
            "q": "朋友圈滤镜生活杀到，你？",
            "o": _o(["为什么我还在搬砖", "拍戏呢？好看，滑", "下一条，不吃这套", "已屏蔽：人生广告"]),
        },
    },
    {
        "humor": {
            "q": "同龄人成就更高一截，你会？",
            "o": _o(["反复拿自己比对", "立刻拆成行动清单", "失落一下就翻篇", "很少进入比较局"]),
        },
        "funny": {
            "q": "同龄卷王刷新纪录，你的反应是？",
            "o": _o(["打开人生 PK 面板", "记笔记：抄作业启动", "酸一下，睡一觉好了", "我有自己的赛道谢谢"]),
        },
    },
    {
        "humor": {
            "q": "有人说「别人更厉害」，这句话在你这儿？",
            "o": _o(["刺一下，能记很久", "追问：到底差在哪", "笑笑就过", "风过无痕"]),
        },
        "funny": {
            "q": "听见「你不如某某」——你？",
            "o": _o(["扎心，收藏进黑历史", "细说，我做表格", "哈哈（心里翻白眼）", "啊？我说了吗"]),
        },
    },
    # gluttony 16-19
    {
        "humor": {
            "q": "压力一上来，你最容易打开哪扇「过量之门」？",
            "o": _o(["暴吃/狂刷/剁手", "给自己一个小奖励", "运动或睡觉复位", "找人把话说出来"]),
        },
        "funny": {
            "q": "压力来袭，你的应对 Buff 是？",
            "o": _o(["无限续杯：吃刷买", "小零食安慰剂", "睡一觉/跑一跑", "呼叫真人客服（朋友）"]),
        },
    },
    {
        "humor": {
            "q": "「再来一点」三个字，对你杀伤力如何？",
            "o": _o(["几乎喊不停", "看情况再加", "到点就收工", "会提前设停损线"]),
        },
        "funny": {
            "q": "再来一点？你的自制力血条？",
            "o": _o(["已空，继续加点", "看心情掉血", "时间到，强制下线", "提前设置：禁止加点"]),
        },
    },
    {
        "humor": {
            "q": "信息流把你带走很久时，你更像？",
            "o": _o(["知道空虚还在滑", "设个闹钟强制停", "很少真沉进去", "靠工具硬核限流"]),
        },
        "funny": {
            "q": "短视频黑洞计时中，你？",
            "o": _o(["明明没营养，还在滑", "闹钟一响立刻逃", "很少被吸进去", "屏幕时间锁：已启用"]),
        },
    },
    {
        "humor": {
            "q": "心里空了一块，你第一动作是？",
            "o": _o(["找东西把它填满", "允许空白待一会儿", "先做件小事落地", "睡觉，先躲过去"]),
        },
        "funny": {
            "q": "空虚值拉满，你按下的键是？",
            "o": _o(["填充！什么都行", "空白也是一种排面", "先把杯子洗了再说", "休眠模式启动"]),
        },
    },
    # wrath 20-23
    {
        "humor": {
            "q": "被插队/不公对待，怒气表指针先指向？",
            "o": _o(["想当场回击", "冷静搬出规则", "算了，不值这个票价", "事后走正式投诉"]),
        },
        "funny": {
            "q": "不公事件触发！你的技能是？",
            "o": _o(["怒气技：准备开麦", "翻出《规则手册》", "叹气：不跟傻子玩", "截图，走流程"]),
        },
    },
    {
        "humor": {
            "q": "争论升温时，你更常拿出？",
            "o": _o(["音量与气势", "论据与结构", "暂停键，先离场", "吞回去，先不说"]),
        },
        "funny": {
            "q": "吵架 BOSS 战，你的出装？",
            "o": _o(["音响拉满", "逻辑长矛", "走位撤退冷静", "装死不掉血"]),
        },
    },
    {
        "humor": {
            "q": "被误解的那一刻，你的优先级是？",
            "o": _o(["必须马上澄清", "找个好时机再说清", "随它去吧", "先写成草稿，稍后再发"]),
        },
        "funny": {
            "q": "误解降临，你打开的是？",
            "o": _o(["澄清火箭，立刻发射", "预约说明会", "无所谓宇宙", "备忘录写小作文"]),
        },
    },
    {
        "humor": {
            "q": "怒气退潮后，复盘会上你怎么说？",
            "o": _o(["常后悔语气太冲", "觉得怒得合理", "会道歉并复盘", "怒过就忘，很少记"]),
        },
        "funny": {
            "q": "怒完冷静，你的事后评价是？",
            "o": _o(["语气 Excess，下次轻点", "该怒，不后悔", "对不起 + 改进计划", "怒过？不记得了"]),
        },
    },
    # sloth 24-27
    {
        "humor": {
            "q": "重要但不紧急的事，在你日程表里的命运？",
            "o": _o(["拖到截止日前夜", "拆成小步慢慢挪", "当天就能启动", "常被我遗忘在角落"]),
        },
        "funny": {
            "q": "重要不紧急任务，你给它的标签是？",
            "o": _o(["截止日期恐惧驱动", "拆成婴儿步推进", "今日待办：已开工", "什么？还有这事？"]),
        },
    },
    {
        "humor": {
            "q": "理想周末，你更想把自己安放在？",
            "o": _o(["能躺就不立的水平面", "半休半安排的中间态", "主动做点事更爽", "行程塞满才安心"]),
        },
        "funny": {
            "q": "周末人设选择：你是？",
            "o": _o(["植物人躺平套餐", "半躺半出门套餐", "轻微社畜自我充电", "行程刺客，约满才爽"]),
        },
    },
    {
        "humor": {
            "q": "难事启动那一秒，摩擦力最大的是？",
            "o": _o(["启动成本高到夸张", "先做两分钟骗过自己", "列计划才有勇气开", "最好有人推我一把"]),
        },
        "funny": {
            "q": "开始一件难事的加载条？",
            "o": _o(["99%…卡住…", "两分钟计时器启动", "先写 Plan 再说", "求外力推一下"]),
        },
    },
    {
        "humor": {
            "q": "完美主义对你，更像哪种副作用？",
            "o": _o(["常导致迟迟不动手", "适度打磨刚刚好", "完成比完美重要", "几乎不影响我开工"]),
        },
        "funny": {
            "q": "完美主义检测报告：",
            "o": _o(["因为要完美所以还没开始", "修一修就交卷", "完成＞完美，出厂设置", "完美？不认识"]),
        },
    },
]


def humor_q(stem: str, dim: str = "", pole: str = "") -> str:
    """Observational / dry-wit question reframe."""
    s = stem.strip()
    s = re.sub(r"[？?]+$", "", s)
    s = re.sub(r"^说实话——", "", s)
    s = re.sub(r"——你会怎么选$", "", s)
    s = re.sub(r"^【专属】", "", s)

    h = sum(ord(c) for c in s) % 5

    if s.endswith("你会"):
        core = s[: -len("你会")].rstrip("，, ")
        core = re.sub(r"时$", "", core)
        variants = [
            f"{core}时，你的默认操作是？",
            f"{core}来袭——你真实反应更像？",
            f"别演：{core}时你会怎么做？",
        ]
        return variants[h % 3]

    if s.endswith("你"):
        core = s[:-1].rstrip("，, ")
        return f"{core}时，你更像哪一种？"

    if "第一反应" in s:
        variants = [
            f"{s}——别美化，按出厂设置选。",
            f"系统提示：{s}（请选择未打码版本）",
            f"来，复盘那一秒：{s}",
        ]
        return variants[h % 3]

    if "更常怎么" in s or "更常" in s:
        variants = [
            f"诚实账单：{s}？",
            f"去掉「应该」之后：{s}？",
            f"你真实复盘里：{s}？",
        ]
        return variants[h % 3]

    if any(k in s for k in ("你更", "更像", "更倾向", "更习惯", "更看重", "更在意", "更舒服", "更可能", "更需要")):
        variants = [
            f"说人话版——{s}？",
            f"别选人设，选习惯：{s}？",
            f"如果没人围观：{s}？",
            f"第一直觉版：{s}？",
        ]
        return variants[h % 4]

    if "意味着" in s:
        return f"给它起个外号的话：{s}？"

    if s.startswith("遇到") or s.startswith("面对"):
        variants = [
            f"生活加载中——{s}？",
            f"这一幕开始播放：{s}？",
            f"现实突然发问：{s}？",
        ]
        return variants[h % 3]

    variants = [
        f"轻松一点问：{s}？",
        f"不装的版本：{s}？",
        f"你会心一笑的答案是——{s}？",
    ]
    return variants[h % 3]


def funny_q(stem: str, dim: str = "", pole: str = "") -> str:
    """Meme / barrage-style question — punchy, not prefix spam."""
    s = stem.strip()
    s = re.sub(r"[？?]+$", "", s)
    s = re.sub(r"^说实话——", "", s)
    s = re.sub(r"——你会怎么选$", "", s)

    openers = {
        "pride": "高光时刻检测",
        "greed": "仓鼠本能检测",
        "lust": "吸引力雷达检测",
        "envy": "酸值检测",
        "gluttony": "停不下来检测",
        "wrath": "怒气技检测",
        "sloth": "启动困难检测",
        "EI": "社交电量检测",
        "SN": "脑回路检测",
        "TF": "心脑大战检测",
        "JP": "计划狂/随缘派检测",
        "mature": "成熟度暴击检测",
        "emotion": "情绪稳定器检测",
        "think": "脑子好使检测",
        "social": "社交副本检测",
        "life": "生活态度检测",
    }
    tag = openers.get(dim, "灵魂拷问")
    if "第一反应" in s:
        return f"【{tag}】{s}？别演，选真的。"
    if len(s) <= 16:
        return f"【{tag}】{s}？三秒作答。"
    return f"【{tag}】{s}？"


# option phrase banks by relative strength index within a question
HUMOR_OPT_FLAVOR = [
    # index 0 often strongest trait / most extreme
    ["——而且还挺理直气壮", "，承认了也好受", "（很真实）", "，我熟悉这出"],
    ["——看情况版本", "，留一点余地", "（中间派）", "，弹性处理"],
    ["——偏低配也行", "，能过就好", "（克制款）", "，少折腾"],
    ["——基本绝缘", "，谢谢不需要", "（冷静派）", "，很少入戏"],
]

FUNNY_OPT_FLAVOR = [
    ["（本色出演）", "｜直接拿下", "｜已读不回良心", "｜主打一个真"],
    ["（看天气）", "｜中等火候", "｜可进可退", "｜弹性生存"],
    ["（克制版）", "｜浅尝辄止", "｜低调选手", "｜少即是多"],
    ["（绝缘体）", "｜勿cue", "｜系统拒绝", "｜我选择摆烂…不对，清醒"],
]


def _pick_flavor(flavors: list[list[str]], idx: int, n: int, text: str) -> str:
    bucket = min(idx, len(flavors) - 1)
    # diversify by hash of text
    h = sum(ord(c) for c in text) % len(flavors[bucket])
    return flavors[bucket][h]


HUMOR_SCALE_4 = ["——还挺赤裸", "——过渡态本人", "——靠谱版", "——通透局"]
FUNNY_SCALE_4 = ["｜小孩局", "｜还在练级", "｜成年人了", "｜大宗师"]


def humor_opt(t: str, idx: int, n: int) -> str:
    t = t.strip()
    if any(x in t for x in ("小剧场", "镜头", "弹幕", "人设", "加载")):
        return t
    replacements = [
        (r"^别人有没有看见", "镜头有没有扫到"),
        (r"^希望被准确看见", "希望被精准点名"),
        (r"^能拿尽拿", "能捞就捞"),
        (r"^容易冲动", "手比脑快"),
        (r"^表面恭喜", "嘴上恭喜"),
        (r"^焦虑自己落后", "进度条焦虑发作"),
        (r"^暴吃/狂刷", "吃刷买三连"),
        (r"^很难停", "刹车失灵"),
        (r"^怒意上涌", "怒气槽涨满"),
        (r"^提高音量", "音量键拉满"),
        (r"^必须立刻澄清", "澄清火箭发射"),
        (r"^一拖到截止前", "截止日前夜战士"),
        (r"^能躺就不立", "水平放置优先"),
        (r"^启动成本很高", "启动费贵到离谱"),
        (r"^约朋友见面聊到尽兴", "约人回血，聊到天亮也行"),
        (r"^一个人待着才真正回血", "独处才是真正的充电器"),
        (r"^主动搭话打破僵局", "我先开口破冰"),
        (r"^等人来找我更自在", "等人来捞我更香"),
        (r"^行程表排好再出发", "先把行程表焊死再出门"),
        (r"^走到哪算哪更刺激", "地图随机，刺激拉满"),
    ]
    out = t
    for pat, rep in replacements:
        if re.search(pat, out):
            out = re.sub(pat, rep, out, count=1)
            return out

    if n == 4 and idx < 4 and "（" not in t and "——" not in t:
        return t + HUMOR_SCALE_4[idx]
    if out == t and len(t) <= 18 and "（" not in t and "——" not in t:
        return t + _pick_flavor(HUMOR_OPT_FLAVOR, idx, n, t)
    return out


def funny_opt(t: str, idx: int, n: int) -> str:
    t = t.strip()
    t = re.sub(r"（就这样）$", "", t)
    replacements = [
        (r"^别人有没有看见我的贡献$", "快夸我，准备好了"),
        (r"^结果本身是否漂亮$", "成色过关就行"),
        (r"^大家是否都舒服$", "和平第一"),
        (r"^流程能否复用$", "沉淀成模板"),
        (r"^约朋友见面聊到尽兴$", "约人！社交回血包"),
        (r"^一个人待着才真正回血$", "请勿打扰：充电中"),
        (r"^主动搭话打破僵局$", "我先开口，破冰侠"),
        (r"^等人来找我更自在$", "等捞，被动社交战士"),
        (r"^行程表排好再出发$", "Excel 行程已就绪"),
        (r"^走到哪算哪更刺激$", "随缘导航，刺激拉满"),
        (r"^提前完成才安心$", "提前交卷强迫症"),
        (r"^压力来了爆发力更强$", "deadline 战神附体"),
    ]
    for pat, rep in replacements:
        if re.fullmatch(pat, t):
            return rep

    if n == 4 and idx < 4:
        return f"{t}{FUNNY_SCALE_4[idx]}"
    if len(t) <= 14:
        return f"{t}{_pick_flavor(FUNNY_OPT_FLAVOR, idx, n, t)}"
    if len(t) <= 22:
        prefixes = ["主打：", "真相：", "人设：", "结局："]
        p = prefixes[sum(ord(c) for c in t) % len(prefixes)]
        return f"{p}{t}"
    leads = ["直说——", "坦白局——", "别装——", "现实是——"]
    lead = leads[sum(ord(c) for c in t) % len(leads)]
    return f"{lead}{t}"


def style_block(q: dict, humor: dict, funny: dict) -> dict:
    return {
        "rigorous": {
            "q": q["q"],
            "o": [{"t": o["t"]} for o in q["o"]],
        },
        "humor": humor,
        "funny": funny,
    }


def rewrite_question(q: dict, authored: dict | None = None) -> dict:
    n = len(q.get("o") or [])
    dim = q.get("d") or ""
    pole = q.get("pole") or ""
    if authored:
        humor = authored["humor"]
        funny = authored["funny"]
    else:
        humor = {
            "q": humor_q(q["q"], dim, pole),
            "o": [{"t": humor_opt(o["t"], i, n)} for i, o in enumerate(q["o"])],
        }
        funny = {
            "q": funny_q(q["q"], dim, pole),
            "o": [{"t": funny_opt(o["t"], i, n)} for i, o in enumerate(q["o"])],
        }
    q = dict(q)
    q["styles"] = style_block(q, humor, funny)
    return q


def rewrite_skin(path: Path, authored_list: list | None = None) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    qs = []
    for i, q in enumerate(data["questions"]):
        authored = authored_list[i] if authored_list and i < len(authored_list) else None
        qs.append(rewrite_question(q, authored))
    data["questions"] = qs

    # style intros / youGet flavor for picker pages
    if data.get("id") == "seven_sins":
        data["introByStyle"] = {
            "rigorous": data["intro"],
            "humor": "28 道欲望小剧场：不是审判，是把你的七种冲动请上舞台对戏。答完你会会心一笑，也可能被自己逗到。",
            "funny": "28 题欲望鉴定大会。选最像你的弹幕，别演正人君子——系统看得懂演技。",
        }
    elif data.get("id") == "mbti16":
        data["introByStyle"] = {
            "rigorous": data["intro"],
            "humor": "72 道情境选择题：把你的能量、脑回路、心脑会议与计划癖好，用说人话的方式摊开。非官方，但挺准着玩。",
            "funny": "72 题人格副本通关。每题三秒，选最像你的那个——装深沉会被选项笑死。非 MBTI® 官方。",
        }
    elif data.get("id") == "mental_age":
        data["introByStyle"] = {
            "rigorous": data["intro"],
            "humor": "像在跟自己唠家常：成熟度、情绪、脑子、社交与生活态度，一层层揭开你实际运转的「心理年龄」。",
            "funny": "心理年龄鉴定现场。答完可能被自己整无语——放松，这是娱乐向体检。",
        }

    if "roleQuestions" in data:
        rq = {}
        for role, items in data["roleQuestions"].items():
            rq[role] = [rewrite_question(q) for q in items]
        data["roleQuestions"] = rq

    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    path.write_text(text, encoding="utf-8")
    pkg = PKG_SKINS / path.name
    if pkg.parent.exists():
        pkg.write_text(text, encoding="utf-8")
    print("rewrote", path.name, "q=", len(qs))


def main() -> None:
    assert len(SEVEN_SINS) == 28, len(SEVEN_SINS)
    rewrite_skin(WEB_SKINS / "seven_sins.json", SEVEN_SINS)
    rewrite_skin(WEB_SKINS / "mbti16.json")
    rewrite_skin(WEB_SKINS / "mental_age.json")
    # samples
    s = json.loads((WEB_SKINS / "seven_sins.json").read_text(encoding="utf-8"))
    print("sample humor:", s["questions"][0]["styles"]["humor"]["q"])
    print("sample funny:", s["questions"][0]["styles"]["funny"]["q"])
    m = json.loads((WEB_SKINS / "mbti16.json").read_text(encoding="utf-8"))
    print("mbti humor:", m["questions"][0]["styles"]["humor"]["q"])
    print("mbti funny opts:", [o["t"] for o in m["questions"][0]["styles"]["funny"]["o"]])


if __name__ == "__main__":
    main()
