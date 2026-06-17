/* =========================================================
   templates.js — data-driven question banks
   One engine, two modules. Questions surface based on
   区分 (level) and 系 (art vs general).
   ========================================================= */

// helper: a question object
// { id, label, jp, hint, placeholder, optional }

const Q = {
  // ---- shared / 志望理由書 intake questions ----
  why_japan: {
    id: "why_japan", label: "为什么选择来日本（学习）？", jp: "なぜ日本で学ぶのか",
    hint: "不要只写「喜欢日本文化」。写你在中国学习/创作中遇到的瓶颈，以及日本的课程、工房、讲评或研究环境为什么能帮你继续推进。",
    placeholder: "例：在中国画室训练中我逐渐发现…，而日本美术教育中的…正好能回应这个问题…",
  },
  domestic_training: {
    id: "domestic_training", label: "你在中国的学习 / 训练背景", jp: "中国での学習・制作経験",
    hint: "高中、艺考、画室、作品集机构、本科课程、老师指导都可以写。重点是你实际做过什么，而不是简单说「基础扎实」。",
    placeholder: "例：高二开始在…画室系统训练素描、色彩和速写；作品集阶段重点准备了…",
  },
  language_preparation: {
    id: "language_preparation", label: "日语学习和来日准备", jp: "日本語学習・留学準備",
    hint: "写真实情况：日语学习时间、能否听懂讲评、是否参加过开放校园/说明会/线上咨询。不确定的成绩不要编。",
    placeholder: "例：从 2024 年开始学习日语，目前能进行日常沟通，也在练习用日语说明作品意图…",
    optional: true,
  },
  cross_cultural_view: {
    id: "cross_cultural_view", label: "中国经历如何影响你的作品 / 问题意识", jp: "中国での経験と問題意識",
    hint: "可以写城市、家庭、教育、身体经验、社会观察、地方文化。不要贬低中国，也不要空泛比较中日。",
    placeholder: "例：我在中国城市更新过程中感受到…，这让我在作品中持续关注…",
  },
  why_school: {
    id: "why_school", label: "为什么是这所大学 / 这个学科？", jp: "本学・本学科を志望する理由",
    hint: "你了解到它哪些具体的地方？课程、设备、师资、作风、毕业生去向——尽量写你真正查过、看过的。",
    placeholder: "例：该校的版画工房设备齐全，且…老师的…作风正是我想钻研的方向…",
  },
  art_experience: {
    id: "art_experience", label: "你的创作 / 学习经历", jp: "これまでの制作・学習経験",
    hint: "学过什么、跟谁学、做过哪些作品、参加过哪些展览或比赛、得过什么奖。事实清单即可，AI 会帮你串成文章。",
    placeholder: "例：素描 3 年、油画 2 年；2024 年参加…展；作品《…》入选…",
  },
  portfolio: {
    id: "portfolio", label: "最能代表你的 1–2 件作品", jp: "代表作について",
    hint: "主题是什么？用什么媒介？想表达什么？创作过程中遇到什么、怎么解决的？这是体现你独特性的关键。",
    placeholder: "例：《…》，综合材料，探讨…；最难的是…，我通过…解决…",
  },
  learn_plan: {
    id: "learn_plan", label: "入学后想学什么 / 想做什么样的创作", jp: "入学後に学びたいこと",
    hint: "具体到方向、媒介、想尝试的课题。和这所校的资源对得上最好。",
    placeholder: "例：想系统学习…，并尝试将…与…结合，完成一组关于…的作品…",
  },
  field_interest: {
    id: "field_interest", label: "你对这个专业领域的兴趣从何而来？", jp: "この分野への関心のきっかけ",
    hint: "一般学部用。一个具体的契机，而非泛泛的「我对…感兴趣」。",
    placeholder: "例：在…的经历让我开始关注…问题，进而想深入研究…",
  },
  highschool: {
    id: "highschool", label: "高中阶段最投入的事 / 取得的成果", jp: "高校時代に力を入れたこと",
    hint: "一般学部用。学习、活动、项目、比赛皆可，重点是你做了什么、学到什么。",
    placeholder: "例：担任…，组织了…，过程中学会了…",
  },
  future: {
    id: "future", label: "毕业后的目标 / 想从事的方向", jp: "将来の目標・進路",
    hint: "可以是职业方向、想成为什么样的创作者、想解决什么问题。和你前面写的连成一条线。",
    placeholder: "例：希望成为…，将所学用于…",
  },
  self_pr: {
    id: "self_pr", label: "你的特质 / 优势（自我 PR）", jp: "自己 PR",
    hint: "用具体事例支撑，而不是形容词堆砌。「我很努力」不如「我连续两年每天…」。",
    placeholder: "例：我擅长…，曾在…中体现…",
  },
  // ---- 大学院 / 研究生 specific ----
  grad_background: {
    id: "grad_background", label: "本科 / 既往的学习与创作背景", jp: "これまでの学習・研究・制作背景",
    hint: "专业、主要学了什么、本科阶段的代表性研究或作品。",
    placeholder: "例：本科…专业，主攻…，毕业创作是…",
  },
  graduation_work: {
    id: "graduation_work", label: "毕业创作 / 毕业论文 / 代表研究", jp: "卒業制作・卒業論文",
    hint: "大学院申请很容易被追问。写清题目、媒介/方法、核心问题、结论或作品成果。",
    placeholder: "例：毕业创作《…》以…为主题，使用…媒介，重点探讨…",
  },
  why_grad: {
    id: "why_grad", label: "为什么读研？为什么来日本读？", jp: "大学院進学・来日の理由",
    hint: "为什么不直接工作 / 不在本国读？日本（这所校）能给你什么别处给不了的？",
    placeholder: "例：我想深入研究…，而日本在…领域的积累 / 这所校的…正是…",
  },
  why_lab: {
    id: "why_lab", label: "为什么这个研究科 / 这个研究室？", jp: "本研究科・研究室を志望する理由",
    hint: "研究方向是否契合、有哪些资源、师资。写你真正查证过的。",
    placeholder: "例：该研究室长期从事…研究，与我关心的…高度契合…",
  },
  research_theme: {
    id: "research_theme", label: "想研究 / 创作的主题方向", jp: "取り組みたい研究・制作テーマ",
    hint: "尽量具体到一个问题或一组作品的构想。这部分与「研究計画書」呼应。",
    placeholder: "例：以…为对象，探讨…；或：围绕…创作一组…",
  },
  research_gap: {
    id: "research_gap", label: "为什么需要到日本继续推进？", jp: "日本で研究・制作を深める必要性",
    hint: "写日本具体资源如何补足你目前的不足：教授方向、课程、工房、档案、展览环境、批评文化。不要写空泛赞美。",
    placeholder: "例：我目前的课题需要…方面的指导，而日本在…的实践/研究积累能帮助我…",
  },
  professor: {
    id: "professor", label: "希望师从的教员及理由", jp: "指導を希望する教員とその理由",
    hint: "⚠️ 教员的研究方向 / 作品请写你确实查证过的，写错方向面接会翻车。不确定就先空着或标注。",
    placeholder: "例：希望师从…老师，其…研究 / 作品中的…正是我想学习的…",
    optional: true,
  },
  research_method: {
    id: "research_method", label: "大致的研究方法 / 关心的问题", jp: "研究方法・問題関心",
    hint: "一般大学院用。打算怎么做这个研究、用什么资料或方法。",
    placeholder: "例：拟通过…分析…，结合…资料…",
  },
};

