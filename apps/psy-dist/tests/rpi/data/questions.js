/**
 * RPI 恋爱占有欲指数测试 - 题目数据
 * 
 * RPI（Relationship Possessiveness Index）恋爱占有欲指数测试
 * 评估在恋爱关系中的占有欲、控制欲、嫉妒等心理特质
 * 共40题，分为4个维度，每个维度10题
 * 支持双视角：self（给自己测）、partner（为恋人测）
 */

// 选项定义（李克特量表）
export const OPTIONS_5_AGREE = [
  { value: 1, label: '非常不同意' },
  { value: 2, label: '不同意' },
  { value: 3, label: '中性' },
  { value: 4, label: '同意' },
  { value: 5, label: '非常同意' }
];

export const OPTIONS_5_FREQUENCY = [
  { value: 1, label: '从不' },
  { value: 2, label: '很少' },
  { value: 3, label: '有时' },
  { value: 4, label: '经常' },
  { value: 5, label: '总是' }
];

export const OPTIONS_3_FREQUENCY = [
  { value: 1, label: '从不' },
  { value: 3, label: '有时' },
  { value: 5, label: '总是' }
];

// 给自己测的题目（40题）
export const SELF_QUESTIONS = [
  // 一、控制欲望量表（10题）
  { id: 1, text: '我经常想知道伴侣在做什么', dimension: 'control', options: OPTIONS_5_AGREE },
  { id: 2, text: '我希望伴侣把大部分空闲时间都花在我身上', dimension: 'control', options: OPTIONS_5_AGREE },
  { id: 3, text: '我不喜欢伴侣和其他异性单独相处', dimension: 'control', options: OPTIONS_5_AGREE },
  { id: 4, text: '我会查看伴侣的手机或社交媒体', dimension: 'control', options: OPTIONS_5_FREQUENCY },
  { id: 5, text: '我希望了解伴侣所有的行程安排', dimension: 'control', options: OPTIONS_5_AGREE },
  { id: 6, text: '如果伴侣没及时回复我的消息,我会感到不安', dimension: 'control', options: OPTIONS_5_AGREE },
  { id: 7, text: '我会限制伴侣与朋友外出的频率', dimension: 'control', options: OPTIONS_5_FREQUENCY },
  { id: 8, text: '我认为伴侣应该把我放在第一位', dimension: 'control', options: OPTIONS_5_AGREE },
  { id: 9, text: '我希望参与伴侣的所有决定', dimension: 'control', options: OPTIONS_5_AGREE },
  { id: 10, text: '我不喜欢伴侣有太多独立的社交圈', dimension: 'control', options: OPTIONS_5_AGREE },

  // 二、嫉妒强度量表（10题）
  { id: 11, text: '当伴侣和异性说话时,我会感到嫉妒', dimension: 'jealousy', options: OPTIONS_5_FREQUENCY },
  { id: 12, text: '我会因为伴侣与异性的互动而感到不快', dimension: 'jealousy', options: OPTIONS_5_AGREE },
  { id: 13, text: '看到伴侣和前任的照片或消息会让我不舒服', dimension: 'jealousy', options: OPTIONS_5_AGREE },
  { id: 14, text: '我会嫉妒占据伴侣时间的人或事', dimension: 'jealousy', options: OPTIONS_5_FREQUENCY },
  { id: 15, text: '当伴侣称赞其他人时,我会感到不快', dimension: 'jealousy', options: OPTIONS_5_FREQUENCY },
  { id: 16, text: '我经常想象伴侣可能出轨的场景', dimension: 'jealousy', options: OPTIONS_5_FREQUENCY },
  { id: 17, text: '伴侣对别人表现出兴趣会让我感到威胁', dimension: 'jealousy', options: OPTIONS_5_AGREE },
  { id: 18, text: '我会因为嫉妒而质问伴侣', dimension: 'jealousy', options: OPTIONS_5_FREQUENCY },
  { id: 19, text: '伴侣单独赴约会让我感到不安', dimension: 'jealousy', options: OPTIONS_5_AGREE },
  { id: 20, text: '我会把伴侣与别人的关系看作是对我们关系的威胁', dimension: 'jealousy', options: OPTIONS_5_FREQUENCY },

  // 三、情感依赖量表（10题）
  { id: 21, text: '没有伴侣在身边时,我会感到不完整', dimension: 'dependency', options: OPTIONS_5_AGREE },
  { id: 22, text: '我的情绪很大程度上取决于伴侣的态度', dimension: 'dependency', options: OPTIONS_5_AGREE },
  { id: 23, text: '我难以想象没有伴侣的生活', dimension: 'dependency', options: OPTIONS_5_AGREE },
  { id: 24, text: '我需要经常得到伴侣的关注和肯定', dimension: 'dependency', options: OPTIONS_5_AGREE },
  { id: 25, text: '独处时我会感到焦虑', dimension: 'dependency', options: OPTIONS_5_FREQUENCY },
  { id: 26, text: '我很难独立做出重要决定', dimension: 'dependency', options: OPTIONS_5_AGREE },
  { id: 27, text: '伴侣是我生活的中心', dimension: 'dependency', options: OPTIONS_5_AGREE },
  { id: 28, text: '失去这段关系会让我崩溃', dimension: 'dependency', options: OPTIONS_5_AGREE },
  { id: 29, text: '当伴侣忙于工作或学习时,我会感到被冷落', dimension: 'dependency', options: OPTIONS_5_AGREE },
  { id: 30, text: '我会因为伴侣而放弃自己的兴趣爱好', dimension: 'dependency', options: OPTIONS_5_FREQUENCY },

  // 四、关系不安全感量表（10题）
  { id: 31, text: '我担心伴侣会离开我', dimension: 'insecurity', options: OPTIONS_5_FREQUENCY },
  { id: 32, text: '我觉得自己不够好配不上伴侣', dimension: 'insecurity', options: OPTIONS_5_AGREE },
  { id: 33, text: '我担心伴侣会找到更好的人', dimension: 'insecurity', options: OPTIONS_5_FREQUENCY },
  { id: 34, text: '伴侣的一个小变化就会让我怀疑Ta的感情', dimension: 'insecurity', options: OPTIONS_5_AGREE },
  { id: 35, text: '我需要不断确认伴侣是否还爱我', dimension: 'insecurity', options: OPTIONS_5_FREQUENCY },
  { id: 36, text: '我害怕被抛弃', dimension: 'insecurity', options: OPTIONS_5_AGREE },
  { id: 37, text: '我对这段关系的未来感到不确定', dimension: 'insecurity', options: OPTIONS_5_AGREE },
  { id: 38, text: '我担心伴侣对我的爱不如我对Ta的爱深', dimension: 'insecurity', options: OPTIONS_5_AGREE },
  { id: 39, text: '伴侣的冷淡会让我陷入恐慌', dimension: 'insecurity', options: OPTIONS_5_AGREE },
  { id: 40, text: '我经常担心这段关系会突然结束', dimension: 'insecurity', options: OPTIONS_5_FREQUENCY }
];

