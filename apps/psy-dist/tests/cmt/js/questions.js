// 45道测试题目
const QUESTIONS = [
    // 题目1-5
    {
        id: 1,
        dimension: "A",
        dimensionName: "生活节奏",
        text: "你理想中的工作日早晨是怎样的？",
        options: [
            { value: "A", label: "闹钟一响就起床，快速洗漱出门，在路上解决早餐", cities: ["BEIJING", "SHANGHAI", "SHENZHEN", "WUHAN"] },
            { value: "B", label: "留出足够时间，从容准备，在家吃完早餐再出门", cities: ["HANGZHOU", "NANJING", "QINGDAO", "NINGBO", "WUXI"] },
            { value: "C", label: "能睡到自然醒最好，不喜欢被时间追着跑", cities: ["CHENGDU", "DALI", "KUNMING", "LIJIANG", "XISHUANGBANNA"] },
            { value: "D", label: "早起去公园遛弯或锻炼，享受清晨的宁静", cities: ["GUANGZHOU", "SUZHOU", "XIAMEN", "ZHUHAI", "SANYA"] }
        ]
    },
    {
        id: 2,
        dimension: "B",
        dimensionName: "气候偏好",
        text: "以下哪种气候最让你感到舒适？",
        options: [
            { value: "A", label: "四季分明，能体验春夏秋冬的变化", cities: ["BEIJING", "XIAN", "NANJING", "HARBIN", "JINAN", "TIANJIN"] },
            { value: "B", label: "温暖湿润，冬天不太冷，夏天有雨季", cities: ["GUANGZHOU", "SHENZHEN", "XIAMEN", "ZHUHAI", "SANYA", "XISHUANGBANNA"] },
            { value: "C", label: "四季如春，气候温和稳定", cities: ["KUNMING", "DALI", "GUIYANG", "LIJIANG"] },
            { value: "D", label: "夏季炎热冬季湿冷都能接受，习惯就好", cities: ["SHANGHAI", "HANGZHOU", "CHONGQING", "WUHAN", "NINGBO"] }
        ]
    },
    {
        id: 3,
        dimension: "C",
        dimensionName: "城市氛围",
        text: "周末你更想去哪里？",
        options: [
            { value: "A", label: "参观博物馆、历史遗迹，感受文化底蕴", cities: ["BEIJING", "XIAN", "NANJING", "LHASA", "JINAN"] },
            { value: "B", label: "逛时尚商场、看艺术展，感受现代潮流", cities: ["SHANGHAI", "SHENZHEN", "HANGZHOU", "DALIAN"] },
            { value: "C", label: "找一家有格调的咖啡店，看书发呆", cities: ["SUZHOU", "DALI", "XIAMEN", "LIJIANG", "ZHUHAI"] },
            { value: "D", label: "去热闹的夜市、美食街，感受烟火气", cities: ["CHENGDU", "CHONGQING", "CHANGSHA", "GUANGZHOU", "WUHAN", "TIANJIN"] }
        ]
    },
    {
        id: 4,
        dimension: "D",
        dimensionName: "美食倾向",
        text: "如果只能选择一种口味，你会选？",
        options: [
            { value: "A", label: "麻辣鲜香，无辣不欢", cities: ["CHENGDU", "CHONGQING", "CHANGSHA", "GUIYANG", "WUHAN"] },
            { value: "B", label: "清淡养生，注重食材本味", cities: ["GUANGZHOU", "HANGZHOU", "SUZHOU", "WUXI", "NINGBO"] },
            { value: "C", label: "咸鲜可口，喜欢海鲜和浓汤", cities: ["QINGDAO", "XIAMEN", "GUANGZHOU", "DALIAN", "SANYA", "NINGBO"] },
            { value: "D", label: "口味多元，什么都想尝试", cities: ["BEIJING", "SHANGHAI", "XIAN", "TIANJIN", "HARBIN", "JINAN"] }
        ]
    },
    {
        id: 5,
        dimension: "E",
        dimensionName: "社交风格",
        text: "在社交场合中，你通常是？",
        options: [
            { value: "A", label: "自来熟，喜欢主动认识新朋友", cities: ["CHONGQING", "CHANGSHA", "CHENGDU", "TIANJIN", "HARBIN", "WUHAN"] },
            { value: "B", label: "需要一段时间热身，但熟悉后很健谈", cities: ["HANGZHOU", "NANJING", "SUZHOU", "WUXI", "NINGBO"] },
            { value: "C", label: "更喜欢小圈子深度交流", cities: ["GUANGZHOU", "SHENZHEN", "XIAMEN", "ZHUHAI"] },
            { value: "D", label: "社恐，能不社交就不社交", cities: ["BEIJING", "SHANGHAI", "DALI", "LIJIANG", "LHASA"] }
        ]
    },
    // 题目6-10
    {
        id: 6,
        dimension: "F",
        dimensionName: "职业追求",
        text: "以下哪种工作状态最吸引你？",
        options: [
            { value: "A", label: "在大厂或体制内，稳定有保障", cities: ["BEIJING", "XIAN", "NANJING", "JINAN", "TIANJIN"] },
            { value: "B", label: "创业或在创业公司，充满挑战和机遇", cities: ["SHENZHEN", "HANGZHOU", "WUHAN", "NINGBO"] },
            { value: "C", label: "自由职业或远程工作，时间灵活", cities: ["DALI", "XIAMEN", "KUNMING", "LIJIANG", "SANYA", "XISHUANGBANNA", "LHASA"] },
            { value: "D", label: "从事文创、艺术类工作，追求热爱", cities: ["CHENGDU", "CHANGSHA", "SUZHOU", "GUIYANG"] }
        ]
    },
    {
        id: 7,
        dimension: "G",
        dimensionName: "自然环境",
        text: "如果可以选择窗外的风景，你希望是？",
        options: [
            { value: "A", label: "巍峨的山脉，雄伟壮观", cities: ["CHONGQING", "XIAN", "KUNMING", "GUIYANG", "LHASA", "LIJIANG"] },
            { value: "B", label: "蔚蓝的大海，一望无际", cities: ["QINGDAO", "XIAMEN", "SHENZHEN", "DALIAN", "SANYA", "ZHUHAI"] },
            { value: "C", label: "宁静的湖泊，波光粼粼", cities: ["HANGZHOU", "SUZHOU", "NANJING", "WUXI", "JINAN"] },
            { value: "D", label: "繁华的城市夜景，灯火通明", cities: ["BEIJING", "SHANGHAI", "GUANGZHOU", "WUHAN", "TIANJIN"] }
        ]
    },
    {
        id: 8,
        dimension: "H",
        dimensionName: "生活方式",
        text: "对于消费，你的态度是？",
        options: [
            { value: "A", label: "该花就花，品质生活很重要", cities: ["SHANGHAI", "HANGZHOU", "SHENZHEN", "SANYA"] },
            { value: "B", label: "理性消费，追求性价比", cities: ["GUANGZHOU", "CHENGDU", "CHANGSHA", "WUHAN", "TIANJIN", "JINAN"] },
            { value: "C", label: "能省则省，攒钱更有安全感", cities: ["XIAN", "KUNMING", "NANJING", "HARBIN", "GUIYANG"] },
            { value: "D", label: "花钱买体验比买东西更值得", cities: ["DALI", "XIAMEN", "SUZHOU", "LIJIANG", "ZHUHAI"] }
        ]
    },
    {
        id: 9,
        dimension: "A",
        dimensionName: "生活节奏",
        text: "你对\"996工作制\"的看法是？",
        options: [
            { value: "A", label: "能接受，拼搏阶段就该全力以赴", cities: ["BEIJING", "SHANGHAI", "SHENZHEN", "WUHAN"] },
            { value: "B", label: "偶尔加班可以，但不能成为常态", cities: ["HANGZHOU", "GUANGZHOU", "NANJING", "NINGBO", "WUXI"] },
            { value: "C", label: "完全无法接受，工作不是生活的全部", cities: ["CHENGDU", "DALI", "KUNMING", "LIJIANG", "LHASA", "XISHUANGBANNA"] },
            { value: "D", label: "更看重工作效率，而不是工作时长", cities: ["SUZHOU", "XIAMEN", "QINGDAO", "ZHUHAI", "DALIAN", "GUIYANG"] }
        ]
    },
    {
        id: 10,
        dimension: "B",
        dimensionName: "气候偏好",
        text: "以下哪种天气情况最让你困扰？",
        options: [
            { value: "A", label: "干燥的北方冬天，皮肤容易裂", cities: ["GUANGZHOU", "SHENZHEN", "KUNMING", "SANYA", "XISHUANGBANNA"] },
            { value: "B", label: "潮湿的南方梅雨季，衣服晒不干", cities: ["BEIJING", "XIAN", "QINGDAO", "HARBIN", "DALIAN"] },
            { value: "C", label: "炎热的夏天，出门就一身汗", cities: ["KUNMING", "QINGDAO", "DALI", "GUIYANG", "HARBIN", "DALIAN"] },
            { value: "D", label: "雾霾天，看不见蓝天", cities: ["XIAMEN", "HANGZHOU", "SUZHOU", "ZHUHAI", "WUXI"] }
        ]
    },
    // 题目11-15
    {
        id: 11,
        dimension: "C",
        dimensionName: "城市氛围",
        text: "你觉得一座城市最重要的气质是？",
        options: [
            { value: "A", label: "历史底蕴，有故事可讲", cities: ["BEIJING", "XIAN", "NANJING", "LHASA", "JINAN"] },
            { value: "B", label: "现代活力，充满机遇", cities: ["SHENZHEN", "SHANGHAI", "HANGZHOU", "WUHAN", "NINGBO"] },
            { value: "C", label: "人文关怀，温暖包容", cities: ["CHENGDU", "GUANGZHOU", "SUZHOU", "TIANJIN", "WUXI"] },
            { value: "D", label: "独特个性，与众不同", cities: ["CHONGQING", "DALI", "CHANGSHA", "LIJIANG", "HARBIN", "GUIYANG"] }
        ]
    },
    {
        id: 12,
        dimension: "D",
        dimensionName: "美食倾向",
        text: "一日三餐，你的理想状态是？",
        options: [
            { value: "A", label: "每顿都要吃好吃饱，不能将就", cities: ["CHENGDU", "GUANGZHOU", "CHONGQING", "WUHAN", "CHANGSHA"] },
            { value: "B", label: "简单方便就好，不想在吃上花太多时间", cities: ["SHANGHAI", "SHENZHEN", "BEIJING", "NINGBO"] },
            { value: "C", label: "偶尔下厨，享受烹饪的乐趣", cities: ["SUZHOU", "HANGZHOU", "NANJING", "WUXI"] },
            { value: "D", label: "喜欢探索新餐厅，打卡各种美食", cities: ["CHANGSHA", "XIAMEN", "QINGDAO", "TIANJIN", "DALIAN", "HARBIN"] }
        ]
    },
    {
        id: 13,
        dimension: "E",
        dimensionName: "社交风格",
        text: "你交朋友更看重什么？",
        options: [
            { value: "A", label: "三观一致，能深聊", cities: ["BEIJING", "NANJING", "HANGZHOU", "WUHAN"] },
            { value: "B", label: "性格互补，相处舒服", cities: ["SUZHOU", "KUNMING", "XIAMEN", "ZHUHAI", "WUXI"] },
            { value: "C", label: "人脉资源，互相帮助", cities: ["SHANGHAI", "SHENZHEN", "GUANGZHOU", "NINGBO"] },
            { value: "D", label: "有趣有料，一起玩得开心", cities: ["CHENGDU", "CHONGQING", "CHANGSHA", "TIANJIN", "HARBIN"] }
        ]
    },
    {
        id: 14,
        dimension: "F",
        dimensionName: "职业追求",
        text: "选择工作城市，你最看重什么？",
        options: [
            { value: "A", label: "行业资源丰富，发展空间大", cities: ["BEIJING", "SHANGHAI", "SHENZHEN", "GUANGZHOU"] },
            { value: "B", label: "生活成本合理，性价比高", cities: ["CHENGDU", "CHANGSHA", "XIAN", "WUHAN", "TIANJIN", "JINAN"] },
            { value: "C", label: "环境宜居，生活质量高", cities: ["HANGZHOU", "QINGDAO", "XIAMEN", "ZHUHAI", "DALIAN", "NINGBO"] },
            { value: "D", label: "氛围轻松，工作压力小", cities: ["KUNMING", "DALI", "SUZHOU", "LIJIANG", "GUIYANG", "SANYA"] }
        ]
    },
    {
        id: 15,
        dimension: "G",
        dimensionName: "自然环境",
        text: "理想的周末户外活动是？",
        options: [
            { value: "A", label: "爬山徒步，亲近自然", cities: ["CHONGQING", "XIAN", "KUNMING", "GUIYANG", "LHASA", "LIJIANG"] },
            { value: "B", label: "海边漫步，吹吹海风", cities: ["QINGDAO", "XIAMEN", "SHENZHEN", "SANYA", "DALIAN", "ZHUHAI"] },
            { value: "C", label: "泛舟湖上，享受宁静", cities: ["HANGZHOU", "SUZHOU", "NANJING", "WUXI", "JINAN"] },
            { value: "D", label: "在城市公园散步，绿化好就行", cities: ["BEIJING", "SHANGHAI", "GUANGZHOU", "CHENGDU", "WUHAN", "TIANJIN"] }
        ]
    },
    // 题目16-20
    {
        id: 16,
        dimension: "H",
        dimensionName: "生活方式",
        text: "你对夜生活的态度是？",
        options: [
            { value: "A", label: "热爱夜生活，酒吧、夜店、KTV都喜欢", cities: ["SHANGHAI", "BEIJING", "SHENZHEN", "SANYA"] },
            { value: "B", label: "偶尔参与，朋友约了就去", cities: ["HANGZHOU", "NANJING", "GUANGZHOU", "WUHAN", "NINGBO"] },
            { value: "C", label: "更喜欢安静的夜晚，在家看剧或阅读", cities: ["SUZHOU", "KUNMING", "DALI", "LIJIANG", "LHASA", "ZHUHAI"] },
            { value: "D", label: "喜欢逛夜市、吃宵夜，感受城市的烟火气", cities: ["CHENGDU", "CHONGQING", "CHANGSHA", "TIANJIN", "HARBIN", "XIAN"] }
        ]
    },
    {
        id: 17,
        dimension: "A",
        dimensionName: "生活节奏",
        text: "你更能接受哪种通勤方式？",
        options: [
            { value: "A", label: "地铁拥挤但快速，习惯了就好", cities: ["BEIJING", "SHANGHAI", "GUANGZHOU", "SHENZHEN", "WUHAN"] },
            { value: "B", label: "公交虽慢但有座位，可以休息", cities: ["CHENGDU", "XIAN", "CHANGSHA", "TIANJIN", "JINAN", "HARBIN"] },
            { value: "C", label: "骑车或步行，短距离最舒服", cities: ["SUZHOU", "XIAMEN", "DALI", "LIJIANG", "ZHUHAI", "XISHUANGBANNA"] },
            { value: "D", label: "自己开车，掌控感强", cities: ["HANGZHOU", "NANJING", "QINGDAO", "NINGBO", "WUXI", "DALIAN"] }
        ]
    },
    {
        id: 18,
        dimension: "B",
        dimensionName: "气候偏好",
        text: "关于下雪，你的态度是？",
        options: [
            { value: "A", label: "超级期待，冬天就该有雪", cities: ["BEIJING", "XIAN", "NANJING", "HARBIN", "JINAN", "DALIAN"] },
            { value: "B", label: "偶尔看看可以，但不想天天生活在雪里", cities: ["SHANGHAI", "HANGZHOU", "QINGDAO", "WUHAN", "TIANJIN"] },
            { value: "C", label: "无所谓，有没有都行", cities: ["CHENGDU", "CHONGQING", "CHANGSHA", "GUIYANG"] },
            { value: "D", label: "不喜欢，太冷了而且出行不便", cities: ["GUANGZHOU", "SHENZHEN", "KUNMING", "XIAMEN", "SANYA", "ZHUHAI", "XISHUANGBANNA"] }
        ]
    },
    {
        id: 19,
        dimension: "C",
        dimensionName: "城市氛围",
        text: "以下哪种城市标签最吸引你？",
        options: [
            { value: "A", label: "\"帝都\" —— 权力与文化的中心", cities: ["BEIJING", "XIAN"] },
            { value: "B", label: "\"魔都\" —— 繁华与时尚的代名词", cities: ["SHANGHAI", "SHENZHEN"] },
            { value: "C", label: "\"天府之国\" —— 安逸与美食的天堂", cities: ["CHENGDU", "CHONGQING", "CHANGSHA", "GUIYANG"] },
            { value: "D", label: "\"人间天堂\" —— 诗意与宜居的结合", cities: ["HANGZHOU", "SUZHOU", "DALI", "LIJIANG"] }
        ]
    },
    {
        id: 20,
        dimension: "D",
        dimensionName: "美食倾向",
        text: "旅行时你最期待的是？",
        options: [
            { value: "A", label: "当地特色美食，一定要吃地道的", cities: ["CHENGDU", "GUANGZHOU", "XIAN", "CHANGSHA", "WUHAN", "TIANJIN"] },
            { value: "B", label: "人文历史景点，了解这座城市的故事", cities: ["BEIJING", "NANJING", "XIAN", "LHASA", "JINAN"] },
            { value: "C", label: "自然风光，亲近山水", cities: ["KUNMING", "DALI", "HANGZHOU", "QINGDAO", "LIJIANG", "SANYA", "GUIYANG"] },
            { value: "D", label: "休闲放松，不安排太满的行程", cities: ["XIAMEN", "SUZHOU", "DALI", "ZHUHAI", "LIJIANG", "XISHUANGBANNA"] }
        ]
    },
    // 题目21-25
    {
        id: 21,
        dimension: "E",
        dimensionName: "社交风格",
        text: "遇到邻居，你通常会？",
        options: [
            { value: "A", label: "热情打招呼，有时候会聊几句", cities: ["CHONGQING", "CHANGSHA", "CHENGDU", "TIANJIN", "HARBIN", "WUHAN"] },
            { value: "B", label: "点头微笑，保持礼貌", cities: ["HANGZHOU", "SUZHOU", "NANJING", "WUXI", "NINGBO"] },
            { value: "C", label: "避免眼神接触，快步走过", cities: ["BEIJING", "SHANGHAI", "SHENZHEN"] },
            { value: "D", label: "视情况而定，熟悉的会多聊", cities: ["GUANGZHOU", "XIAMEN", "QINGDAO", "ZHUHAI", "DALIAN"] }
        ]
    },
    {
        id: 22,
        dimension: "F",
        dimensionName: "职业追求",
        text: "你更认同哪种职场观念？",
        options: [
            { value: "A", label: "吃得苦中苦，方为人上人", cities: ["BEIJING", "SHANGHAI", "SHENZHEN", "WUHAN"] },
            { value: "B", label: "工作是为了更好地生活，不是生活本身", cities: ["HANGZHOU", "CHENGDU", "QINGDAO", "NINGBO", "DALIAN"] },
            { value: "C", label: "做自己热爱的事，即使收入不高也开心", cities: ["DALI", "XIAMEN", "SUZHOU", "LIJIANG", "LHASA", "XISHUANGBANNA"] },
            { value: "D", label: "先生存再谈理想，务实最重要", cities: ["GUANGZHOU", "CHANGSHA", "XIAN", "TIANJIN", "JINAN"] }
        ]
    },
    {
        id: 23,
        dimension: "G",
        dimensionName: "自然环境",
        text: "以下哪种住宅环境最让你向往？",
        options: [
            { value: "A", label: "高层公寓，俯瞰城市全景", cities: ["SHANGHAI", "SHENZHEN", "GUANGZHOU", "WUHAN", "TIANJIN"] },
            { value: "B", label: "海景房，每天听着海浪入睡", cities: ["QINGDAO", "XIAMEN", "SANYA", "DALIAN", "ZHUHAI"] },
            { value: "C", label: "湖边别墅，推窗见水", cities: ["HANGZHOU", "SUZHOU", "NANJING", "WUXI", "JINAN"] },
            { value: "D", label: "山间民宿，远离喧嚣", cities: ["KUNMING", "DALI", "CHONGQING", "LIJIANG", "GUIYANG", "LHASA"] }
        ]
    },
    {
        id: 24,
        dimension: "H",
        dimensionName: "生活方式",
        text: "你对\"买房\"这件事的态度是？",
        options: [
            { value: "A", label: "必须买，没有房子没有安全感", cities: ["BEIJING", "XIAN", "NANJING", "JINAN", "TIANJIN"] },
            { value: "B", label: "租房也挺好，不想被房贷绑架", cities: ["SHENZHEN", "HANGZHOU", "DALI", "LIJIANG"] },
            { value: "C", label: "看城市，有些城市值得买，有些不值得", cities: ["SHANGHAI", "GUANGZHOU", "CHENGDU", "WUHAN", "NINGBO"] },
            { value: "D", label: "随缘，能买就买，买不起也不勉强", cities: ["KUNMING", "XIAMEN", "CHANGSHA", "GUIYANG", "ZHUHAI", "SANYA"] }
        ]
    },
    {
        id: 25,
        dimension: "A",
        dimensionName: "生活节奏",
        text: "你觉得多长的假期最舒服？",
        options: [
            { value: "A", label: "3天左右，短途游刚刚好", cities: ["BEIJING", "SHANGHAI", "SHENZHEN", "WUHAN"] },
            { value: "B", label: "7天左右，可以好好放松", cities: ["HANGZHOU", "NANJING", "GUANGZHOU", "NINGBO", "WUXI"] },
            { value: "C", label: "半个月以上，彻底换个环境", cities: ["DALI", "KUNMING", "XIAMEN", "LIJIANG", "SANYA", "LHASA", "XISHUANGBANNA"] },
            { value: "D", label: "假期长短无所谓，随时都能进入休息状态", cities: ["CHENGDU", "SUZHOU", "QINGDAO", "ZHUHAI", "GUIYANG", "DALIAN"] }
        ]
    },
    // 题目26-30
    {
        id: 26,
        dimension: "C",
        dimensionName: "城市氛围",
        text: "你更喜欢哪种城市建筑风格？",
        options: [
            { value: "A", label: "古色古香的传统建筑，有历史韵味", cities: ["BEIJING", "XIAN", "NANJING", "SUZHOU", "LHASA", "LIJIANG"] },
            { value: "B", label: "现代化高楼大厦，充满未来感", cities: ["SHANGHAI", "SHENZHEN", "HANGZHOU", "WUHAN", "NINGBO"] },
            { value: "C", label: "中西合璧，有独特的混搭美", cities: ["QINGDAO", "XIAMEN", "GUANGZHOU", "HARBIN", "DALIAN", "TIANJIN"] },
            { value: "D", label: "依山傍水的自然融合，建筑与环境和谐", cities: ["KUNMING", "DALI", "HANGZHOU", "CHONGQING", "GUIYANG", "XISHUANGBANNA"] }
        ]
    },
    {
        id: 27,
        dimension: "D",
        dimensionName: "美食倾向",
        text: "以下哪种夜宵场景最吸引你？",
        options: [
            { value: "A", label: "路边撸串喝啤酒，热闹又接地气", cities: ["CHANGSHA", "CHENGDU", "XIAN", "WUHAN", "TIANJIN", "HARBIN"] },
            { value: "B", label: "火锅店里涮到深夜，越吃越嗨", cities: ["CHONGQING", "CHENGDU", "GUIYANG"] },
            { value: "C", label: "海鲜大排档，各种生猛海鲜", cities: ["QINGDAO", "XIAMEN", "GUANGZHOU", "DALIAN", "SANYA", "NINGBO"] },
            { value: "D", label: "安静的居酒屋，小酌几杯", cities: ["SHANGHAI", "HANGZHOU", "SUZHOU", "WUXI", "NANJING"] }
        ]
    },
    {
        id: 28,
        dimension: "E",
        dimensionName: "社交风格",
        text: "你对\"老乡文化\"的感受是？",
        options: [
            { value: "A", label: "喜欢，有老乡在异乡有归属感", cities: ["BEIJING", "GUANGZHOU", "WUHAN"] },
            { value: "B", label: "一般，不刻意找但遇到会亲切", cities: ["CHENGDU", "XIAN", "CHANGSHA", "TIANJIN", "JINAN", "HARBIN"] },
            { value: "C", label: "不太在意，交朋友不看地域", cities: ["SHENZHEN", "HANGZHOU", "NANJING", "NINGBO", "WUXI"] },
            { value: "D", label: "有点抗拒，不想被老乡圈子束缚", cities: ["SHANGHAI", "DALI", "XIAMEN", "LIJIANG", "LHASA"] }
        ]
    },
    {
        id: 29,
        dimension: "F",
        dimensionName: "职业追求",
        text: "如果收入相同，你更愿意？",
        options: [
            { value: "A", label: "在北上广深拼搏，见更大的世界", cities: ["BEIJING", "SHANGHAI", "GUANGZHOU", "SHENZHEN"] },
            { value: "B", label: "在新一线城市，平衡事业与生活", cities: ["HANGZHOU", "CHENGDU", "NANJING", "CHANGSHA", "WUHAN", "TIANJIN"] },
            { value: "C", label: "回老家或中小城市，离家人近", cities: ["XIAN", "KUNMING", "JINAN", "HARBIN"] },
            { value: "D", label: "去风景优美的城市，享受生活", cities: ["DALI", "XIAMEN", "QINGDAO", "SUZHOU", "LIJIANG", "SANYA", "ZHUHAI"] }
        ]
    },
    {
        id: 30,
        dimension: "H",
        dimensionName: "生活方式",
        text: "对于城市的包容度，你最看重什么？",
        options: [
            { value: "A", label: "外来人口融入度高，不排外", cities: ["SHENZHEN", "GUANGZHOU", "WUHAN"] },
            { value: "B", label: "文化多元，可以接触不同的人和事", cities: ["SHANGHAI", "BEIJING", "HANGZHOU", "DALIAN"] },
            { value: "C", label: "对新事物接受度高，创新氛围浓", cities: ["SHENZHEN", "HANGZHOU", "CHANGSHA", "NINGBO"] },
            { value: "D", label: "保留传统特色，有地方归属感", cities: ["XIAN", "CHENGDU", "SUZHOU", "NANJING", "TIANJIN", "JINAN", "HARBIN"] }
        ]
    },
    // 题目31-35
    {
        id: 31,
        dimension: "I",
        dimensionName: "语言环境",
        text: "你对城市的方言氛围怎么看？",
        options: [
            { value: "A", label: "喜欢有浓郁方言氛围的城市，更有地方特色", cities: ["GUANGZHOU", "CHENGDU", "CHONGQING", "CHANGSHA", "WUHAN", "TIANJIN", "XIAN"] },
            { value: "B", label: "更喜欢普通话为主的城市，沟通无障碍", cities: ["BEIJING", "SHENZHEN", "HARBIN", "DALIAN", "JINAN"] },
            { value: "C", label: "无所谓，能适应就好", cities: ["HANGZHOU", "NANJING", "KUNMING", "GUIYANG", "WUXI", "NINGBO"] },
            { value: "D", label: "喜欢多语言混杂的环境，更有国际范儿", cities: ["SHANGHAI", "SANYA", "ZHUHAI", "XIAMEN"] }
        ]
    },
    {
        id: 32,
        dimension: "J",
        dimensionName: "城市规模",
        text: "你更倾向于生活在哪种规模的城市？",
        options: [
            { value: "A", label: "超大城市，人口千万以上，资源丰富", cities: ["BEIJING", "SHANGHAI", "GUANGZHOU", "SHENZHEN", "CHENGDU", "CHONGQING", "WUHAN", "TIANJIN"] },
            { value: "B", label: "大城市，几百万人口，配套完善", cities: ["HANGZHOU", "NANJING", "XIAN", "CHANGSHA", "QINGDAO", "DALIAN", "JINAN", "HARBIN", "KUNMING"] },
            { value: "C", label: "中型城市，百万左右，不拥挤不冷清", cities: ["SUZHOU", "XIAMEN", "ZHUHAI", "NINGBO", "WUXI", "GUIYANG"] },
            { value: "D", label: "小城市或县城，安静惬意", cities: ["DALI", "LIJIANG", "SANYA", "LHASA", "XISHUANGBANNA"] }
        ]
    },
    {
        id: 33,
        dimension: "K",
        dimensionName: "文化娱乐",
        text: "周末晚上，你更想去哪里？",
        options: [
            { value: "A", label: "LiveHouse听一场独立乐队演出", cities: ["BEIJING", "SHANGHAI", "CHENGDU", "XIAN", "WUHAN", "CHANGSHA"] },
            { value: "B", label: "茶馆听听相声或看地方戏曲", cities: ["TIANJIN", "CHENGDU", "SUZHOU", "HANGZHOU", "NANJING"] },
            { value: "C", label: "商场看电影、逛街购物", cities: ["SHANGHAI", "SHENZHEN", "HANGZHOU", "GUANGZHOU", "NINGBO", "WUXI"] },
            { value: "D", label: "在家宅着，或去安静的咖啡馆", cities: ["DALI", "LIJIANG", "XIAMEN", "ZHUHAI", "KUNMING", "LHASA"] }
        ]
    },
    {
        id: 34,
        dimension: "A",
        dimensionName: "生活节奏",
        text: "你能接受多长时间的通勤？",
        options: [
            { value: "A", label: "1小时以上也能接受，大城市难免", cities: ["BEIJING", "SHANGHAI", "GUANGZHOU", "SHENZHEN", "WUHAN"] },
            { value: "B", label: "30分钟到一小时，还算可以", cities: ["HANGZHOU", "NANJING", "CHENGDU", "XIAN", "CHANGSHA", "TIANJIN"] },
            { value: "C", label: "最好30分钟内，时间很宝贵", cities: ["QINGDAO", "XIAMEN", "SUZHOU", "NINGBO", "WUXI", "DALIAN", "JINAN"] },
            { value: "D", label: "希望步行或骑车就能到，越短越好", cities: ["DALI", "LIJIANG", "ZHUHAI", "SANYA", "KUNMING", "LHASA", "XISHUANGBANNA", "GUIYANG"] }
        ]
    },
    {
        id: 35,
        dimension: "B",
        dimensionName: "气候偏好",
        text: "你更能适应哪种夏天？",
        options: [
            { value: "A", label: "火炉城市的酷暑，有空调就行", cities: ["WUHAN", "CHONGQING", "NANJING", "CHANGSHA", "JINAN"] },
            { value: "B", label: "湿热但有海风，还算舒适", cities: ["QINGDAO", "DALIAN", "XIAMEN", "SHENZHEN", "GUANGZHOU", "ZHUHAI", "SANYA"] },
            { value: "C", label: "温和不热，避暑胜地最好", cities: ["KUNMING", "GUIYANG", "DALI", "LIJIANG", "HARBIN", "LHASA"] },
            { value: "D", label: "无所谓，哪里都能适应", cities: ["BEIJING", "SHANGHAI", "HANGZHOU", "CHENGDU", "XIAN", "TIANJIN"] }
        ]
    },
    // 题目36-40
    {
        id: 36,
        dimension: "C",
        dimensionName: "城市氛围",
        text: "你更喜欢哪种城市发展阶段？",
        options: [
            { value: "A", label: "成熟稳定的老牌城市，底蕴深厚", cities: ["BEIJING", "SHANGHAI", "NANJING", "XIAN", "TIANJIN", "JINAN"] },
            { value: "B", label: "快速发展的新兴城市，机会多", cities: ["SHENZHEN", "HANGZHOU", "CHENGDU", "WUHAN", "CHANGSHA", "NINGBO"] },
            { value: "C", label: "保持原生态的小城，没被过度开发", cities: ["DALI", "LIJIANG", "LHASA", "XISHUANGBANNA"] },
            { value: "D", label: "既有历史又有新城的平衡发展型", cities: ["GUANGZHOU", "QINGDAO", "XIAMEN", "SUZHOU", "KUNMING", "GUIYANG", "CHONGQING"] }
        ]
    },
    {
        id: 37,
        dimension: "D",
        dimensionName: "美食倾向",
        text: "以下哪种早餐最吸引你？",
        options: [
            { value: "A", label: "热干面/米粉/担担面，爆炸碳水", cities: ["WUHAN", "CHONGQING", "CHANGSHA", "CHENGDU", "GUIYANG"] },
            { value: "B", label: "早茶点心，精致丰富", cities: ["GUANGZHOU", "SHENZHEN", "ZHUHAI", "XIAMEN"] },
            { value: "C", label: "煎饼果子/包子豆浆，简单实在", cities: ["TIANJIN", "BEIJING", "JINAN", "HARBIN"] },
            { value: "D", label: "米线/糌粑，清淡养生", cities: ["KUNMING", "DALI", "LIJIANG", "HANGZHOU", "SUZHOU", "NANJING", "XISHUANGBANNA"] }
        ]
    },
    {
        id: 38,
        dimension: "E",
        dimensionName: "社交风格",
        text: "你更喜欢哪种城市的人情味？",
        options: [
            { value: "A", label: "热情奔放，陌生人也能聊成朋友", cities: ["CHONGQING", "CHANGSHA", "WUHAN", "HARBIN", "TIANJIN", "XIAN"] },
            { value: "B", label: "内敛含蓄，不打扰但很真诚", cities: ["NANJING", "SUZHOU", "HANGZHOU", "WUXI", "NINGBO"] },
            { value: "C", label: "务实利落，讲效率不墨迹", cities: ["GUANGZHOU", "SHENZHEN", "SHANGHAI", "BEIJING"] },
            { value: "D", label: "随和佛系，不卷不急", cities: ["CHENGDU", "KUNMING", "DALI", "LIJIANG", "XIAMEN", "ZHUHAI", "LHASA", "XISHUANGBANNA"] }
        ]
    },
    {
        id: 39,
        dimension: "F",
        dimensionName: "职业追求",
        text: "你更看重城市的哪种产业特点？",
        options: [
            { value: "A", label: "互联网/科技产业发达", cities: ["SHENZHEN", "HANGZHOU", "BEIJING", "CHENGDU", "WUHAN"] },
            { value: "B", label: "制造业/实体经济基础好", cities: ["SUZHOU", "WUXI", "NINGBO", "GUANGZHOU", "TIANJIN", "DALIAN", "JINAN"] },
            { value: "C", label: "文化创意/旅游产业繁荣", cities: ["DALI", "LIJIANG", "XIAMEN", "SANYA", "KUNMING", "GUIYANG", "LHASA", "XISHUANGBANNA"] },
            { value: "D", label: "贸易/金融中心", cities: ["SHANGHAI", "BEIJING", "SHENZHEN", "GUANGZHOU"] }
        ]
    },
    {
        id: 40,
        dimension: "G",
        dimensionName: "自然环境",
        text: "你更向往哪种自然景观？",
        options: [
            { value: "A", label: "雪山草甸，高原风光", cities: ["LHASA", "LIJIANG", "KUNMING", "DALI", "XIAN", "GUIYANG"] },
            { value: "B", label: "热带雨林，鸟语花香", cities: ["XISHUANGBANNA", "SANYA", "XIAMEN", "ZHUHAI"] },
            { value: "C", label: "江湖水网，水乡温婉", cities: ["HANGZHOU", "SUZHOU", "NANJING", "WUXI", "WUHAN"] },
            { value: "D", label: "平原城市，开阔大气", cities: ["BEIJING", "TIANJIN", "JINAN", "HARBIN", "DALIAN", "CHANGSHA"] }
        ]
    },
    // 题目41-45
    {
        id: 41,
        dimension: "H",
        dimensionName: "生活方式",
        text: "你更喜欢哪种居住环境？",
        options: [
            { value: "A", label: "CBD附近，繁华便利", cities: ["SHANGHAI", "SHENZHEN", "BEIJING", "GUANGZHOU"] },
            { value: "B", label: "老城区，烟火气浓厚", cities: ["CHENGDU", "CHONGQING", "WUHAN", "TIANJIN", "XIAN", "CHANGSHA", "NANJING"] },
            { value: "C", label: "新城区，环境整洁", cities: ["HANGZHOU", "SUZHOU", "NINGBO", "WUXI", "QINGDAO", "DALIAN", "JINAN"] },
            { value: "D", label: "近郊/景区，环境清幽", cities: ["DALI", "LIJIANG", "XIAMEN", "ZHUHAI", "KUNMING", "SANYA", "LHASA", "XISHUANGBANNA", "GUIYANG"] }
        ]
    },
    {
        id: 42,
        dimension: "I",
        dimensionName: "语言环境",
        text: "以下哪种方言区域的氛围更吸引你？",
        options: [
            { value: "A", label: "吴侬软语的江南", cities: ["SUZHOU", "HANGZHOU", "SHANGHAI", "NANJING", "WUXI", "NINGBO"] },
            { value: "B", label: "豪爽爽快的东北", cities: ["HARBIN", "DALIAN", "CHANGSHA", "TIANJIN", "JINAN"] },
            { value: "C", label: "麻辣鲜香的川渝", cities: ["CHENGDU", "CHONGQING", "GUIYANG"] },
            { value: "D", label: "务实包容的岭南", cities: ["GUANGZHOU", "SHENZHEN", "ZHUHAI", "XIAMEN"] }
        ]
    },
    {
        id: 43,
        dimension: "J",
        dimensionName: "城市规模",
        text: "你对城市的人口密度怎么看？",
        options: [
            { value: "A", label: "人多热闹才有活力，喜欢人气旺", cities: ["BEIJING", "SHANGHAI", "GUANGZHOU", "SHENZHEN", "CHONGQING", "WUHAN", "CHENGDU"] },
            { value: "B", label: "适中就好，不要太拥挤", cities: ["HANGZHOU", "NANJING", "XIAN", "CHANGSHA", "TIANJIN", "QINGDAO", "DALIAN", "JINAN"] },
            { value: "C", label: "人少清净，不喜欢人挤人", cities: ["DALI", "LIJIANG", "LHASA", "XISHUANGBANNA", "ZHUHAI", "SANYA"] },
            { value: "D", label: "无所谓，习惯就好", cities: ["SUZHOU", "XIAMEN", "KUNMING", "NINGBO", "WUXI", "GUIYANG", "HARBIN"] }
        ]
    },
    {
        id: 44,
        dimension: "K",
        dimensionName: "文化娱乐",
        text: "以下哪种文化氛围更能吸引你定居？",
        options: [
            { value: "A", label: "高校云集，学术氛围浓", cities: ["BEIJING", "WUHAN", "NANJING", "XIAN", "HANGZHOU"] },
            { value: "B", label: "文艺青年聚集，独立音乐/美术馆多", cities: ["CHENGDU", "SHANGHAI", "HANGZHOU", "DALI", "XIAMEN", "LIJIANG"] },
            { value: "C", label: "传统文化保留好，古迹多", cities: ["BEIJING", "XIAN", "NANJING", "SUZHOU", "LHASA"] },
            { value: "D", label: "娱乐产业发达，综艺/演出多", cities: ["CHANGSHA", "SHANGHAI", "BEIJING", "CHENGDU"] }
        ]
    },
    {
        id: 45,
        dimension: "H",
        dimensionName: "生活方式",
        text: "你对城市的生活成本怎么看？",
        options: [
            { value: "A", label: "贵一点没关系，资源好最重要", cities: ["BEIJING", "SHANGHAI", "SHENZHEN", "HANGZHOU", "GUANGZHOU"] },
            { value: "B", label: "性价比很重要，不想被生活成本压得喘不过气", cities: ["CHENGDU", "WUHAN", "CHANGSHA", "XIAN", "NANJING", "QINGDAO", "DALIAN"] },
            { value: "C", label: "生活成本要低，有更多钱享受生活", cities: ["KUNMING", "GUIYANG", "DALI", "LIJIANG", "HARBIN", "JINAN", "LHASA", "XISHUANGBANNA"] },
            { value: "D", label: "无所谓，赚多少花多少", cities: ["SUZHOU", "XIAMEN", "TIANJIN", "NINGBO", "WUXI", "ZHUHAI", "SANYA", "CHONGQING"] }
        ]
    }
];

// 暴露为全局变量（用于script标签方式）
// 确保变量在全局作用域可用
if (typeof window !== 'undefined') {
    window.QUESTIONS = QUESTIONS;
} else {
    // Node.js环境
    if (typeof global !== 'undefined') {
        global.QUESTIONS = QUESTIONS;
    }
}

// ES6模块导出（用于import方式）
// 注意：如果通过普通script标签加载，export会导致CORS错误（file://协议）
// 为了支持直接打开静态文件，暂时注释掉export
// 如果需要ES6模块支持，请取消注释，但必须通过HTTP服务器访问
// export { QUESTIONS };

