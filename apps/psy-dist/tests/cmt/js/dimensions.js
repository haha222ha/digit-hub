// 11个维度配置
const DIMENSIONS = {
    A: {
        name: "生活节奏",
        icon: "⏰",
        description: "对快节奏/慢节奏生活的偏好程度"
    },
    B: {
        name: "气候偏好",
        icon: "🌤️",
        description: "对不同气候环境的适应性和喜好"
    },
    C: {
        name: "城市氛围",
        icon: "🏛️",
        description: "对传统文化/现代都市/文艺气息的偏好"
    },
    D: {
        name: "美食倾向",
        icon: "🍜",
        description: "对不同风味饮食的喜好"
    },
    E: {
        name: "社交风格",
        icon: "👥",
        description: "人际交往的方式和态度"
    },
    F: {
        name: "职业追求",
        icon: "💼",
        description: "事业发展方向和工作态度"
    },
    G: {
        name: "自然环境",
        icon: "🏔️",
        description: "对山/海/湖/平原等自然景观的偏好"
    },
    H: {
        name: "生活方式",
        icon: "🏠",
        description: "日常生活习惯和消费观念"
    },
    I: {
        name: "语言环境",
        icon: "🗣️",
        description: "对方言/普通话环境的偏好"
    },
    J: {
        name: "城市规模",
        icon: "🌆",
        description: "对城市大小和人口密度的偏好"
    },
    K: {
        name: "文化娱乐",
        icon: "🎭",
        description: "对休闲娱乐方式的偏好"
    }
};

// 维度偏好标签映射
const DIMENSION_PREFERENCES = {
    A: { A: "快节奏生活", B: "适中节奏", C: "慢节奏生活", D: "自然悠闲" },
    B: { A: "四季分明", B: "温暖湿润", C: "四季如春", D: "适应性强" },
    C: { A: "历史文化", B: "现代时尚", C: "文艺诗意", D: "烟火市井" },
    D: { A: "麻辣重口", B: "清淡养生", C: "海鲜鲜美", D: "口味多元" },
    E: { A: "热情外向", B: "温和内敛", C: "务实包容", D: "独立自我" },
    F: { A: "稳定体制", B: "创业挑战", C: "自由灵活", D: "文艺热爱" },
    G: { A: "山景高原", B: "海滨风光", C: "湖景水乡", D: "城市景观" },
    H: { A: "品质消费", B: "性价比", C: "节省储蓄", D: "体验消费" },
    I: { A: "方言氛围", B: "普通话", C: "适应性强", D: "国际化" },
    J: { A: "超大城市", B: "大城市", C: "中型城市", D: "小城市" },
    K: { A: "潮流娱乐", B: "传统文化", C: "商业购物", D: "安静独处" }
};

// 暴露为全局变量（用于script标签方式）
// 注意：如果文件包含export，浏览器会将其视为模块，const变量不会自动成为全局变量
// 所以我们需要显式赋值给window
if (typeof window !== 'undefined') {
    window.DIMENSIONS = DIMENSIONS;
    window.DIMENSION_PREFERENCES = DIMENSION_PREFERENCES;
}

// ES6模块导出（用于import方式，必须在顶层）
// 注意：如果通过普通script标签加载，export会导致CORS错误（file://协议）
// 为了支持直接打开静态文件，暂时注释掉export
// 如果需要ES6模块支持，请取消注释，但必须通过HTTP服务器访问
// export { DIMENSIONS, DIMENSION_PREFERENCES };