// 为恋人测的题目（观察视角，40题）
export const PARTNER_QUESTIONS = [
  // 一、控制欲望量表（10题）- 恋人版
  { id: 1, text: 'Ta经常想知道我在做什么', dimension: 'control', options: OPTIONS_5_AGREE },
  { id: 2, text: 'Ta希望我把大部分空闲时间都花在Ta身上', dimension: 'control', options: OPTIONS_5_AGREE },
  { id: 3, text: 'Ta不喜欢我和其他异性单独相处', dimension: 'control', options: OPTIONS_5_AGREE },
  { id: 4, text: 'Ta会查看我的手机或社交媒体', dimension: 'control', options: OPTIONS_5_FREQUENCY },
  { id: 5, text: 'Ta希望了解我所有的行程安排', dimension: 'control', options: OPTIONS_5_AGREE },
  { id: 6, text: '如果我没及时回复Ta的消息,Ta会感到不安', dimension: 'control', options: OPTIONS_5_AGREE },
  { id: 7, text: 'Ta会限制我与朋友外出的频率', dimension: 'control', options: OPTIONS_5_FREQUENCY },
  { id: 8, text: 'Ta认为我应该把Ta放在第一位', dimension: 'control', options: OPTIONS_5_AGREE },
  { id: 9, text: 'Ta希望能够参与我的所有决定', dimension: 'control', options: OPTIONS_5_AGREE },
  { id: 10, text: 'Ta不喜欢我有太多独立的社交圈', dimension: 'control', options: OPTIONS_5_AGREE },

  // 二、嫉妒强度量表（10题）- 恋人版
  { id: 11, text: '当我和异性说话时,Ta会感到嫉妒', dimension: 'jealousy', options: OPTIONS_5_FREQUENCY },
  { id: 12, text: 'Ta担心我会被别人吸引', dimension: 'jealousy', options: OPTIONS_5_AGREE },
  { id: 13, text: '看到我和前任的照片或消息会让Ta不舒服', dimension: 'jealousy', options: OPTIONS_5_AGREE },
  { id: 14, text: 'Ta会嫉妒占据我时间的人或事', dimension: 'jealousy', options: OPTIONS_5_FREQUENCY },
  { id: 15, text: '当我称赞其他人时,Ta会感到不快', dimension: 'jealousy', options: OPTIONS_5_FREQUENCY },
  { id: 16, text: 'Ta经常想象我可能出轨的场景', dimension: 'jealousy', options: OPTIONS_5_FREQUENCY },
  { id: 17, text: '我对别人表现出兴趣会让Ta感到威胁', dimension: 'jealousy', options: OPTIONS_5_AGREE },
  { id: 18, text: 'Ta会因为嫉妒而质问我', dimension: 'jealousy', options: OPTIONS_5_FREQUENCY },
  { id: 19, text: '我单独赴约会让Ta感到不安', dimension: 'jealousy', options: OPTIONS_5_AGREE },
  { id: 20, text: 'Ta会把我与别人的关系看作是对我们关系的威胁', dimension: 'jealousy', options: OPTIONS_5_FREQUENCY },

  // 三、情感依赖量表（10题）- 恋人版
  { id: 21, text: '没有我在身边时,Ta会感到不完整', dimension: 'dependency', options: OPTIONS_5_AGREE },
  { id: 22, text: 'Ta的情绪很大程度上取决于我的态度', dimension: 'dependency', options: OPTIONS_5_AGREE },
  { id: 23, text: 'Ta难以想象没有我的生活', dimension: 'dependency', options: OPTIONS_5_AGREE },
  { id: 24, text: 'Ta需要经常得到我的关注和肯定', dimension: 'dependency', options: OPTIONS_5_AGREE },
  { id: 25, text: '当我不在时,Ta会感到焦虑', dimension: 'dependency', options: OPTIONS_5_FREQUENCY },
  { id: 26, text: 'Ta很难独立做出重要决定', dimension: 'dependency', options: OPTIONS_5_AGREE },
  { id: 27, text: '我是Ta生活的中心', dimension: 'dependency', options: OPTIONS_5_AGREE },
  { id: 28, text: '失去这段关系会让Ta崩溃', dimension: 'dependency', options: OPTIONS_5_AGREE },
  { id: 29, text: '当我忙于工作或学习时,Ta会感到被冷落', dimension: 'dependency', options: OPTIONS_5_AGREE },
  { id: 30, text: 'Ta会因为我而放弃自己的兴趣爱好', dimension: 'dependency', options: OPTIONS_5_FREQUENCY },

  // 四、关系不安全感量表（10题）- 恋人版
  { id: 31, text: 'Ta担心我会离开Ta', dimension: 'insecurity', options: OPTIONS_5_FREQUENCY },
  { id: 32, text: 'Ta觉得自己不够好配不上我', dimension: 'insecurity', options: OPTIONS_5_AGREE },
  { id: 33, text: 'Ta担心我会找到更好的人', dimension: 'insecurity', options: OPTIONS_5_FREQUENCY },
  { id: 34, text: '我的一个小变化就会让Ta怀疑我的感情', dimension: 'insecurity', options: OPTIONS_5_AGREE },
  { id: 35, text: 'Ta需要不断确认我是否还爱Ta', dimension: 'insecurity', options: OPTIONS_5_FREQUENCY },
  { id: 36, text: 'Ta害怕被抛弃', dimension: 'insecurity', options: OPTIONS_5_AGREE },
  { id: 37, text: 'Ta对这段关系的未来感到不确定', dimension: 'insecurity', options: OPTIONS_5_AGREE },
  { id: 38, text: 'Ta担心我对Ta的爱不如Ta对我的爱深', dimension: 'insecurity', options: OPTIONS_5_AGREE },
  { id: 39, text: '我的冷淡会让Ta陷入恐慌', dimension: 'insecurity', options: OPTIONS_5_AGREE },
  { id: 40, text: 'Ta经常担心这段关系会突然结束', dimension: 'insecurity', options: OPTIONS_5_FREQUENCY }
];

