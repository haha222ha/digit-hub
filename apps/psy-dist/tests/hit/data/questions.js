/**
 * Holland 霍兰德职业兴趣测试 - 题目数据
 * 
 * 霍兰德职业兴趣测试基于RIASEC理论，共90题，分为6个维度
 * 每个维度15题，采用二元选择（喜欢/不喜欢）
 */

// Holland 题目数据（90题）
export const QUESTIONS = [
  // R - 实际型 (题目1-15)
  { id: 1, text: '我喜欢动手操作工具和机器', dimension: 'R' },
  { id: 2, text: '我擅长修理东西', dimension: 'R' },
  { id: 3, text: '我对机械原理很感兴趣', dimension: 'R' },
  { id: 4, text: '我喜欢户外工作', dimension: 'R' },
  { id: 5, text: '我享受体力劳动带来的成就感', dimension: 'R' },
  { id: 6, text: '我对建筑和工程技术感兴趣', dimension: 'R' },
  { id: 7, text: '我擅长使用各种工具', dimension: 'R' },
  { id: 8, text: '我喜欢实际动手解决问题', dimension: 'R' },
  { id: 9, text: '我对计算机硬件和电子设备感兴趣', dimension: 'R' },
  { id: 10, text: '我愿意从事需要体力的工作', dimension: 'R' },
  { id: 11, text: '我喜欢组装或拆卸东西', dimension: 'R' },
  { id: 12, text: '我对农业和园艺感兴趣', dimension: 'R' },
  { id: 13, text: '我擅长操作机械设备', dimension: 'R' },
  { id: 14, text: '我喜欢从事制造或生产相关的工作', dimension: 'R' },
  { id: 15, text: '我对汽车维修和保养感兴趣', dimension: 'R' },

  // I - 研究型 (题目16-30)
  { id: 16, text: '我喜欢研究和探索未知的事物', dimension: 'I' },
  { id: 17, text: '我擅长分析复杂的问题', dimension: 'I' },
  { id: 18, text: '我对科学研究很感兴趣', dimension: 'I' },
  { id: 19, text: '我喜欢阅读科学或技术类书籍', dimension: 'I' },
  { id: 20, text: '我善于逻辑推理', dimension: 'I' },
  { id: 21, text: '我对医学或生物学感兴趣', dimension: 'I' },
  { id: 22, text: '我喜欢独立思考问题', dimension: 'I' },
  { id: 23, text: '我擅长数学和数据分析', dimension: 'I' },
  { id: 24, text: '我对新理论和新观点很感兴趣', dimension: 'I' },
  { id: 25, text: '我喜欢做实验和研究', dimension: 'I' },
  { id: 26, text: '我善于发现事物之间的规律', dimension: 'I' },
  { id: 27, text: '我对天文学或物理学感兴趣', dimension: 'I' },
  { id: 28, text: '我喜欢解决抽象的问题', dimension: 'I' },
  { id: 29, text: '我擅长进行系统性的研究', dimension: 'I' },
  { id: 30, text: '我对化学或环境科学感兴趣', dimension: 'I' },

  // A - 艺术型 (题目31-45)
  { id: 31, text: '我喜欢艺术创作活动', dimension: 'A' },
  { id: 32, text: '我有良好的审美能力', dimension: 'A' },
  { id: 33, text: '我对音乐、美术或文学很感兴趣', dimension: 'A' },
  { id: 34, text: '我喜欢用创意的方式表达自己', dimension: 'A' },
  { id: 35, text: '我擅长设计和创作', dimension: 'A' },
  { id: 36, text: '我对时尚和设计感兴趣', dimension: 'A' },
  { id: 37, text: '我喜欢参观艺术展览或音乐会', dimension: 'A' },
  { id: 38, text: '我有丰富的想象力', dimension: 'A' },
  { id: 39, text: '我对写作和文字创作感兴趣', dimension: 'A' },
  { id: 40, text: '我享受自由创作的过程', dimension: 'A' },
  { id: 41, text: '我擅长即兴发挥和创新', dimension: 'A' },
  { id: 42, text: '我对摄影或视频制作感兴趣', dimension: 'A' },
  { id: 43, text: '我喜欢通过艺术形式表达情感', dimension: 'A' },
  { id: 44, text: '我善于色彩搭配和视觉设计', dimension: 'A' },
  { id: 45, text: '我对戏剧或表演艺术感兴趣', dimension: 'A' },

  // S - 社会型 (题目46-60)
  { id: 46, text: '我喜欢帮助别人', dimension: 'S' },
  { id: 47, text: '我擅长与人沟通', dimension: 'S' },
  { id: 48, text: '我对教育和培训工作感兴趣', dimension: 'S' },
  { id: 49, text: '我喜欢参与志愿服务', dimension: 'S' },
  { id: 50, text: '我善于理解他人的感受', dimension: 'S' },
  { id: 51, text: '我对心理学和社会工作感兴趣', dimension: 'S' },
  { id: 52, text: '我喜欢在团队中工作', dimension: 'S' },
  { id: 53, text: '我擅长协调人际关系', dimension: 'S' },
  { id: 54, text: '我对医疗护理工作感兴趣', dimension: 'S' },
  { id: 55, text: '我愿意为社会做贡献', dimension: 'S' },
  { id: 56, text: '我善于倾听他人的问题', dimension: 'S' },
  { id: 57, text: '我对儿童教育或青少年辅导感兴趣', dimension: 'S' },
  { id: 58, text: '我喜欢组织社交活动', dimension: 'S' },
  { id: 59, text: '我擅长激励和鼓舞他人', dimension: 'S' },
  { id: 60, text: '我对社区服务或公益事业感兴趣', dimension: 'S' },

  // E - 企业型 (题目61-75)
  { id: 61, text: '我喜欢组织和领导他人', dimension: 'E' },
  { id: 62, text: '我擅长说服和影响他人', dimension: 'E' },
  { id: 63, text: '我对商业和管理感兴趣', dimension: 'E' },
  { id: 64, text: '我喜欢竞争和挑战', dimension: 'E' },
  { id: 65, text: '我善于制定计划和目标', dimension: 'E' },
  { id: 66, text: '我对创业和经商感兴趣', dimension: 'E' },
  { id: 67, text: '我喜欢承担责任和做决策', dimension: 'E' },
  { id: 68, text: '我擅长谈判和协商', dimension: 'E' },
  { id: 69, text: '我对销售和市场营销感兴趣', dimension: 'E' },
  { id: 70, text: '我有很强的进取心', dimension: 'E' },
  { id: 71, text: '我善于识别商业机会', dimension: 'E' },
  { id: 72, text: '我对投资和金融感兴趣', dimension: 'E' },
  { id: 73, text: '我喜欢在有竞争的环境中工作', dimension: 'E' },
  { id: 74, text: '我擅长激励团队达成目标', dimension: 'E' },
  { id: 75, text: '我对政治或公共管理感兴趣', dimension: 'E' },

  // C - 传统型 (题目76-90)
  { id: 76, text: '我喜欢有规律和结构的工作', dimension: 'C' },
  { id: 77, text: '我擅长处理细节和数据', dimension: 'C' },
  { id: 78, text: '我对会计和财务工作感兴趣', dimension: 'C' },
  { id: 79, text: '我喜欢遵循既定的程序和规则', dimension: 'C' },
  { id: 80, text: '我善于组织和整理信息', dimension: 'C' },
  { id: 81, text: '我对办公室行政工作感兴趣', dimension: 'C' },
  { id: 82, text: '我喜欢系统化的工作方式', dimension: 'C' },
  { id: 83, text: '我擅长执行既定计划', dimension: 'C' },
  { id: 84, text: '我对档案管理和数据录入感兴趣', dimension: 'C' },
  { id: 85, text: '我注重准确性和效率', dimension: 'C' },
  { id: 86, text: '我善于进行质量控制和检查', dimension: 'C' },
  { id: 87, text: '我对审计或合规工作感兴趣', dimension: 'C' },
  { id: 88, text: '我喜欢按照标准流程完成任务', dimension: 'C' },
  { id: 89, text: '我擅长制作报表和统计分析', dimension: 'C' },
  { id: 90, text: '我对数据库管理或信息系统感兴趣', dimension: 'C' }
];

