/**
 * SCL-90 症状自评量表 - 题目数据
 * 
 * SCL-90（Symptom Checklist-90）是目前国内外广泛使用的心理健康测试量表之一
 * 共90道题目，采用李克特5点量表评分
 */

// SCL-90 题目数据（90题）
export const QUESTIONS = [
  { id: 1, text: '头痛' },
  { id: 2, text: '神经过敏，心中不踏实' },
  { id: 3, text: '头脑中有不必要的想法或字句盘旋' },
  { id: 4, text: '头昏或昏倒' },
  { id: 5, text: '对异性的兴趣减退' },
  { id: 6, text: '对旁人责备求全' },
  { id: 7, text: '感到别人能控制您的思想' },
  { id: 8, text: '责怪别人制造麻烦' },
  { id: 9, text: '忘性大' },
  { id: 10, text: '担心自己的衣饰整齐及仪态的端正' },
  { id: 11, text: '容易烦恼和激动' },
  { id: 12, text: '胸痛' },
  { id: 13, text: '害怕空旷的场所或街道' },
  { id: 14, text: '感到自己的精力下降，活动减慢' },
  { id: 15, text: '想结束自己的生命' },
  { id: 16, text: '听到旁人听不到的声音' },
  { id: 17, text: '发抖' },
  { id: 18, text: '感到大多数人都不可信任' },
  { id: 19, text: '食欲不振' },
  { id: 20, text: '容易哭泣' },
  { id: 21, text: '同异性相处时感到害羞不自在' },
  { id: 22, text: '感到受骗，中了圈套或有人想抓住您' },
  { id: 23, text: '无缘无故地突然感到害怕' },
  { id: 24, text: '自己不能控制地大发脾气' },
  { id: 25, text: '怕单独出门' },
  { id: 26, text: '经常责怪自己' },
  { id: 27, text: '腰痛' },
  { id: 28, text: '感到难以完成任务' },
  { id: 29, text: '感到孤独' },
  { id: 30, text: '感到苦闷' },
  { id: 31, text: '过分担忧' },
  { id: 32, text: '对事物不感兴趣' },
  { id: 33, text: '感到害怕' },
  { id: 34, text: '您的感情容易受到伤害' },
  { id: 35, text: '旁人能知道您的私下想法' },
  { id: 36, text: '感到别人不理解您、不同情您' },
  { id: 37, text: '感到人们对您不友好，不喜欢您' },
  { id: 38, text: '做事必须做得很慢以保证做得正确' },
  { id: 39, text: '心跳得很厉害' },
  { id: 40, text: '恶心或胃部不舒服' },
  { id: 41, text: '感到比不上他人' },
  { id: 42, text: '肌肉酸痛' },
  { id: 43, text: '感到有人在监视您、谈论您' },
  { id: 44, text: '难以入睡' },
  { id: 45, text: '做事必须反复检查' },
  { id: 46, text: '难以作出决定' },
  { id: 47, text: '怕乘电车、公共汽车、地铁或火车' },
  { id: 48, text: '呼吸有困难' },
  { id: 49, text: '一阵阵发冷或发热' },
  { id: 50, text: '因为感到害怕而避开某些东西、场所或活动' },
  { id: 51, text: '脑子变空了' },
  { id: 52, text: '身体的某一部分麻木或刺痛' },
  { id: 53, text: '喉咙有梗塞感' },
  { id: 54, text: '感到前途没有希望' },
  { id: 55, text: '不能集中注意力' },
  { id: 56, text: '感到身体的某一部分软弱无力' },
  { id: 57, text: '感到紧张或心神不定' },
  { id: 58, text: '感到手或脚发重' },
  { id: 59, text: '想到死亡的事' },
  { id: 60, text: '吃得太多' },
  { id: 61, text: '当别人看着您或谈论您时感到不自在' },
  { id: 62, text: '有一些不属于您自己的想法' },
  { id: 63, text: '有想打人或伤害他人的冲动' },
  { id: 64, text: '早醒' },
  { id: 65, text: '必须反复洗手、点数' },
  { id: 66, text: '睡得不稳不深' },
  { id: 67, text: '有想摔坏或破坏东西的想法' },
  { id: 68, text: '有一些别人没有的想法' },
  { id: 69, text: '对别人小心谨慎' },
  { id: 70, text: '在公共场所感到不自在' },
  { id: 71, text: '感到任何事情都很困难' },
  { id: 72, text: '一阵阵恐惧或惊恐' },
  { id: 73, text: '感到在公共场所吃东西很不舒服' },
  { id: 74, text: '经常与人争论' },
  { id: 75, text: '单独一人时神经很紧张' },
  { id: 76, text: '别人对您的成绩没有作出恰当的评价' },
  { id: 77, text: '即使和别人在一起也感到孤单' },
  { id: 78, text: '感到坐立不安心神不定' },
  { id: 79, text: '感到自己没有什么价值' },
  { id: 80, text: '感到熟悉的东西变成陌生或不像是真的' },
  { id: 81, text: '大叫或摔东西' },
  { id: 82, text: '害怕会在公共场所昏倒' },
  { id: 83, text: '感到别人想占您的便宜' },
  { id: 84, text: '为一些有关性的想法而很苦恼' },
  { id: 85, text: '您认为应该因为自己的过错而受到惩罚' },
  { id: 86, text: '感到要赶快把事情做完' },
  { id: 87, text: '感到自己的身体有严重问题' },
  { id: 88, text: '从未感到和其他人很亲近' },
  { id: 89, text: '感到有罪' },
  { id: 90, text: '感到自己的脑子有毛病' }
];