// 维度信息
export const DIMENSIONS = {
  control: {
    name: '控制欲望',
    icon: '🎯',
    description: '评估在恋爱关系中对伴侣的控制倾向和监控行为',
    color: '#E92063'
  },
  jealousy: {
    name: '嫉妒强度',
    icon: '💔',
    description: '测量在恋爱关系中的嫉妒情绪和排他性倾向',
    color: '#E64D66'
  },
  dependency: {
    name: '情感依赖',
    icon: '💞',
    description: '评估对伴侣的情感依赖程度和独立性水平',
    color: '#D92680'
  },
  insecurity: {
    name: '关系不安',
    icon: '😰',
    description: '测量在亲密关系中的不安全感和焦虑程度',
    color: '#3C83F6'
  }
};

// 维度顺序（用于报告展示）
export const DIMENSION_ORDER = ['control', 'jealousy', 'dependency', 'insecurity'];

// 维度映射（题目索引从0开始，每个维度10题）
export const DIMENSION_MAPPING = {
  // control 控制欲望（10题）- 题目1-10（索引0-9）
  'control': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  
  // jealousy 嫉妒强度（10题）- 题目11-20（索引10-19）
  'jealousy': [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  
  // dependency 情感依赖（10题）- 题目21-30（索引20-29）
  'dependency': [20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
  
  // insecurity 关系不安（10题）- 题目31-40（索引30-39）
  'insecurity': [30, 31, 32, 33, 34, 35, 36, 37, 38, 39]
};

// 维度名称映射（中文）
export const DIMENSION_NAMES = {
  'control': '控制欲望',
  'jealousy': '嫉妒强度',
  'dependency': '情感依赖',
  'insecurity': '关系不安'
};

/**
 * 根据type（self/partner）获取题目列表
 * @param {string} type - 测试类型：'self' 或 'partner'
 * @returns {Array} 题目数组
 */
export function getQuestions(type) {
  return type === 'partner' ? PARTNER_QUESTIONS : SELF_QUESTIONS;
}

/**
 * 获取题目所属维度信息
 * @param {number} questionId - 题目ID
 * @param {string} type - 测试类型：'self' 或 'partner'
 * @returns {Object|null} 维度信息对象或null
 */
export function getQuestionDimension(questionId, type = 'self') {
  const questions = type === 'partner' ? PARTNER_QUESTIONS : SELF_QUESTIONS;
  const question = questions.find(q => q.id === questionId);
  return question ? DIMENSIONS[question.dimension] : null;
}