// 設問库：常见的志望理由書设问（输出结构）。按 区分×系 推荐勾选。
const SHIBO_PROMPTS = {
  ug_art: [
    { id: "p_why", q: "本学・本学科を志望する理由", on: true },
    { id: "p_exp", q: "これまでの制作・美術活動について", on: true },
    { id: "p_plan", q: "入学後に学びたいこと・制作したいもの", on: true },
    { id: "p_future", q: "将来の目標・進路", on: true },
    { id: "p_japan", q: "なぜ日本で学びたいのか", on: false },
  ],
  ug_gen: [
    { id: "p_why", q: "本学・本学部を志望する理由", on: true },
    { id: "p_hs", q: "高校時代に力を入れたこと", on: true },
    { id: "p_plan", q: "入学後の学修計画", on: true },
    { id: "p_future", q: "将来の目標", on: true },
    { id: "p_self", q: "自己 PR", on: false },
  ],
  grad_art: [
    { id: "p_why", q: "本研究科を志望する理由", on: true },
    { id: "p_back", q: "これまでの研究・制作活動", on: true },
    { id: "p_theme", q: "本学で取り組みたい研究・制作テーマ", on: true },
    { id: "p_prof", q: "指導を希望する教員とその理由", on: true },
    { id: "p_future", q: "修了後の進路・目標", on: false },
  ],
  grad_gen: [
    { id: "p_why", q: "本研究科を志望する理由", on: true },
    { id: "p_back", q: "これまでの研究内容・関心", on: true },
    { id: "p_theme", q: "入学後の研究計画の概要", on: true },
    { id: "p_prof", q: "希望指導教員", on: false },
    { id: "p_future", q: "修了後の展望", on: false },
  ],
};

