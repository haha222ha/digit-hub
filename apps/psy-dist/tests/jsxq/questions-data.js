// 精神需求测试题目数据
// 10个维度：A-意义、B-爱、C-连接、D-成长、E-创造、F-权力、G-乐趣、H-安全感、I-自由、J-贡献

const questionsData = [
  // 第一部分 - 自我鉴定 (1-50题)
  {
    "id": "q1",
    "type": "tend",
    "question": "我清楚地知道自己生活的目标和追求。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "A17", "text": "是"}
    ]
  },
  {
    "id": "q2",
    "type": "tend",
    "question": "我感到被身边人（如家人、朋友、恋人）深深地爱着。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "B17", "text": "是"}
    ]
  },
  {
    "id": "q3",
    "type": "tend",
    "question": "当我和一群人为一个共同目标努力时，我感到非常满足。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "C13", "text": "是"}
    ]
  },
  {
    "id": "q4",
    "type": "tend",
    "question": "我觉得自己已经定型，很难再有什么改变。",
    "options": [
      {"value": "D16", "text": "否"},
      {"value": "0", "text": "是"}
    ]
  },
  {
    "id": "q5",
    "type": "tend",
    "question": "我经常有想要把想法变成现实作品的冲动。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "E22", "text": "是"}
    ]
  },
  {
    "id": "q6",
    "type": "tend",
    "question": "我在竞争中感到兴奋，并渴望获胜。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "F16", "text": "是"}
    ]
  },
  {
    "id": "q7",
    "type": "tend",
    "question": "和我在一起的人常常感到轻松快乐。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "G16", "text": "是"}
    ]
  },
  {
    "id": "q8",
    "type": "tend",
    "question": "一个让我身心感到安全的家对我极其重要。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "H17", "text": "是"}
    ]
  },
  {
    "id": "q9",
    "type": "tend",
    "question": "如果有人替我做决定，我会感到轻松。",
    "options": [
      {"value": "I18", "text": "否"},
      {"value": "0", "text": "是"}
    ]
  },
  {
    "id": "q10",
    "type": "tend",
    "question": "在团队中，我常常自愿帮助和支持他人。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "J22", "text": "是"}
    ]
  },
  {
    "id": "q11",
    "type": "tend",
    "question": "在群体中我常常感到格格不入。",
    "options": [
      {"value": "C20", "text": "否"},
      {"value": "0", "text": "是"}
    ]
  },
  {
    "id": "q12",
    "type": "tend",
    "question": "我主动寻求他人的反馈来帮助自己进步。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "D15", "text": "是"}
    ]
  },
  {
    "id": "q13",
    "type": "tend",
    "question": "我很容易从简单的事物（如美食、好天气）中找到乐趣。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "G17", "text": "是"}
    ]
  },
  {
    "id": "q14",
    "type": "tend",
    "question": "保障和稳定往往是我找工作时最先考虑的。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "H14", "text": "是"}
    ]
  },
  {
    "id": "q15",
    "type": "tend",
    "question": "在思想和观点上，我保持独立，不盲从他人。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "I17", "text": "是"}
    ]
  },
  {
    "id": "q16",
    "type": "tend",
    "question": "我关心社会问题，并愿意为之付出行动。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "J19", "text": "是"}
    ]
  },
  {
    "id": "q17",
    "type": "tend",
    "question": "即使是很小的事，我也能从中发现其重要性。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "A21", "text": "是"}
    ]
  },
  {
    "id": "q18",
    "type": "tend",
    "question": "我可以自主地决定如何生活，这对我至关重要。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "I17", "text": "是"}
    ]
  },
  {
    "id": "q19",
    "type": "tend",
    "question": "我是某个社群（如兴趣小组、社区、团队）中活跃的一员。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "C25", "text": "是"}
    ]
  },
  {
    "id": "q20",
    "type": "tend",
    "question": "我每年都会为自己设定学习或提升的目标。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "D19", "text": "是"}
    ]
  },
  {
    "id": "q21",
    "type": "tend",
    "question": "我有通过艺术、写作、音乐等方式表达自己的习惯。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "E15", "text": "是"}
    ]
  },
  {
    "id": "q22",
    "type": "tend",
    "question": "我希望我对事情的发展拥有发言权和决定权。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "F17", "text": "是"}
    ]
  },
  {
    "id": "q23",
    "type": "tend",
    "question": "我愿意花大量时间和精力来维系重要的关系。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "B21", "text": "是"}
    ]
  },
  {
    "id": "q24",
    "type": "tend",
    "question": "「幽默」是我生活中不可或缺的部分。",
    "options": [
      {"value": "G15", "text": "否"},
      {"value": "0", "text": "是"}
    ]
  },
  {
    "id": "q25",
    "type": "tend",
    "question": "表达情感会让我感到不自在。",
    "options": [
      {"value": "B15", "text": "否"},
      {"value": "0", "text": "是"}
    ]
  },
  {
    "id": "q26",
    "type": "tend",
    "question": "我看到他人因为我的帮助而变得更好时，我会非常高兴。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "J17", "text": "是"}
    ]
  },
  {
    "id": "q27",
    "type": "tend",
    "question": "我对来自他人的控制非常敏感和抵触。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "I14", "text": "是"}
    ]
  },
  {
    "id": "q28",
    "type": "tend",
    "question": "我享受从零开始创造一件事物的过程。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "E18", "text": "是"}
    ]
  },
  {
    "id": "q29",
    "type": "tend",
    "question": "我常常觉得日常生活琐碎且缺乏目的。",
    "options": [
      {"value": "A17", "text": "否"},
      {"value": "0", "text": "是"}
    ]
  },
  {
    "id": "q30",
    "type": "tend",
    "question": "我愿意为了一些我认为有意义的事而牺牲短期利益。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "A18", "text": "是"}
    ]
  },
  {
    "id": "q31",
    "type": "tend",
    "question": "我感到自己与自然和万物是相连的。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "C15", "text": "是"}
    ]
  },
  {
    "id": "q32",
    "type": "tend",
    "question": "我所做的工作/所学的专业让我感觉很有价值。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "A21", "text": "是"}
    ]
  },
  {
    "id": "q33",
    "type": "tend",
    "question": "身体的亲密接触（如拥抱、亲吻）让我感到安心、幸福。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "B15", "text": "是"}
    ]
  },
  {
    "id": "q34",
    "type": "tend",
    "question": "学习新东西让我感到疲惫。",
    "options": [
      {"value": "D15", "text": "否"},
      {"value": "0", "text": "是"}
    ]
  },
  {
    "id": "q35",
    "type": "tend",
    "question": "被人看重和尊敬对我很重要。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "F17", "text": "是"}
    ]
  },
  {
    "id": "q36",
    "type": "tend",
    "question": "我经常纯粹为了找乐子而做一些事。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "G16", "text": "是"}
    ]
  },
  {
    "id": "q37",
    "type": "tend",
    "question": "我需要一个稳定的、可预测的生活环境。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "H14", "text": "是"}
    ]
  },
  {
    "id": "q38",
    "type": "tend",
    "question": "我优先考虑自己的利益，而非他人的需求。",
    "options": [
      {"value": "J13", "text": "否"},
      {"value": "0", "text": "是"}
    ]
  },
  {
    "id": "q39",
    "type": "tend",
    "question": "我对未来不太担心，也觉得没必要提前规划。",
    "options": [
      {"value": "H16", "text": "否"},
      {"value": "0", "text": "是"}
    ]
  },
  {
    "id": "q40",
    "type": "tend",
    "question": "我更喜欢遵循指令，而不是自己创造新方案。",
    "options": [
      {"value": "E18", "text": "否"},
      {"value": "0", "text": "是"}
    ]
  },
  {
    "id": "q41",
    "type": "tend",
    "question": "在团队中，我倾向于担任主导者的角色。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "F18", "text": "是"}
    ]
  },
  {
    "id": "q42",
    "type": "tend",
    "question": "利他主义是我的价值观的核心组成部分。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "J17", "text": "是"}
    ]
  },
  {
    "id": "q43",
    "type": "tend",
    "question": "关心他人、为他人付出时让我感到快乐。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "B15", "text": "是"}
    ]
  },
  {
    "id": "q44",
    "type": "tend",
    "question": "我宁愿承担自主选择的后果，也不愿被他人安排。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "I15", "text": "是"}
    ]
  },
  {
    "id": "q45",
    "type": "tend",
    "question": "在团队中工作让我感到充满力量。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "C17", "text": "是"}
    ]
  },
  {
    "id": "q46",
    "type": "tend",
    "question": "我经常反思自己的行为，以求改进。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "D17", "text": "是"}
    ]
  },
  {
    "id": "q47",
    "type": "tend",
    "question": "我不喜欢听从别人的指令行事，即便这个人是我的长辈。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "F16", "text": "是"}
    ]
  },
  {
    "id": "q48",
    "type": "tend",
    "question": "我会为未来的风险（如失业、意外）做准备。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "H21", "text": "是"}
    ]
  },
  {
    "id": "q49",
    "type": "tend",
    "question": "解决问题时，我喜欢提出新颖独特的方案。",
    "options": [
      {"value": "0", "text": "否"},
      {"value": "E16", "text": "是"}
    ]
  },
  {
    "id": "q50",
    "type": "tend",
    "question": "我常常觉得「玩」是在浪费时间。",
    "options": [
      {"value": "G21", "text": "否"},
      {"value": "0", "text": "是"}
    ]
  },
  // 第二部分 - 情景测试 (51-60题)
  {
    "id": "q51",
    "type": "sort",
    "question": "在选择一份新工作时，你最看重的是？（请按重要性由高到低进行排序）",
    "options": [
      {"value": "A3", "text": "工作内容与你的价值观高度吻合"},
      {"value": "I3", "text": "拥有高度的自主权，可以自由决定工作方式"},
      {"value": "H3", "text": "福利待遇好，能提供长期保障"},
      {"value": "A3", "text": "有清晰的晋升通道，能不断上升"},
      {"value": "G3", "text": "团队氛围极佳，能结交到一群志同道合的伙伴"},
      {"value": "D3", "text": "能提供大量学习和培训机会"},
      {"value": "Z", "text": "排序好了，下一题"}
    ]
  },
  {
    "id": "q52",
    "type": "single",
    "question": "你更渴望哪种类型的成功？",
    "options": [
      {"value": "F4", "text": "在某个领域达到顶尖水平，获得广泛的声誉和尊敬"},
      {"value": "E4", "text": "创造出一种能代表自己独特思想的作品或产品"}
    ]
  },
  {
    "id": "q53",
    "type": "single",
    "question": "在你看来，一段理想的情感关系最重要的是什么？",
    "options": [
      {"value": "I4", "text": "双方都拥有独立的空间和自由，不被对方束缚"},
      {"value": "B4", "text": "双方无条件的爱、理解和支持对方"},
      {"value": "D4", "text": "能在这段关系中互相促进，变成更好的人"},
      {"value": "G4", "text": "能一起欢笑、玩闹，度过轻松愉快的时光"}
    ]
  },
  {
    "id": "q54",
    "type": "single",
    "question": "你更喜欢扮演什么样的团队角色？",
    "options": [
      {"value": "F4", "text": "领导者，制定策略和分配任务"},
      {"value": "E4", "text": "推动者，提供新点子和新方案"},
      {"value": "C4", "text": "支持者，协助大家，确保团队和谐"},
      {"value": "D4", "text": "学习者，吸收新知识，不断提升"}
    ]
  },
  {
    "id": "q55",
    "type": "sort",
    "question": "你最无法忍受自己陷入哪种生活状态？（请按内心恐惧值由高到低进行排序）",
    "options": [
      {"value": "A3", "text": "像机器一样每天重复同样的工作"},
      {"value": "D3", "text": "能力跟不上，被社会淘汰"},
      {"value": "I3", "text": "由他人决定自己的人生大事"},
      {"value": "H3", "text": "生活充满变动，每天都需要考虑和权衡"},
      {"value": "C3", "text": "自己一个人生活，离开了爱着的人"},
      {"value": "Z", "text": "排序好了，下一题"}
    ]
  },
  {
    "id": "q56",
    "type": "single",
    "question": "你如何看待社会规则和传统？",
    "options": [
      {"value": "H4", "text": "它们是社会的基石，提供了秩序和安全感"},
      {"value": "I4", "text": "它们是束缚，我更愿意追随内心，探索自我"},
      {"value": "H4", "text": "它们就像一本指南，让我知道该怎么做，减少了不确定性"},
      {"value": "I4", "text": "挑战规则是社会进步的动力，我倾向于不断质疑并打破它们"}
    ]
  },
  {
    "id": "q57",
    "type": "single",
    "question": "以下哪一个场景会让你感到最满足、最幸福？",
    "options": [
      {"value": "G4", "text": "和志同道合的伙伴畅聊自己的兴趣爱好"},
      {"value": "J4", "text": "得知你的工作正切实地帮助着某些人"},
      {"value": "D4", "text": "完成了一个极具挑战性的目标"},
      {"value": "B4", "text": "与家人或爱人完成了一个温馨的旅行"}
    ]
  },
  {
    "id": "q58",
    "type": "single",
    "question": "假如意外获得一笔奖金，你会选择如何使用？",
    "options": [
      {"value": "H5", "text": "存入银行或购买理财"},
      {"value": "B5", "text": "为家人购置礼物"},
      {"value": "I5", "text": "进行一场说走就走的旅行"},
      {"value": "J5", "text": "捐给慈善组织"},
      {"value": "F5", "text": "为自己购买手机/背包/手表等物品"}
    ]
  },
  {
    "id": "q59",
    "type": "single",
    "question": "感受到压力时，哪一种社交方式更能帮助你释放？",
    "options": [
      {"value": "G4", "text": "和一群朋友尽情玩乐，忘掉烦恼"},
      {"value": "B4", "text": "与伴侣或家人进行一场深度的交谈"}
    ]
  },
  {
    "id": "q60",
    "type": "check",
    "question": "以下哪些原因会让你为了一个工作项目付出额外的心血？（你可以选择多个选项，如果以下没有令你想要选择的事项，请直接点击「得出结果」）",
    "options": [
      {"value": "F3", "text": "担任领导角色，掌控全局"},
      {"value": "C3", "text": "该项目由你和你的好朋友一起完成"},
      {"value": "H3", "text": "如果项目完成度高，你将得到一笔奖金"},
      {"value": "J3", "text": "项目的成果能惠及社会的许多人"},
      {"value": "E3", "text": "项目按照你的策划方案进行"},
      {"value": "Z", "text": "得出结果"}
    ]
  }
];

