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
    hint: "具体的契机：一次旅行、一部作品、一位创作者、一段经历……越具体越好，别写「从小喜欢日本文化」。",
    placeholder: "例：高二时看到某位日本作家的个展，被…打动，于是开始…",
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
      ? ["why_japan", "why_school", "art_experience", "portfolio", "learn_plan", "future", "self_pr"]
      : ["why_japan", "why_school", "field_interest", "highschool", "learn_plan", "future", "self_pr"];
  }
  // grad / kenkyusei share grad bank
  return art
    ? ["grad_background", "why_grad", "why_lab", "research_theme", "professor", "portfolio", "future"]
    : ["grad_background", "why_grad", "why_lab", "research_theme", "professor", "research_method", "future"];
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
const MODULES = {
  shibo: {
    key: "shibo",
    name: "志望理由書",
    nameZh: "志望理由书",
    nameJp: "しぼうりゆうしょ",
    desc: "为什么是你、为什么是这所校、为什么是现在 —— 逻辑与情感兼具的核心叙事。按学部 / 大学院 + 美术 / 一般动态出题。",
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