// build intake set from 区分 + 系
function shiboQuestions(level, art) {
  if (level === "ug") {
    return art
      ? ["why_japan", "domestic_training", "language_preparation", "why_school", "art_experience", "portfolio", "cross_cultural_view", "learn_plan", "future", "self_pr"]
      : ["why_japan", "domestic_training", "language_preparation", "why_school", "field_interest", "highschool", "cross_cultural_view", "learn_plan", "future", "self_pr"];
  }
  // grad / kenkyusei share grad bank
  return art
    ? ["grad_background", "graduation_work", "why_grad", "research_gap", "why_lab", "research_theme", "professor", "portfolio", "cross_cultural_view", "future"]
    : ["grad_background", "graduation_work", "why_grad", "research_gap", "why_lab", "research_theme", "professor", "research_method", "cross_cultural_view", "future"];
}

function shiboPromptKey(level, art) {
  if (level === "ug") return art ? "ug_art" : "ug_gen";
  return art ? "grad_art" : "grad_gen";
}

// ---- 研究計画書 module ----
const KENKYU_Q = {
  k_theme: { id: "k_theme", label: "研究 / 制作主题（暂定题目）", jp: "研究テーマ・仮題目",
    hint: "一句话说清你想研究或创作什么。", placeholder: "例：…における…の研究 — …を中心に" },
  k_background: { id: "k_background", label: "研究背景 / 为什么是这个主题", jp: "研究の背景・動機",
    hint: "这个问题为什么重要、为什么由你来做。", placeholder: "例：近年…，但…尚未被充分讨论。我因…而关注此问题…" },
  k_question: { id: "k_question", label: "想厘清的核心问题", jp: "リサーチクエスチョン",
    hint: "1–3 个可回答的具体问题，而非宽泛话题。", placeholder: "例：① …は…にどう影響するか ② …" },
  k_prior: { id: "k_prior", label: "已知的相关研究 / 作家作品", jp: "先行研究",
    hint: "⚠️ 写你确实读过 / 看过的。具体的研究者、著作或作家、作品。", placeholder: "例：…の研究（著者・年）では…。…作家の…シリーズでは…", optional: true },
  k_method: { id: "k_method", label: "研究 / 制作方法、使用资料", jp: "研究方法・資料",
    hint: "打算怎么做：调查、分析、实验、制作流程、用什么材料 / 文献。", placeholder: "例：…を対象に…を分析。制作では…の技法を用い…" },
  k_originality: { id: "k_originality", label: "本研究的独特性 / 意义", jp: "独自性・意義",
    hint: "和已有研究比，你的新意在哪。", placeholder: "例：従来は…だったが、本研究は…という点で新しい…" },
  k_schedule: { id: "k_schedule", label: "大致的研究计划安排", jp: "研究スケジュール",
    hint: "按学期 / 年度粗略列出阶段即可，AI 会帮你排成表述。", placeholder: "例：1 年次…、2 年次…、修了制作…", optional: true },
};

function kenkyuQuestions() {
  return ["k_theme", "k_background", "k_question", "k_prior", "k_method", "k_originality", "k_schedule"];
}

