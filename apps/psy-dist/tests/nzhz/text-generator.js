// 生命频率测试 - 文案生成模块
// 根据层级和维度生成个性化报告文案

// ========== 维度文案模板 ==========
// 根据维度分数范围返回对应的描述文案
const DIMENSION_TEXTS = {
    "逆境商": {
        high: "您拥有极强的心理韧性，在面对挑战时，往往比同龄人表现得更加镇定。这股内在的支撑力，让您在风浪中依然能把握住方向。",
        medium: "您拥有基本的心理防线，能应对大多数挑战。但在高压之下，仍需留意情绪的暗流涌动。",
        low: "您在面对突发变故时容易陷入恐慌或愤怒。建议练习\"暂停三秒\"法：在情绪上头时，深呼吸三次，问自己\"这件事最坏的结果是什么？我现在能做的一件小事是什么？\"，将焦点拉回当下。"
    },
    "人际场": {
        high: "您拥有一种天然的\"共情引力\"。人们在您身边会不自觉地卸下防备，感到被理解和接纳。这种治愈系的能量场，是您影响世界最温柔却最强大的武器。",
        medium: "您的社交圈相对稳定，但或许缺乏深度的灵魂共鸣。试着在安全的关系中，稍微展露一点真实的脆弱。",
        low: "关系似乎消耗了您不少能量，可能存在对他人的过度期待或控制欲。试着放下\"改变别人\"的念头，回到自身。记住，所有关系的本质都是与自己关系的投射。"
    },
    "财富流": {
        high: "您对金钱和资源有很好的掌控力，能够创造并维持丰盛。这种丰盛感不仅来自物质，更来自内心的富足。",
        medium: "您对物质世界有不错的掌控力，但偶尔仍会有隐性的担忧。请觉察那些关于\"不够\"的潜意识念头。",
        low: "您可能对金钱有较深的焦虑或匮乏感。试着每天记录三件值得感恩的小事，学会从\"我想要\"转向\"我拥有\"，滋养内心的丰盛感。"
    },
    "自我感": {
        high: "您完全接纳自己本来的样子，内在的自信不依赖外界的评价。这种自我价值感是您最坚实的根基。",
        medium: "大多数时候您能自我肯定，但间歇性地仍会在意他人的眼光。请记得，您的价值是与生俱来的。",
        low: "内心那个严厉的法官经常审判您。请试着像对待最好的朋友那样对待自己，多一些温柔和宽容。"
    },
    "世界观": {
        high: "您拥有一双穿透表象的\"慧眼\"。您能从宏观视角看待得失，对生命的不确定性保持着深深的信任。这种智慧让您在动荡的时代中依然能活得从容。",
        medium: "您趋向于理性乐观，但在面对巨大的不确定性时，信心偶尔会动摇。这是正常的，允许怀疑的存在。",
        low: "您眼中的世界可能带有敌意或不安全感。这是一种保护机制，但也限制了机遇。试着做一个实验：每天寻找三个\"世界是友好的\"证据，哪怕只是陌生人的一个微笑。"
    },
    "身心态": {
        high: "您很注重生活品质与身心健康，懂得劳逸结合。相比于透支身体去换取成功，您更倾向于可持续的成长方式，这是非常明智的策略。",
        medium: "您的健康状况良好，但需警惕隐性的疲劳积累。不要等到电量耗尽才想起充电。",
        low: "您的身体可能正在发出求救信号。不要忽视疲惫、紧绷的感觉。请务必将\"休息\"列入每日待办事项，而不是作为做完事后的奖励。身体是灵魂的圣殿，请善待它。"
    },
    "灵性度": {
        high: "您已经超越了物质层面的追求，开始体验更深层的存在意义。这种灵性的觉醒让您能够以更高的视角看待生命。",
        medium: "灵性的种子正在发芽，您开始思考比生存更宏大的议题。试着将思考转化为体验，去感受当下的美。",
        low: "您可能过度关注物质层面，忽略了精神层面的滋养。试着每天花十分钟静坐或冥想，与内在的自己连接。"
    }
};

