/**
 * DarkTriad 黑暗三角人格测试 - 题目数据
 * 
 * 基于Moshagen et al. (2018) D因子理论，采用70题Likert量表
 * 评估10个黑暗人格维度及D因子核心指标
 * 共70题，每个维度7题，部分题目为反向计分题
 */

// DarkTriad 题目数据（70题）
export const QUESTIONS = [
  // 1. Egoism 利己主义 (7题)
  { id: 1, text: '我的快乐是最重要的。', dimension: 'Egoism', reverse: false },
  { id: 2, text: '你要确保你的计划只会让你受益，而不会让其他人受益。', dimension: 'Egoism', reverse: false },
  { id: 3, text: '我尽量先为自己着想，即使这意味着让别人的日子不好过。', dimension: 'Egoism', reverse: false },
  { id: 4, text: '我愿意帮助那些需要帮助的人。', dimension: 'Egoism', reverse: true },
  { id: 5, text: '如果我想要的东西会给别人带来麻烦，那我就会放弃它。', dimension: 'Egoism', reverse: true },
  { id: 6, text: '在追求目标的过程中，我会尽量避免伤害别人。', dimension: 'Egoism', reverse: true },
  { id: 7, text: '有时候付出一些代价帮助别人是值得的。', dimension: 'Egoism', reverse: true },

  // 2. Machiavellianism 马基雅维利主义 (7题)
  { id: 8, text: '永远不要告诉任何人你做一件事情的真正原因，除非这么做是有用的。', dimension: 'Machiavellianism', reverse: false },
  { id: 9, text: '如果不处处抄近路，一个人就很难获得优势。', dimension: 'Machiavellianism', reverse: false },
  { id: 10, text: '一个人应该利用所有能够利用的条件来增强自己的优势，但要确保不要让别人发现。', dimension: 'Machiavellianism', reverse: false },
  { id: 11, text: '保留一些日后可以用来对付别人的信息是非常明智的。', dimension: 'Machiavellianism', reverse: false },
  { id: 12, text: '我相信为了保持比别人更具竞争性，撒谎是必要的。', dimension: 'Machiavellianism', reverse: false },
  { id: 13, text: '为了得到我想要的东西，我愿意说任何话。', dimension: 'Machiavellianism', reverse: false },
  { id: 14, text: '即使在被抓的概率很小的情况下，我也不会欺骗别人。', dimension: 'Machiavellianism', reverse: true },

  // 3. Moral Disengagement 道德推脱 (7题)
  { id: 15, text: '粗鲁地对待像人渣一样的人是可以的。', dimension: 'MoralDisengagement', reverse: false },
  { id: 16, text: '受到不公平对待的人往往会做一些事情让他们陷入不公正的对待的恶性循环中。', dimension: 'MoralDisengagement', reverse: false },
  { id: 17, text: '做好事不求回报，只会让被帮助的人变得凄惨和懒惰。', dimension: 'MoralDisengagement', reverse: false },
  { id: 18, text: '关于诚实和善良的故事只会让人感到困惑、变得愚蠢。', dimension: 'MoralDisengagement', reverse: false },
  { id: 19, text: '用别人的主意邀功请赏是绝对不行的。', dimension: 'MoralDisengagement', reverse: true },
  { id: 20, text: '如果一个通往成功的捷径是违法的，那么采取它就是不明智的。', dimension: 'MoralDisengagement', reverse: true },
  { id: 21, text: '不管法律如何妨碍一个人的雄心壮志，他/她也应该遵守法律。', dimension: 'MoralDisengagement', reverse: true },

  // 4. Narcissism 自恋 (7题)
  { id: 22, text: '大部分人从某种意义上来说都是失败者。', dimension: 'Narcissism', reverse: false },
  { id: 23, text: '我绝对容忍不了除我以外的另一个人成为被关注的焦点。', dimension: 'Narcissism', reverse: false },
  { id: 24, text: '我不追求权力。', dimension: 'Narcissism', reverse: true },
  { id: 25, text: '我不介意和别人分享舞台。', dimension: 'Narcissism', reverse: true },
  { id: 26, text: '大部分人都值得被尊重。', dimension: 'Narcissism', reverse: true },
  { id: 27, text: '总而言之，做一个谦虚诚实的人比做一个自大而不诚实的人更好。', dimension: 'Narcissism', reverse: true },
  { id: 28, text: '大部分人本性都是善良的。', dimension: 'Narcissism', reverse: true },

  // 5. Psychological Entitlement 心理权力感 (7题)
  { id: 29, text: '如果我在泰坦尼克号上，我不觉得自己比其他人更具有上第一艘救生船的优先权。', dimension: 'PsychologicalEntitlement', reverse: true },
  { id: 30, text: '我并不比别人值得拥有更多的东西。', dimension: 'PsychologicalEntitlement', reverse: true },
  { id: 31, text: '事情不可能总是按照我想要的方式发展。', dimension: 'PsychologicalEntitlement', reverse: true },
  { id: 32, text: '人人生而平等。', dimension: 'PsychologicalEntitlement', reverse: true },
  { id: 33, text: '如果邻居抱怨我放音乐的声音太大了，尽管不情愿，但我仍旧会把音乐声音调小。', dimension: 'PsychologicalEntitlement', reverse: true },
  { id: 34, text: '赚钱之道不分对错，只分难易。', dimension: 'PsychologicalEntitlement', reverse: false },
  { id: 35, text: '如果你的某一笔交易在账上有一个错误，但这个错误对你有利，那么你不告诉对方也没关系，因为是他们的过失。', dimension: 'PsychologicalEntitlement', reverse: false },

  // 6. Psychopathy 精神病质 (7题)
  { id: 36, text: '我并不同情其他人或者他们的遭遇。', dimension: 'Psychopathy', reverse: false },
  { id: 37, text: '我并不在意那些失败的人，因为胜者为王，败者为寇。', dimension: 'Psychopathy', reverse: false },
  { id: 38, text: '伤害别人会让我很不舒服。', dimension: 'Psychopathy', reverse: true },
  { id: 39, text: '做好事会让我由衷地感到开心。', dimension: 'Psychopathy', reverse: true },
  { id: 40, text: '我痛恨看到别人受伤害。', dimension: 'Psychopathy', reverse: true },
  { id: 41, text: '我不忍心看到别人遭遇不幸。', dimension: 'Psychopathy', reverse: true },
  { id: 42, text: '如果我做的事情让人难过，我会感到很抱歉。', dimension: 'Psychopathy', reverse: true },

  // 7. Sadism 施虐倾向 (7题)
  { id: 43, text: '当我烦恼的时候，折磨别人能让我感觉好点。', dimension: 'Sadism', reverse: false },
  { id: 44, text: '我会考虑用强迫别人的方式来获取快乐。', dimension: 'Sadism', reverse: false },
  { id: 45, text: '我难以想象，残忍地对待别人居然能给人带来快感。', dimension: 'Sadism', reverse: true },
  { id: 46, text: '如果我曾经折磨过别人，我将会非常后悔。', dimension: 'Sadism', reverse: true },
  { id: 47, text: '我避免羞辱别人。', dimension: 'Sadism', reverse: true },
  { id: 48, text: '让其他人觉得自己很糟糕并不会让我感觉良好。', dimension: 'Sadism', reverse: true },
  { id: 49, text: '我并不享受控制别人的情感。', dimension: 'Sadism', reverse: true },

  // 8. Self-Interest 自我为中心 (7题)
  { id: 50, text: '我都没有人关心，为什么要关心别人？', dimension: 'SelfInterest', reverse: false },
  { id: 51, text: '看到我的对手失败，我并不会很开心。', dimension: 'SelfInterest', reverse: true },
  { id: 52, text: '如果我反对选举一个官员，即使这个人落选对我的社区不利，看到他/她落选我仍旧很开心。', dimension: 'SelfInterest', reverse: false },
  { id: 53, text: '我不想让别人害怕我本人或者我的念头。', dimension: 'SelfInterest', reverse: true },
  { id: 54, text: '我并不在意拥有控制别人的权力。', dimension: 'SelfInterest', reverse: true },
  { id: 55, text: '和我作对的人必定会后悔。', dimension: 'SelfInterest', reverse: false },
  { id: 56, text: '明智的人总是知道如何在合适的时间对合适的人说合适的话，以此来击败那些曾经冒犯过自己的人。', dimension: 'SelfInterest', reverse: false },

  // 9. Spitefulness 恶毒倾向 (7题)
  { id: 57, text: '就算我得和某些人共同下地狱，我也要让他们受尽苦难。', dimension: 'Spitefulness', reverse: false },
  { id: 58, text: '有时候，为了惩罚那些应该被惩罚的人，我宁愿自己受点小伤害。', dimension: 'Spitefulness', reverse: false },
  { id: 59, text: '深谋远虑的复仇更让人有成就感。', dimension: 'Spitefulness', reverse: false },
  { id: 60, text: '报复需要快而狠。', dimension: 'Spitefulness', reverse: false },
  { id: 61, text: '伤害我的人休想得到我的怜悯。', dimension: 'Spitefulness', reverse: false },
  { id: 62, text: '如果有机会，我很乐意付一小笔钱来换取我讨厌的那个同学考试挂科。', dimension: 'Spitefulness', reverse: false },
  { id: 63, text: '我愿意用自己被打一拳来换取我讨厌的人被打两拳。', dimension: 'Spitefulness', reverse: false },

  // 10. Greed 贪婪 (7题)
  { id: 64, text: '不管我拥有多少，我从来都不满足。', dimension: 'Greed', reverse: false },
  { id: 65, text: '不管我拥有多少，我总是想得到更多。', dimension: 'Greed', reverse: false },
  { id: 66, text: '事实上，我有点贪婪。', dimension: 'Greed', reverse: false },
  { id: 67, text: '报复很难给我带来慰藉。', dimension: 'Greed', reverse: true },
  { id: 68, text: '凡事皆有够了的时候。', dimension: 'Greed', reverse: true },
  { id: 69, text: '我倾向于原谅自己受过的委屈。', dimension: 'Greed', reverse: true },
  { id: 70, text: '即便是为了保护那些你在意的人，你也不应该散布谎言。', dimension: 'Greed', reverse: true }
];

