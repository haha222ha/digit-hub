/**
 * MBTI Step I 基础量表 - 题目数据
 * 
 * MBTI（Myers-Briggs Type Indicator）是基于荣格心理类型理论的科学人格测评工具
 * 共93题，分为4个维度：
 * - 外向(E) vs 内向(I) - 24题
 * - 感觉(S) vs 直觉(N) - 24题
 * - 思维(T) vs 情感(F) - 23题
 * - 判断(J) vs 知觉(P) - 22题
 */

// MBTI 题目数据（93题）
// 注意：题目ID从1开始，数组索引从0开始
export const QUESTIONS = [
  // ========== 外向(E) vs 内向(I) - 24题 ==========
  { id: 1, text: '在聚会中，您更愿意：', dimension: 'EI', options: [
    { value: 'E', label: '与许多人交谈，包括陌生人' },
    { value: 'I', label: '只与少数您熟悉的人交谈' }
  ]},
  { id: 2, text: '在社交场合中，您：', dimension: 'EI', options: [
    { value: 'E', label: '容易与人开始对话' },
    { value: 'I', label: '等待别人先开始对话' }
  ]},
  { id: 3, text: '您更倾向于：', dimension: 'EI', options: [
    { value: 'E', label: '在人群中获得能量' },
    { value: 'I', label: '在独处时获得能量' }
  ]},
  { id: 4, text: '工作时，您更喜欢：', dimension: 'EI', options: [
    { value: 'E', label: '在开放的环境中与他人协作' },
    { value: 'I', label: '在安静的环境中独立工作' }
  ]},
  { id: 5, text: '您认为自己：', dimension: 'EI', options: [
    { value: 'E', label: '容易了解，开放坦率' },
    { value: 'I', label: '比较内敛，需要时间了解' }
  ]},
  { id: 6, text: '面对压力时，您更愿意：', dimension: 'EI', options: [
    { value: 'E', label: '与他人讨论寻求支持' },
    { value: 'I', label: '独自思考处理问题' }
  ]},
  { id: 7, text: '在新环境中，您：', dimension: 'EI', options: [
    { value: 'E', label: '很快适应并主动交流' },
    { value: 'I', label: '需要时间观察和适应' }
  ]},
  { id: 8, text: '您的朋友圈：', dimension: 'EI', options: [
    { value: 'E', label: '比较广泛，认识很多人' },
    { value: 'I', label: '比较精深，几个知心朋友' }
  ]},
  { id: 9, text: '参加会议时，您：', dimension: 'EI', options: [
    { value: 'E', label: '积极发言表达观点' },
    { value: 'I', label: '仔细倾听，深思熟虑后发言' }
  ]},
  { id: 10, text: '电话铃响时，您：', dimension: 'EI', options: [
    { value: 'E', label: '立即接听，喜欢电话交流' },
    { value: 'I', label: '有时会犹豫，更喜欢面对面交流' }
  ]},
  { id: 11, text: '在团队项目中，您：', dimension: 'EI', options: [
    { value: 'E', label: '喜欢集体讨论，头脑风暴' },
    { value: 'I', label: '喜欢先独立思考再分享想法' }
  ]},
  { id: 12, text: '您的能量来源：', dimension: 'EI', options: [
    { value: 'E', label: '主要来自与他人的互动' },
    { value: 'I', label: '主要来自内心的思考和反省' }
  ]},
  { id: 13, text: '在学习新知识时，您：', dimension: 'EI', options: [
    { value: 'E', label: '喜欢通过讨论和交流学习' },
    { value: 'I', label: '喜欢通过阅读和独立研究学习' }
  ]},
  { id: 14, text: '您更喜欢：', dimension: 'EI', options: [
    { value: 'E', label: '边想边说，在交流中整理思路' },
    { value: 'I', label: '先想清楚再说，深思熟虑后表达' }
  ]},
  { id: 15, text: '在冲突情况下，您：', dimension: 'EI', options: [
    { value: 'E', label: '倾向于直接讨论解决' },
    { value: 'I', label: '倾向于先冷静思考再处理' }
  ]},
  { id: 16, text: '您更愿意通过以下方式思考问题：', dimension: 'EI', options: [
    { value: 'E', label: '与他人讨论，大声思考' },
    { value: 'I', label: '安静地独自思考' }
  ]},
  { id: 17, text: '在会议中，您通常：', dimension: 'EI', options: [
    { value: 'E', label: '积极参与讨论，经常发言' },
    { value: 'I', label: '仔细倾听，选择性发言' }
  ]},
  { id: 18, text: '您的决策过程：', dimension: 'EI', options: [
    { value: 'E', label: '喜欢与他人讨论后决定' },
    { value: 'I', label: '倾向于独自考虑后决定' }
  ]},
  { id: 19, text: '在压力下，您更可能：', dimension: 'EI', options: [
    { value: 'E', label: '向外寻求支持和建议' },
    { value: 'I', label: '向内寻求力量和解决方案' }
  ]},
  { id: 20, text: '您更喜欢的沟通方式：', dimension: 'EI', options: [
    { value: 'E', label: '面对面交流或电话' },
    { value: 'I', label: '书面交流或邮件' }
  ]},
  { id: 21, text: '在解决问题时，您：', dimension: 'EI', options: [
    { value: 'E', label: '边说边想，通过表达理清思路' },
    { value: 'I', label: '先想清楚再表达' }
  ]},
  { id: 22, text: '您的注意力更多关注：', dimension: 'EI', options: [
    { value: 'E', label: '外部世界和他人' },
    { value: 'I', label: '内心世界和想法' }
  ]},
  { id: 23, text: '在团队合作中，您：', dimension: 'EI', options: [
    { value: 'E', label: '喜欢开放式讨论和头脑风暴' },
    { value: 'I', label: '更愿意先个人准备再参与讨论' }
  ]},
  { id: 24, text: '您认为最好的想法来自：', dimension: 'EI', options: [
    { value: 'E', label: '与他人的互动和讨论' },
    { value: 'I', label: '深度的个人思考和反思' }
  ]},

  // ========== 感觉(S) vs 直觉(N) - 24题 ==========
  { id: 25, text: '您更相信：', dimension: 'SN', options: [
    { value: 'S', label: '现实和经验' },
    { value: 'N', label: '直觉和灵感' }
  ]},
  { id: 26, text: '您更感兴趣的是：', dimension: 'SN', options: [
    { value: 'S', label: '具体的事实和细节' },
    { value: 'N', label: '可能性和潜在含义' }
  ]},
  { id: 27, text: '您更喜欢：', dimension: 'SN', options: [
    { value: 'S', label: '按部就班，循序渐进' },
    { value: 'N', label: '跳跃思维，追求创新' }
  ]},
  { id: 28, text: '在处理信息时，您：', dimension: 'SN', options: [
    { value: 'S', label: '关注具体细节和步骤' },
    { value: 'N', label: '关注整体概念和模式' }
  ]},
  { id: 29, text: '您更擅长：', dimension: 'SN', options: [
    { value: 'S', label: '观察和记住具体事实' },
    { value: 'N', label: '理解抽象概念和理论' }
  ]},
  { id: 30, text: '您更喜欢的工作是：', dimension: 'SN', options: [
    { value: 'S', label: '有明确步骤和标准的' },
    { value: 'N', label: '需要创造力和想象力的' }
  ]},
  { id: 31, text: '您更重视：', dimension: 'SN', options: [
    { value: 'S', label: '实用性和可操作性' },
    { value: 'N', label: '新颖性和创新性' }
  ]},
  { id: 32, text: '在阅读时，您：', dimension: 'SN', options: [
    { value: 'S', label: '仔细阅读每个细节' },
    { value: 'N', label: '快速浏览把握要点' }
  ]},
  { id: 33, text: '您更信任：', dimension: 'SN', options: [
    { value: 'S', label: '已被证实的方法' },
    { value: 'N', label: '新的可能性' }
  ]},
  { id: 34, text: '您更容易注意到：', dimension: 'SN', options: [
    { value: 'S', label: '环境中的具体细节' },
    { value: 'N', label: '事物之间的联系和模式' }
  ]},
  { id: 35, text: '您更喜欢：', dimension: 'SN', options: [
    { value: 'S', label: '具体明确的指示' },
    { value: 'N', label: '大致的方向和目标' }
  ]},
  { id: 36, text: '在学习新技能时，您：', dimension: 'SN', options: [
    { value: 'S', label: '喜欢从基础开始逐步学习' },
    { value: 'N', label: '喜欢先了解整体再学习细节' }
  ]},
  { id: 37, text: '您更欣赏：', dimension: 'SN', options: [
    { value: 'S', label: '实际有用的东西' },
    { value: 'N', label: '富有想象力的东西' }
  ]},
  { id: 38, text: '您更倾向于：', dimension: 'SN', options: [
    { value: 'S', label: '关注当下的现实' },
    { value: 'N', label: '思考未来的可能' }
  ]},
  { id: 39, text: '您认为自己：', dimension: 'SN', options: [
    { value: 'S', label: '实用主义者' },
    { value: 'N', label: '理想主义者' }
  ]},
  { id: 40, text: '您更重视工作中的：', dimension: 'SN', options: [
    { value: 'S', label: '具体的成果和效率' },
    { value: 'N', label: '创新的可能性和意义' }
  ]},
  { id: 41, text: '您更容易记住：', dimension: 'SN', options: [
    { value: 'S', label: '具体的事实和细节' },
    { value: 'N', label: '整体印象和概念' }
  ]},
  { id: 42, text: '在处理数据时，您：', dimension: 'SN', options: [
    { value: 'S', label: '专注于准确的数字和事实' },
    { value: 'N', label: '寻找数据背后的趋势和含义' }
  ]},
  { id: 43, text: '您更喜欢的学习方式：', dimension: 'SN', options: [
    { value: 'S', label: '通过实际操作和练习' },
    { value: 'N', label: '通过理论理解和概念学习' }
  ]},
  { id: 44, text: '您更擅长：', dimension: 'SN', options: [
    { value: 'S', label: '维护和改进现有系统' },
    { value: 'N', label: '设计和创造新的系统' }
  ]},
  { id: 45, text: '在制定计划时，您：', dimension: 'SN', options: [
    { value: 'S', label: '关注具体的步骤和资源' },
    { value: 'N', label: '关注总体愿景和可能性' }
  ]},
  { id: 46, text: '您更容易被以下内容激发：', dimension: 'SN', options: [
    { value: 'S', label: '实际的应用和即时收益' },
    { value: 'N', label: '未来的潜力和创新机会' }
  ]},
  { id: 47, text: '您的思维方式更倾向于：', dimension: 'SN', options: [
    { value: 'S', label: '线性的、按部就班的' },
    { value: 'N', label: '跳跃的、关联性的' }
  ]},
  { id: 48, text: '在观察事物时，您首先注意到：', dimension: 'SN', options: [
    { value: 'S', label: '具体的细节和特征' },
    { value: 'N', label: '整体模式和关联' }
  ]},

  // ========== 思维(T) vs 情感(F) - 23题 ==========
  { id: 49, text: '做决定时，您更看重：', dimension: 'TF', options: [
    { value: 'T', label: '逻辑和理性分析' },
    { value: 'F', label: '感受和价值观' }
  ]},
  { id: 50, text: '批评他人时，您：', dimension: 'TF', options: [
    { value: 'T', label: '直接指出问题，注重客观' },
    { value: 'F', label: '考虑对方感受，委婉表达' }
  ]},
  { id: 51, text: '您更重视：', dimension: 'TF', options: [
    { value: 'T', label: '公平和公正' },
    { value: 'F', label: '和谐和理解' }
  ]},
  { id: 52, text: '在冲突中，您：', dimension: 'TF', options: [
    { value: 'T', label: '专注于解决问题本身' },
    { value: 'F', label: '关注人际关系的影响' }
  ]},
  { id: 53, text: '您更容易：', dimension: 'TF', options: [
    { value: 'T', label: '保持客观和理性' },
    { value: 'F', label: '感同身受，产生共鸣' }
  ]},
  { id: 54, text: '在评价他人时，您：', dimension: 'TF', options: [
    { value: 'T', label: '基于能力和表现' },
    { value: 'F', label: '基于动机和努力' }
  ]},
  { id: 55, text: '您更看重：', dimension: 'TF', options: [
    { value: 'T', label: '真理和准确性' },
    { value: 'F', label: '善意和友好' }
  ]},
  { id: 56, text: '做选择时，您：', dimension: 'TF', options: [
    { value: 'T', label: '分析利弊得失' },
    { value: 'F', label: '考虑对相关人员的影响' }
  ]},
  { id: 57, text: '您更容易被：', dimension: 'TF', options: [
    { value: 'T', label: '逻辑论证说服' },
    { value: 'F', label: '情感诉求打动' }
  ]},
  { id: 58, text: '在团队中，您更关注：', dimension: 'TF', options: [
    { value: 'T', label: '任务的完成效率' },
    { value: 'F', label: '团队成员的感受' }
  ]},
  { id: 59, text: '您认为更重要的是：', dimension: 'TF', options: [
    { value: 'T', label: '坚持原则' },
    { value: 'F', label: '灵活变通' }
  ]},
  { id: 60, text: '面对他人的错误，您：', dimension: 'TF', options: [
    { value: 'T', label: '直接指出，帮助改正' },
    { value: 'F', label: '委婉提醒，避免伤害' }
  ]},
  { id: 61, text: '您更相信：', dimension: 'TF', options: [
    { value: 'T', label: '客观的标准和规则' },
    { value: 'F', label: '个人的价值观和信念' }
  ]},
  { id: 62, text: '在争论中，您：', dimension: 'TF', options: [
    { value: 'T', label: '坚持事实和逻辑' },
    { value: 'F', label: '努力维护关系和谐' }
  ]},
  { id: 63, text: '您更看重：', dimension: 'TF', options: [
    { value: 'T', label: '能力和成就' },
    { value: 'F', label: '品格和动机' }
  ]},
  { id: 64, text: '在分析问题时，您：', dimension: 'TF', options: [
    { value: 'T', label: '保持客观和距离感' },
    { value: 'F', label: '考虑个人和情感因素' }
  ]},
  { id: 65, text: '您更容易：', dimension: 'TF', options: [
    { value: 'T', label: '指出逻辑漏洞和不一致' },
    { value: 'F', label: '理解和包容不同观点' }
  ]},
  { id: 66, text: '在给出反馈时，您：', dimension: 'TF', options: [
    { value: 'T', label: '直接指出问题和改进点' },
    { value: 'F', label: '先肯定优点再提出建议' }
  ]},
  { id: 67, text: '您认为更重要的是：', dimension: 'TF', options: [
    { value: 'T', label: '效率和结果' },
    { value: 'F', label: '过程和人际关系' }
  ]},
  { id: 68, text: '面对他人的情绪，您：', dimension: 'TF', options: [
    { value: 'T', label: '试图理解原因并提供解决方案' },
    { value: 'F', label: '提供情感支持和理解' }
  ]},
  { id: 69, text: '在竞争环境中，您：', dimension: 'TF', options: [
    { value: 'T', label: '专注于赢得比赛' },
    { value: 'F', label: '关注所有参与者的感受' }
  ]},
  { id: 70, text: '您更相信：', dimension: 'TF', options: [
    { value: 'T', label: '客观的标准和规则' },
    { value: 'F', label: '情境化的判断和例外' }
  ]},
  { id: 71, text: '在做道德判断时，您：', dimension: 'TF', options: [
    { value: 'T', label: '基于原则和一致性' },
    { value: 'F', label: '基于情境和个人影响' }
  ]},

  // ========== 判断(J) vs 知觉(P) - 22题 ==========
  { id: 72, text: '您更喜欢：', dimension: 'JP', options: [
    { value: 'J', label: '有计划地进行工作' },
    { value: 'P', label: '保持灵活性和开放性' }
  ]},
  { id: 73, text: '您更喜欢：', dimension: 'JP', options: [
    { value: 'J', label: '事先安排好的活动' },
    { value: 'P', label: '临时决定的活动' }
  ]},
  { id: 74, text: '在项目中，您：', dimension: 'JP', options: [
    { value: 'J', label: '喜欢按计划稳步推进' },
    { value: 'P', label: '喜欢根据情况灵活调整' }
  ]},
  { id: 75, text: '您的工作风格：', dimension: 'JP', options: [
    { value: 'J', label: '提前完成，避免最后期限压力' },
    { value: 'P', label: '在截止日期前完成，享受时间压力' }
  ]},
  { id: 76, text: '面对变化，您：', dimension: 'JP', options: [
    { value: 'J', label: '希望尽快确定新的计划' },
    { value: 'P', label: '享受变化带来的新可能' }
  ]},
  { id: 77, text: '您的生活方式：', dimension: 'JP', options: [
    { value: 'J', label: '有规律，按计划进行' },
    { value: 'P', label: '灵活随性，顺其自然' }
  ]},
  { id: 78, text: '做决定时，您：', dimension: 'JP', options: [
    { value: 'J', label: '希望尽快做出决定' },
    { value: 'P', label: '希望保留更多选择' }
  ]},
  { id: 79, text: '您更喜欢：', dimension: 'JP', options: [
    { value: 'J', label: '明确的目标和期限' },
    { value: 'P', label: '开放的可能性和选择' }
  ]},
  { id: 80, text: '在旅行时，您：', dimension: 'JP', options: [
    { value: 'J', label: '制定详细的行程计划' },
    { value: 'P', label: '随心所欲，走到哪算哪' }
  ]},
  { id: 81, text: '您的房间/办公桌：', dimension: 'JP', options: [
    { value: 'J', label: '整洁有序，物品有固定位置' },
    { value: 'P', label: '可能有些凌乱，但知道东西在哪' }
  ]},
  { id: 82, text: '面对未完成的任务，您：', dimension: 'JP', options: [
    { value: 'J', label: '感到不安，想尽快完成' },
    { value: 'P', label: '比较放松，相信能按时完成' }
  ]},
  { id: 83, text: '您更喜欢：', dimension: 'JP', options: [
    { value: 'J', label: '有结构的学习和工作环境' },
    { value: 'P', label: '自由灵活的学习和工作环境' }
  ]},
  { id: 84, text: '在购物时，您：', dimension: 'JP', options: [
    { value: 'J', label: '列清单，按计划购买' },
    { value: 'P', label: '随意逛逛，看到喜欢的就买' }
  ]},
  { id: 85, text: '您认为：', dimension: 'JP', options: [
    { value: 'J', label: '计划是成功的关键' },
    { value: 'P', label: '适应性是成功的关键' }
  ]},
  { id: 86, text: '您更倾向于：', dimension: 'JP', options: [
    { value: 'J', label: '做决定后坚持执行' },
    { value: 'P', label: '根据新信息调整决定' }
  ]},
  { id: 87, text: '您的工作习惯：', dimension: 'JP', options: [
    { value: 'J', label: '定期检查进度，确保按计划进行' },
    { value: 'P', label: '根据灵感和状态调整工作节奏' }
  ]},
  { id: 88, text: '在处理多个任务时，您：', dimension: 'JP', options: [
    { value: 'J', label: '按优先级顺序逐一完成' },
    { value: 'P', label: '根据兴趣和状态灵活切换' }
  ]},
  { id: 89, text: '您更喜欢的学习环境：', dimension: 'JP', options: [
    { value: 'J', label: '有明确课程表和要求的' },
    { value: 'P', label: '自主选择内容和进度的' }
  ]},
  { id: 90, text: '面对截止日期，您：', dimension: 'JP', options: [
    { value: 'J', label: '提前完成，避免最后时刻的压力' },
    { value: 'P', label: '在压力下激发最佳状态' }
  ]},
  { id: 91, text: '您更喜欢的信息：', dimension: 'JP', options: [
    { value: 'J', label: '明确的结论和答案' },
    { value: 'P', label: '开放的讨论和探索' }
  ]},
  { id: 92, text: '在规划假期时，您：', dimension: 'JP', options: [
    { value: 'J', label: '提前几个月开始规划细节' },
    { value: 'P', label: '临近时根据心情决定' }
  ]},
  { id: 93, text: '您对变化的态度：', dimension: 'JP', options: [
    { value: 'J', label: '希望变化是有计划和可预期的' },
    { value: 'P', label: '欢迎突如其来的变化和机会' }
  ]}
];

// 维度映射（用于评分计算）
export const DIMENSION_MAPPING = {
  'EI': 'EI',  // 外向-内向
  'SN': 'SN',  // 感觉-直觉
  'TF': 'TF',  // 思维-情感
  'JP': 'JP'   // 判断-知觉
};

// 16种MBTI人格类型
export const MBTI_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',  // NT类型（建筑师、思想家、指挥官、辩论家）
  'INFJ', 'INFP', 'ENFJ', 'ENFP',  // NF类型（提倡者、调停者、主人公、竞选者）
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',  // SJ类型（物流师、守护者、总经理、执政官）
  'ISTP', 'ISFP', 'ESTP', 'ESFP'   // SP类型（鉴赏家、探险家、企业家、表演者）
];

// 维度顺序（用于报告展示）
export const DIMENSION_ORDER = ['EI', 'SN', 'TF', 'JP'];