// 专属状态解读模板（根据最高维度）
const EXCLUSIVE_INTERPRETATION = {
    "逆境商": "特别值得注意的是，您的**逆境商**尤为突出。这意味着这种层级状态并非温室里的花朵，而是您在风雨中磨砺出的真实力量。您的抗压属性正在成为您意识跃迁的最强引擎。",
    "人际场": "数据显示，**人际场**是您当前频率的\"放大器\"。这种状态很大程度上得益于您开放且滋养的社交连接。您的同理心正在帮助您稳固在这一层级。",
    "财富流": "您的**财富流**是支撑这一层级的坚实基础。您对资源的掌控力和创造能力，让您能够在这个层级稳定地成长。",
    "自我感": "您的**自我感**是这一层级的核心支柱。您对自己的接纳和信任，让您能够在这个层级中保持稳定和自信。",
    "世界观": "您宏大的**世界观**是支撑这一层级的核心支柱。因为您看待事物的视角足够宽广，琐碎的干扰很难将您拉低，这是一种智慧型的能量结构。",
    "身心态": "您的**身心态**保持得很好，这非常关键。充沛的物理体能和神经系统的调节能力，正在为您的意识扩张提供源源不断的燃料。",
    "灵性度": "您的**灵性度**是这一层级的升华力量。您对生命深层意义的探索，让您能够在这个层级中保持更高的觉知。"
};

/**
 * 根据维度分数获取对应的文案
 * @param {string} dimName - 维度名称
 * @param {number} score - 维度分数
 * @returns {string} 对应的文案
 */
function getDimensionText(dimName, score) {
    const templates = DIMENSION_TEXTS[dimName];
    if (!templates) return "";
    
    if (score >= 400) return templates.high;
    if (score >= 250) return templates.medium;
    return templates.low;
}

/**
 * 找出最高和最低维度
 * @param {Array} dimensions - 维度数组 [{name, avg}, ...]
 * @returns {Object} {highest: {name, avg}, lowest: {name, avg}}
 */
function findExtremeDimensions(dimensions) {
    let highest = dimensions[0];
    let lowest = dimensions[0];
    
    for (const dim of dimensions) {
        if (dim.avg > highest.avg) highest = dim;
        if (dim.avg < lowest.avg) lowest = dim;
    }
    
    return { highest, lowest };
}

/**
 * 生成 resultHtml（结果页面文案）
 * @param {Object} level - 层级对象
 * @param {Array} dimensions - 维度数组 [{name, avg}, ...]
 * @returns {string} resultHtml
 */
function generateResultHtml(level, dimensions) {
    if (!level || !dimensions || dimensions.length === 0) {
        return "";
    }
    
    // 基础层级描述
    let html = level.desc || "";
    
    // 找出最高维度
    const { highest } = findExtremeDimensions(dimensions);
    
    // 添加专属状态解读
    const exclusiveText = EXCLUSIVE_INTERPRETATION[highest.name];
    if (exclusiveText) {
        html += '<br><br><div style="border-top: 1px dashed rgba(255,255,255,0.2); margin-top: 15px; padding-top: 15px;"><strong>【专属状态解读】</strong><br>' + exclusiveText + '</div>';
    }
    
    return html;
}

/**
 * 生成 analysisHtml（分析页面文案）
 * @param {Array} dimensions - 维度数组 [{name, avg}, ...]
 * @returns {string} analysisHtml
 */
function generateAnalysisHtml(dimensions) {
    if (!dimensions || dimensions.length === 0) {
        return "";
    }
    
    // 找出最高和最低维度
    const { highest, lowest } = findExtremeDimensions(dimensions);
    
    // 生成能量天赋部分
    const talentText = getDimensionText(highest.name, highest.avg);
    let html = '<strong>【能量天赋】</strong> 您的核心优势源自 <span class="highlight-good">' + highest.name + '</span> (' + highest.avg + ')。' + talentText;
    
    // 生成升维卡点部分
    const weaknessText = getDimensionText(lowest.name, lowest.avg);
    html += '<br><br><strong>【升维卡点】</strong> 目前能量流失较明显的领域是 <span class="highlight-bad">' + lowest.name + '</span> (' + lowest.avg + ')。' + weaknessText;
    
    // 生成综合维度透视部分
    // 按分数从高到低排序（排除最高和最低，因为它们已经在上面展示过了）
    const otherDims = dimensions
        .filter(d => d.name !== highest.name && d.name !== lowest.name)
        .sort((a, b) => b.avg - a.avg);
    
    html += '<div style="margin-top: 25px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px;">';
    html += '<strong style="font-size:1.05rem; display:block; margin-bottom:15px;">【综合维度透视】</strong>';
    
    for (const dim of otherDims) {
        const dimText = getDimensionText(dim.name, dim.avg);
        html += '<div style="margin-bottom: 12px; font-size: 0.9rem; line-height: 1.6; background: rgba(255,255,255,0.03); padding: 10px; border-radius: 6px;">';
        html += '<span style="color: var(--accent); font-weight: bold; margin-right: 8px;">◈ ' + dim.name + ' (' + dim.avg + ')</span><br>';
        html += '<span style="color: rgba(255,255,255,0.85); display:block; margin-top:4px;">' + dimText + '</span>';
        html += '</div>';
    }
    
    html += '</div>';
    
    return html;
}