// DarkTriad 评分选项（李克特5点量表）
export const OPTIONS = [
  { value: 1, label: '完全不同意' },
  { value: 2, label: '比较不同意' },
  { value: 3, label: '中立' },
  { value: 4, label: '比较同意' },
  { value: 5, label: '完全同意' }
];

// DarkTriad 维度映射（题目索引从0开始）
export const DIMENSION_MAPPING = {
  // Egoism 利己主义（7题）- 题目1-7（索引0-6）
  'Egoism': [0, 1, 2, 3, 4, 5, 6],
  
  // Machiavellianism 马基雅维利主义（7题）- 题目8-14（索引7-13）
  'Machiavellianism': [7, 8, 9, 10, 11, 12, 13],
  
  // Moral Disengagement 道德推脱（7题）- 题目15-21（索引14-20）
  'MoralDisengagement': [14, 15, 16, 17, 18, 19, 20],
  
  // Narcissism 自恋（7题）- 题目22-28（索引21-27）
  'Narcissism': [21, 22, 23, 24, 25, 26, 27],
  
  // Psychological Entitlement 心理权力感（7题）- 题目29-35（索引28-34）
  'PsychologicalEntitlement': [28, 29, 30, 31, 32, 33, 34],
  
  // Psychopathy 精神病质（7题）- 题目36-42（索引35-41）
  'Psychopathy': [35, 36, 37, 38, 39, 40, 41],
  
  // Sadism 施虐倾向（7题）- 题目43-49（索引42-48）
  'Sadism': [42, 43, 44, 45, 46, 47, 48],
  
  // Self-Interest 自我为中心（7题）- 题目50-56（索引49-55）
  'SelfInterest': [49, 50, 51, 52, 53, 54, 55],
  
  // Spitefulness 恶毒倾向（7题）- 题目57-63（索引56-62）
  'Spitefulness': [56, 57, 58, 59, 60, 61, 62],
  
  // Greed 贪婪（7题）- 题目64-70（索引63-69）
  'Greed': [63, 64, 65, 66, 67, 68, 69]
};

// 维度名称映射（中文）
export const DIMENSION_NAMES = {
  'Egoism': '利己主义',
  'Machiavellianism': '马基雅维利主义',
  'MoralDisengagement': '道德推脱',
  'Narcissism': '自恋',
  'PsychologicalEntitlement': '心理权力感',
  'Psychopathy': '精神病质',
  'Sadism': '施虐倾向',
  'SelfInterest': '自我为中心',
  'Spitefulness': '恶毒倾向',
  'Greed': '贪婪'
};

// 维度顺序（用于报告展示）
export const DIMENSION_ORDER = [
  'Egoism',
  'Machiavellianism',
  'MoralDisengagement',
  'Narcissism',
  'PsychologicalEntitlement',
  'Psychopathy',
  'Sadism',
  'SelfInterest',
  'Spitefulness',
  'Greed'
];

// 反向计分题目映射（题目索引从0开始）
export const REVERSE_SCORING_MAP = {};
QUESTIONS.forEach((question, index) => {
  if (question.reverse) {
    REVERSE_SCORING_MAP[index] = true;
  }
});