// Holland 评分选项（二元选择）
export const OPTIONS = [
  { value: 1, label: '喜欢/感兴趣' },
  { value: 0, label: '不喜欢/不感兴趣' }
];

// Holland 维度映射（题目索引从0开始）
export const DIMENSION_MAPPING = {
  // R - 实际型（15题）- 题目1-15（索引0-14）
  'R': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  
  // I - 研究型（15题）- 题目16-30（索引15-29）
  'I': [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
  
  // A - 艺术型（15题）- 题目31-45（索引30-44）
  'A': [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44],
  
  // S - 社会型（15题）- 题目46-60（索引45-59）
  'S': [45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59],
  
  // E - 企业型（15题）- 题目61-75（索引60-74）
  'E': [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74],
  
  // C - 传统型（15题）- 题目76-90（索引75-89）
  'C': [75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89]
};

// 维度名称映射（中文）
export const DIMENSION_NAMES = {
  'R': '实际型',
  'I': '研究型',
  'A': '艺术型',
  'S': '社会型',
  'E': '企业型',
  'C': '传统型'
};

// 维度顺序（RIASEC标准顺序）
export const DIMENSION_ORDER = ['R', 'I', 'A', 'S', 'E', 'C'];

// 所有可能的RIASEC代码（3字母组合）
// 共有6*5*4 = 120种可能的组合
// 但实际使用中最常见的是分数最高的3个维度的组合
export const VALID_CODES = ['R', 'I', 'A', 'S', 'E', 'C'];