// ---- module registry ----
const ANSWER_GUIDES = {
  default: {
    weak: "只写结论，例如“我很感兴趣”“想学习更多”。",
    strong: "写清时间、作品/课程、遇到的问题、你做过的尝试，以及这件事为什么影响出愿。"
  },
  why_japan: {
    weak: "日本文化很有魅力，所以想去日本学习。",
    strong: "说明你从哪类日本作品/展览/课程中发现了具体差距，并写出日本教育或创作环境如何对应你的下一步。"
  },
  domestic_training: {
    weak: "我在中国学习了很多基础知识。",
    strong: "列出真实训练内容，如素描、色彩、作品集、论文、竞赛或项目，并说明这些训练留下的不足。"
  },
  language_preparation: {
    weak: "我会努力学习日语。",
    strong: "写现有日语水平、学习方式、面试/课堂准备，以及入学后如何补足专业表达。"
  },
  cross_cultural_view: {
    weak: "中日文化不同，我会适应。",
    strong: "结合中国学生视角，写一次具体跨文化观察，并说明它如何改变你的创作或研究问题。"
  },
  why_school: {
    weak: "贵校环境优越、师资雄厚。",
    strong: "写学校的真实课程、研究室、毕业展、教授方向或设备，并对应你的作品/研究计划。"
  },
  art_experience: {
    weak: "我从小喜欢画画。",
    strong: "写一件具体创作经历：题目、材料、过程难点、老师反馈、你最后怎样修改。"
  },
  portfolio: {
    weak: "我的作品集内容丰富。",
    strong: "选 1-2 件真实作品，说明主题、媒介、尺寸/周期、问题意识和修改逻辑。"
  },
  learn_plan: {
    weak: "入学后我会认真学习。",
    strong: "按课程、研究室、制作节奏、日语补强、作品集更新写出可执行计划。"
  },
  field_interest: {
    weak: "我对这个专业很有兴趣。",
    strong: "写你接触该方向的契机、已做过的尝试、目前卡住的问题和想继续深化的方向。"
  },
  highschool: {
    weak: "高中期间我努力学习。",
    strong: "写一段真实学习或活动经历，说明它怎样训练了观察、表达、协作或持续制作能力。"
  },
  future: {
    weak: "毕业后想成为优秀人才。",
    strong: "写毕业后的具体场景：继续升学、进入行业、回国发展或中日连接，并说明与专业学习的关系。"
  },
  self_pr: {
    weak: "我认真、努力、有责任心。",
    strong: "用一件经历证明性格：遇到什么问题、你怎么处理、结果如何、反映出什么能力。"
  },
  grad_background: {
    weak: "本科/过往学习让我有基础。",
    strong: "写过往专业、毕业作品/论文、课程或实习，说明它与研究生阶段主题的连续关系。"
  },
  graduation_work: {
    weak: "毕业作品完成得不错。",
    strong: "写作品主题、方法、材料/数据、批评意见、最终改动，以及它暴露出的下一步研究问题。"
  },
  why_grad: {
    weak: "希望进入大学院提升自己。",
    strong: "说明为什么现在需要大学院：研究训练、教授指导、制作环境、理论补强或作品深化。"
  },
  why_lab: {
    weak: "该研究室很适合我。",
    strong: "对应研究室真实方向，写你已读过/看过什么，以及它和你的主题如何相接。"
  },
  research_theme: {
    weak: "我想研究视觉传达/设计/艺术。",
    strong: "把主题缩小到对象、媒介、场景、人群或问题，例如“面向中国留学生的公共信息视觉表达”。"
  },
  research_gap: {
    weak: "现在研究还不够充分。",
    strong: "写你观察到的具体空白：作品、用户、材料、地域、方法或既有研究没有覆盖的部分。"
  },
  professor: {
    weak: "教授很有名，所以想跟随学习。",
    strong: "写教授作品/论文/研究室方向中与你主题相关的一点，并说明你希望得到哪类指导。"
  },
  research_method: {
    weak: "我会调查资料并进行创作。",
    strong: "写资料收集、案例分析、访谈/问卷、原型制作、展览验证等真实可执行步骤。"
  },
  k_theme: {
    weak: "研究主题是设计与社会。",
    strong: "用一句话限定研究对象、问题和场景，避免过大题目。"
  },
  k_background: {
    weak: "这个主题很重要。",
    strong: "写你从中国学习/生活经验中看到的真实现象，并说明为什么需要在日本继续研究。"
  },
  k_question: {
    weak: "想研究如何做得更好。",
    strong: "改成可回答的问题，例如“什么视觉元素会影响某类用户的理解与信任”。"
  },
  k_prior: {
    weak: "已有很多相关研究。",
    strong: "列出已看过的作者、作品、展览或案例类别，并说明它们的不足。"
  },
  k_method: {
    weak: "通过调查和制作来研究。",
    strong: "写清调查对象、样本、制作材料、比较方式、评价标准和时间顺序。"
  },
  k_originality: {
    weak: "我的研究有创新性。",
    strong: "说明新意来自对象、人群、材料、跨文化视角、验证方式或表达方法。"
  },
  k_schedule: {
    weak: "第一年调查，第二年制作。",
    strong: "按学期写资料收集、实验/制作、反馈、修改、论文和展示的节奏。"
  }
};

const MODULES = {
  shibo: {
    key: "shibo",
    name: "志望理由書",
    nameZh: "志望理由书",
    nameJp: "しぼうりゆうしょ",
    desc: "为什么是你、为什么是这所校、为什么是现在 —— 逻辑与情感兼具的核心叙事。",
    bank: Q,
    getQuestions: shiboQuestions,
    needsProf: true,
    defaultLimit: 800,
    steps: ["设定", "素材", "追问", "成稿"],
  },
  kenkyu: {
    key: "kenkyu",
    name: "研究計画書",
    nameZh: "研究计划书",
    nameJp: "けんきゅうけいかくしょ",
    desc: "大学院出願的硬通货。研究主题、背景、问题、先行研究、方法、独创性、计划 —— 严谨的研究方案。",
    bank: KENKYU_Q,
    getQuestions: kenkyuQuestions,
    needsProf: false,
    defaultLimit: 1500,
    steps: ["设定", "素材", "追问", "成稿"],
  },
};