// SCL-90 评分选项（李克特5点量表）
export const OPTIONS = [
  { value: 1, label: '没有' },
  { value: 2, label: '很轻' },
  { value: 3, label: '中等' },
  { value: 4, label: '偏重' },
  { value: 5, label: '严重' }
];

// SCL-90 因子映射（标准因子结构）
// 每个因子包含的题目编号（从1开始）
export const FACTOR_MAPPING = {
  // 1. 躯体化（Somatization）- 12题
  somatization: [1, 4, 12, 27, 40, 42, 48, 49, 52, 53, 56, 58],
  
  // 2. 强迫症状（Obsessive-Compulsive）- 10题
  obsessiveCompulsive: [3, 9, 10, 28, 38, 45, 46, 51, 55, 65],
  
  // 3. 人际关系敏感（Interpersonal Sensitivity）- 9题
  interpersonalSensitivity: [6, 21, 34, 36, 37, 41, 61, 69, 73],
  
  // 4. 抑郁（Depression）- 13题
  depression: [5, 14, 15, 20, 22, 26, 29, 30, 31, 32, 54, 71, 79],
  
  // 5. 焦虑（Anxiety）- 10题
  anxiety: [2, 17, 23, 33, 39, 57, 72, 78, 80, 86],
  
  // 6. 敌对（Hostility）- 6题
  hostility: [11, 24, 63, 67, 74, 81],
  
  // 7. 恐怖（Phobic Anxiety）- 7题
  phobicAnxiety: [13, 25, 47, 50, 70, 75, 82],
  
  // 8. 偏执（Paranoid Ideation）- 6题
  paranoidIdeation: [8, 18, 43, 68, 76, 83],
  
  // 9. 精神病性（Psychoticism）- 10题
  psychoticism: [7, 16, 35, 62, 77, 84, 85, 87, 88, 90],
  
  // 10. 睡眠（Sleep）- 3题
  sleep: [44, 64, 66]
};

// 因子名称映射（中文）
export const FACTOR_NAMES = {
  somatization: '躯体化',
  obsessiveCompulsive: '强迫症状',
  interpersonalSensitivity: '人际关系敏感',
  depression: '抑郁',
  anxiety: '焦虑',
  hostility: '敌对',
  phobicAnxiety: '恐怖',
  paranoidIdeation: '偏执',
  psychoticism: '精神病性',
  sleep: '睡眠'
};

// 因子顺序（用于报告展示）
export const FACTOR_ORDER = [
  'somatization',
  'obsessiveCompulsive',
  'interpersonalSensitivity',
  'depression',
  'anxiety',
  'hostility',
  'phobicAnxiety',
  'paranoidIdeation',
  'psychoticism',
  'sleep'
];

