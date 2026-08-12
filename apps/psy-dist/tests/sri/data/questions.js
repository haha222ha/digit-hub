/**
 * SRI 性压抑指数评估量表 - 题目数据
 * 
 * SRI（Sexual Repression Index）综合了SIS/SES-SF、Mosher性罪恶感量表、KISS-9等国际经典测评工具
 * 共50题，分为4个维度，采用李克特5点量表评分
 */

// SRI 题目数据（50题）
export const QUESTIONS = [
  // A. 性态度与观念保守性（12题）
  { id: 1, text: '婚前性行为是不道德的。', dimension: 'A' },
  { id: 2, text: '谈论性话题让我不舒服。', dimension: 'A' },
  { id: 3, text: '性幻想是可耻的。', dimension: 'A' },
  { id: 4, text: '色情材料会腐蚀人的心灵。', dimension: 'A' },
  { id: 5, text: '性行为的目的应该是生育，而不是享乐。', dimension: 'A' },
  { id: 6, text: '在婚姻外发生性行为永远是错误的。', dimension: 'A' },
  { id: 7, text: '我认为性行为应该被严格限制在长期关系中。', dimension: 'A' },
  { id: 8, text: '对于别人讨论性的玩笑，我会感到不自在。', dimension: 'A' },
  { id: 9, text: '有性欲望会让我觉得"自己不够纯洁"。', dimension: 'A' },
  { id: 10, text: '性应该始终伴随爱。', dimension: 'A' },
  { id: 11, text: '我不赞同开放式关系。', dimension: 'A' },
  { id: 12, text: '如果伴侣要求新鲜的性尝试，我会感到抵触。', dimension: 'A' },
  
  // B. 性焦虑与罪恶感（12题）
  { id: 13, text: '当我有性冲动时，会觉得自己在犯错。', dimension: 'B' },
  { id: 14, text: '性幻想让我感到不安。', dimension: 'B' },
  { id: 15, text: '如果别人知道我的性兴趣，我会感到羞耻。', dimension: 'B' },
  { id: 16, text: '即使在安全的情况下，我也会担心性行为带来严重后果。', dimension: 'B' },
  { id: 17, text: '我认为性欲是低级的。', dimension: 'B' },
  { id: 18, text: '性行为之后，我常常会后悔。', dimension: 'B' },
  { id: 19, text: '当伴侣主动时，我会感到紧张。', dimension: 'B' },
  { id: 20, text: '如果我在亲密接触中享受快感，我会觉得内疚。', dimension: 'B' },
  { id: 21, text: '宗教或道德信念让我不敢表达性需求。', dimension: 'B' },
  { id: 22, text: '我曾经因为性想法责备自己。', dimension: 'B' },
  { id: 23, text: '当别人暗示性时，我会立即回避。', dimension: 'B' },
  { id: 24, text: '我觉得"谈论性"本身就是不洁的。', dimension: 'B' },
  
  // C. 性抑制（14题）
  { id: 25, text: '如果担心被人发现，我会抑制性行为。', dimension: 'C' },
  { id: 26, text: '害怕失控让我难以投入性体验。', dimension: 'C' },
  { id: 27, text: '我常因顾虑而避免亲密行为。', dimension: 'C' },
  { id: 28, text: '担心怀孕会让我很难放松享受性。', dimension: 'C' },
  { id: 29, text: '我害怕在性关系中表现不好。', dimension: 'C' },
  { id: 30, text: '如果想到别人会评判，我就无法进入状态。', dimension: 'C' },
  { id: 31, text: '当我担心被伴侣看轻时，我会失去欲望。', dimension: 'C' },
  { id: 32, text: '即使有避孕措施，我仍然不敢完全放开。', dimension: 'C' },
  { id: 33, text: '性过程中我容易分心，担心各种后果。', dimension: 'C' },
  { id: 34, text: '我害怕在性中失去对自己身体的掌控。', dimension: 'C' },
  { id: 35, text: '当压力大时，我完全没有性欲。', dimension: 'C' },
  { id: 36, text: '担心疾病会让我避免性行为。', dimension: 'C' },
  { id: 37, text: '我会因为焦虑而中断性行为。', dimension: 'C' },
  { id: 38, text: '性唤起常常被我自己压下去。', dimension: 'C' },
  
  // D. 性脚本与行为开放性（12题）
  { id: 39, text: '性行为应该由男性主导。', dimension: 'D' },
  { id: 40, text: '女性如果主动追求性，是不正当的。', dimension: 'D' },
  { id: 41, text: '性行为更多是一种责任而不是享乐。', dimension: 'D' },
  { id: 42, text: '我认为浪漫比性欲更重要。', dimension: 'D' },
  { id: 43, text: '在性中追求多样化是轻浮的。', dimension: 'D' },
  { id: 44, text: '伴侣要求非传统的行为，我会觉得不安。', dimension: 'D' },
  { id: 45, text: '性应该被限制在特定的情境（婚姻、长期关系）。', dimension: 'D' },
  { id: 46, text: '我更倾向于"安稳的性"，而不是尝试新鲜。', dimension: 'D' },
  { id: 47, text: '我认为性行为主要是为了满足对方，而不是自己。', dimension: 'D' },
  { id: 48, text: '性行为必须符合社会认可的方式。', dimension: 'D' },
  { id: 49, text: '自我探索（自慰）是不必要的，甚至有害。', dimension: 'D' },
  { id: 50, text: '性应该始终被严格控制。', dimension: 'D' }
];

// SRI 评分选项（李克特5点量表）
export const OPTIONS = [
  { value: 1, label: '完全同意' },
  { value: 2, label: '比较同意' },
  { value: 3, label: '既不同意也不反对' },
  { value: 4, label: '比较不同意' },
  { value: 5, label: '完全不同意' }
];

// SRI 维度映射（题目索引从0开始）
export const DIMENSION_MAPPING = {
  // A. 性态度与观念保守性（12题）- 题目1-12（索引0-11）
  'A': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  
  // B. 性焦虑与罪恶感（12题）- 题目13-24（索引12-23）
  'B': [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
  
  // C. 性抑制（14题）- 题目25-38（索引24-37）
  'C': [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37],
  
  // D. 性脚本与行为开放性（12题）- 题目39-50（索引38-49）
  'D': [38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49]
};

// 维度名称映射（中文）
export const DIMENSION_NAMES = {
  'A': '性态度与观念保守性',
  'B': '性焦虑与罪恶感',
  'C': '性抑制',
  'D': '性脚本与行为开放性'
};

// 维度顺序（用于报告展示）
export const DIMENSION_ORDER = ['A', 'B', 'C', 'D'];

