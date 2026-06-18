/* =========================================================
   app.js — wizard engine
   ========================================================= */

// ---------- tiny DOM helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const app = $("#app");
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
  return n;
}
function toast(msg, isErr = false, options = {}) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "") + (options.center ? " center" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.className = "toast"), 3200);
}

// ---------- state ----------
let S = null;
const MIN_MATERIAL_FIELDS = 2;

function freshState(moduleKey) {
  return {
    module: moduleKey,
    step: "setup",
    setup: {
      level: "ug",
      art: true,
      school: "",
      faculty: "",
      major: "",
      professor: "",
      limit: MODULES[moduleKey].defaultLimit,
      lang: "both",
      prompts: [],
    },
    intake: {},
    followups: [],
    followupAnswers: {},
    result: null,
    busy: false,
  };
}

const JAPAN_LIMIT_RULES = {
  shibo: {
    ug: { min: 500, max: 1200, source: "日本の志望理由書要項でよく見られる帯（校ごと差あり）" },
    grad: { min: 800, max: 1800, source: "大学院進学（志望理由書/志望動機）想定帯" },
    default: { min: 500, max: 1500, source: "日本の一般的な志望理由書運用帯" },
  },
  kenkyu: {
    default: { min: 1000, max: 3000, source: "研究計画書の一般的な字数帯（校ごと差あり）" },
  },
};

function getLimitPolicy() {
  const su = S.setup;
  const moduleRule = JAPAN_LIMIT_RULES[S.module] || {};
  const levelRule = moduleRule[su.level] || moduleRule.default;
  return levelRule || { min: 100, max: 5000, source: "系统默认范围" };
}

function formatLimitRangeHint(policy) {
  const min = policy.min;
  const max = policy.max;
  const source = policy.source || "日本入試一般要件";
  if (S?.module === "kenkyu") return `${source}（${min}〜${max}字）。募集要項に指定がなければ、まず 1500〜2000 字で作るのが無難です。`;
  return `${source}（${min}〜${max}字）`;
}

function clampLimit(v, fallback, min = 100, max = 5000) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function setBusy(v) {
  if (S) S.busy = v;
}

function charLen(v) {
  return Array.from(v || "").length;
}

function counterNode(value, target = 0) {
  const n = el("div", { class: "counter", "aria-live": "polite" });
  updateCounter(n, value, target);
  return n;
}

function updateCounter(node, value, target = 0) {
  const count = charLen(value);
  node.textContent = target ? `${count} / ${target} 字` : `${count} 字`;
  node.className = "counter" + (target && count > target * 1.12 ? " over" : count > 0 ? " good" : "");
}

function materialStats(ids) {
  const values = ids.map((id) => (S.intake[id] || "").trim()).filter(Boolean);
  return {
    filled: values.length,
    chars: values.reduce((sum, v) => sum + charLen(v), 0),
  };
}

function hasEnoughMaterial(ids) {
  return materialStats(ids).filled >= MIN_MATERIAL_FIELDS;
}

function getCoreMaterialIds(moduleKey, ids, setup = S?.setup || {}) {
  const wanted = moduleKey === "kenkyu"
    ? ["k_theme", "k_background", "k_question", "k_method", "k_current_result"]
    : setup.level === "ug"
      ? ["why_japan", "why_school", setup.art ? "art_experience" : "field_interest", "learn_plan"]
      : ["grad_background", "why_grad", "why_lab", "research_theme"];
  const core = wanted.filter((id) => ids.includes(id));
  return core.length ? core : ids.slice(0, Math.min(4, ids.length));
}

function validateLimitInRange() {
  const su = S.setup;
  const policy = getLimitPolicy();
  if (su.limit < policy.min) return `字数制限不低于 ${policy.min} 字（日本の要件側）`;
  if (su.limit > policy.max) return `字数制限不高于 ${policy.max} 字（日本の要件側）`;
  return "";
}

const OFFENSIVE_KEYWORDS = [
  "fuck", "fucking", "fucked", "shit", "bitch", "bastard", "idiot", "stupid",
  "asshole", "motherfucker", "f**k", "f*ck", "傻逼", "煞笔", "操你", "他妈", "他媽",
  "妈的", "你妈", "你娘", "智障", "白痴", "低能", "去死", "日你", "去你妈", "废青", "脑残",
  "sb", "cnm", "nmsl", "你大爹", "你妈逼", "fuck", "shit", "fuck", "cunt", "retard"
];
const TOXIC_PATTERNS = [
  /\b(你是?傻[逼|b])\b/u,
  /\b(操你妈|他妈的|狗娘养的)\b/u,
  /\b(cunt|retard)\b/i,
];

const INPUT_RULES = {
  setup: {
    school: { label: "志望校", required: true, minLen: 2, maxLen: 80 },
    faculty: { label: "学部・学科", required: true, minLen: 2, maxLen: 80, strict: false },
    major: { label: "专攻 / 课程", required: false, minLen: 2, maxLen: 80, strict: false },
    professor: { label: "指导教员", required: false, minLen: 2, maxLen: 50 },
    level: { label: "出願区分", required: true, allowed: ["ug", "grad"] },
    lang: { label: "输出语言", required: true, allowed: ["both", "jp"] },
    prompts: { label: "设问项", required: false, minSelected: 1, maxSelected: 10 },
  },
  intakeDefault: { label: "回答", required: false, minLen: 2, maxLen: 3000, strict: true },
  intake: {
    shibo: {
      why_japan: { label: "为什么选择来日本（学习）？", required: true, minLen: 12, maxLen: 3200, strict: true },
      domestic_training: { label: "你在中国的学习 / 训练背景", required: true, minLen: 16, maxLen: 3200, strict: true },
      language_preparation: { label: "日语学习和来日准备", required: false, minLen: 12, maxLen: 2400, strict: true },
      cross_cultural_view: { label: "中国经历如何影响你的作品 / 问题意识", required: true, minLen: 18, maxLen: 2800, strict: true },
      why_school: { label: "为什么是这所大学 / 这个学科？", required: true, minLen: 18, maxLen: 3200, strict: true },
      art_experience: { label: "你的创作 / 学习经历", required: true, minLen: 18, maxLen: 3200, strict: true },
      portfolio: { label: "最能代表你的 1–2 件作品", required: true, minLen: 16, maxLen: 3200, strict: true },
      learn_plan: { label: "入学后想学什么 / 想做什么样的创作", required: true, minLen: 16, maxLen: 2800, strict: true },
      field_interest: { label: "你对这个专业领域的兴趣从何而来？", required: true, minLen: 16, maxLen: 2600, strict: true },
      highschool: { label: "高中阶段最投入的事 / 取得的成果", required: true, minLen: 14, maxLen: 2600, strict: true },
      future: { label: "毕业后的目标 / 想从事的方向", required: true, minLen: 12, maxLen: 2200, strict: true },
      self_pr: { label: "你的特质 / 优势（自我 PR）", required: true, minLen: 12, maxLen: 2400, strict: true },
      grad_background: { label: "本科 / 既往的学习与创作背景", required: true, minLen: 16, maxLen: 3200, strict: true },
      graduation_work: { label: "毕业创作 / 毕业论文 / 代表研究", required: true, minLen: 18, maxLen: 3000, strict: true },
      why_grad: { label: "为什么读研？为什么来日本读？", required: true, minLen: 16, maxLen: 2800, strict: true },
      why_lab: { label: "为什么这个研究科 / 这个研究室？", required: true, minLen: 16, maxLen: 2800, strict: true },
      research_theme: { label: "想研究 / 创作的主题方向", required: true, minLen: 14, maxLen: 2800, strict: true },
      research_gap: { label: "为什么需要到日本继续推进？", required: true, minLen: 18, maxLen: 2600, strict: true },
      professor: { label: "希望师从的教员及理由", required: false, minLen: 12, maxLen: 2400, strict: true },
      research_method: { label: "大致的研究方法 / 关心的问题", required: true, minLen: 16, maxLen: 2600, strict: true },
    },
    kenkyu: {
      k_theme: { label: "研究 / 制作主题（暂定题目）", required: true, minLen: 16, maxLen: 3000, strict: true },
      k_background: { label: "研究背景 / 为什么是这个主题", required: true, minLen: 18, maxLen: 3200, strict: true },
      k_question: { label: "想厘清的核心问题", required: true, minLen: 16, maxLen: 3000, strict: true },
      k_prior: { label: "已知的相关研究 / 作家作品", required: false, minLen: 8, maxLen: 2600, strict: true },
      k_method: { label: "研究 / 制作方法、使用资料", required: true, minLen: 16, maxLen: 3000, strict: true },
      k_current_result: { label: "目前已有的作品 / 调查 / 研究成果", required: true, minLen: 12, maxLen: 3000, strict: true },
      k_originality: { label: "期待成果 / 独特性 / 意义", required: true, minLen: 12, maxLen: 2600, strict: true },
      k_schedule: { label: "大致的研究计划安排", required: false, minLen: 8, maxLen: 2200, strict: true },
    },
  },
  followupAnswer: { label: "追问回答", required: false, minLen: 2, maxLen: 2000 },
};

function hasProfanity(text) {
  const lower = text.toLowerCase();
  if (OFFENSIVE_KEYWORDS.some((w) => lower.includes(w))) return true;
  return TOXIC_PATTERNS.some((p) => p.test(text));
}

function validateTextValue(value, rules) {
  const raw = (value || "").trim();
  const label = rules.label || "输入";
  const minLen = Number.isFinite(rules.minLen) ? rules.minLen : 2;
  const maxLen = Number.isFinite(rules.maxLen) ? rules.maxLen : 3000;
  const strict = rules.strict !== false;

  if (!raw) return rules.required ? `${label}不能为空` : "";
  if (raw.length < minLen) return `${label}内容过短，请填写具体经历`;
  if (raw.length > maxLen) return `${label}内容过长，请精简后重写`;
  if (/^\d+$/.test(raw)) return `${label}不能全是数字`;
  const compact = raw.replace(/\s+/g, "");
  if (/^(.)\1{3,}$/u.test(compact)) return `${label}像是乱填（重复字符）`;
  if (/^\p{N}{2,}$/u.test(compact)) return `${label}不能是重复数字`;
  if (hasProfanity(raw)) return `${label}包含不当用语，请修改为正式表述`;
  const suspicious = [
    "测试", "乱填", "乱写", "随便", "asdf", "qwer", "xxxx", "test", "null", "undefined",
    "111111", "123456", "12345", "aaaa", "bbbb", "哈哈哈哈"
  ];
  const compactLower = compact.toLowerCase();
  if (suspicious.some((w) => compactLower === w || compact.includes(w))) return `${label}疑似乱填，请认真填写真实信息`;
  if (!strict) return "";
  if (/^[a-z]{2,}$/i.test(compact) && compact.length < 6) return `${label}像是无意义英文`;
  if (!/[\p{L}\p{N}]/u.test(compact)) return `${label}请填写可识别文字`;

  return "";
}

function validateOptionValue(value, rules) {
  const label = rules.label || "选项";
  if (!value) {
    return rules.required ? `${label}不能为空` : "";
  }
  if (rules.allowed && !rules.allowed.includes(value)) return `${label}选择无效`;
  if (Number.isFinite(rules.minSelected) && Array.isArray(value) && value.length < rules.minSelected) return `${label}至少保留 ${rules.minSelected} 项`;
  if (Number.isFinite(rules.maxSelected) && Array.isArray(value) && value.length > rules.maxSelected) return `${label}最多只能保留 ${rules.maxSelected} 项`;
  return "";
}

function validateSetupInputs() {
  const su = S.setup;
  const issues = [];
  const levelIssue = validateOptionValue(su.level, INPUT_RULES.setup.level);
  if (levelIssue) issues.push(levelIssue);
  const langIssue = validateOptionValue(su.lang, INPUT_RULES.setup.lang);
  if (langIssue) issues.push(langIssue);
  if (S.module === "shibo") {
    const promptRule = validateOptionValue(su.prompts, INPUT_RULES.setup.prompts);
    if (promptRule) issues.push(promptRule);
    const validPrompts = shiboPromptKey(su.level, su.art);
    const bank = SHIBO_PROMPTS[validPrompts] || [];
    const allowed = bank.map((p) => p.q);
    const extra = (su.prompts || []).find((p) => !allowed.includes(p));
    if (extra) issues.push(`设问项存在无效选项：${extra}`);
  }
  const school = validateTextValue(su.school, INPUT_RULES.setup.school);
  if (school) issues.push(school);
  const faculty = validateTextValue(su.faculty, INPUT_RULES.setup.faculty);
  if (faculty) issues.push(faculty);
  const major = validateTextValue(su.major, INPUT_RULES.setup.major);
  if (major) issues.push(major);
  const professor = validateTextValue(su.professor, INPUT_RULES.setup.professor);
  if (professor) issues.push(professor);
  return issues;
}

function validateMaterialInputs(ids) {
  const M = MODULES[S.module];
  const bank = M.bank;
  const coreSet = new Set(getCoreMaterialIds(S.module, ids, S.setup));
  const issues = [];
  ids.forEach((qid) => {
    const q = bank[qid];
    if (!q) return;
    const label = q.label || qid;
    const answer = (S.intake[qid] || "").trim();
    const moduleRules = INPUT_RULES.intake[S.module] || {};
    const custom = moduleRules[qid] || {};
    const required = false;
    if (!required && !answer) return;
    const rules = {
      ...INPUT_RULES.intakeDefault,
      ...custom,
      label,
      required,
      maxLen: Number.isFinite(custom.maxLen) ? custom.maxLen : (q.maxLen || INPUT_RULES.intakeDefault.maxLen),
    };
    const issue = validateTextValue(answer, rules);
    if (issue) issues.push(issue);
  });
  return issues;
}

function validateFollowupAnswers() {
  const issues = [];
  S.followups.forEach((f, idx) => {
    const answer = (S.followupAnswers[idx] || "").trim();
    if (!answer) return;
    const issue = validateTextValue(answer, { ...INPUT_RULES.followupAnswer, label: `追问${idx + 1}回答` });
    if (issue) issues.push(issue);
  });
  return issues;
}

function onActivate(fn) {
  return (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    fn(e);
  };
}

function safeFileName(v) {
  return (v || "draft").trim().replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, "_").slice(0, 80) || "draft";
}

const FOLLOWUP_SCHEMA = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "OBJECT",
        properties: {
          q_cn: { type: "STRING" },
          q_jp: { type: "STRING" },
          why: { type: "STRING" },
        },
        required: ["q_cn", "q_jp", "why"],
        propertyOrdering: ["q_cn", "q_jp", "why"],
      },
    },
  },
  required: ["questions"],
  propertyOrdering: ["questions"],
};

const DRAFT_SCHEMA = {
  type: "OBJECT",
  properties: {
    jp: { type: "STRING" },
    cn: { type: "STRING" },
    tips: {
      type: "ARRAY",
      minItems: 1,
      maxItems: 5,
      items: { type: "STRING" },
    },
  },
  required: ["jp", "cn", "tips"],
  propertyOrdering: ["jp", "cn", "tips"],
};

// ---------- starfield ----------
(function starfield() {
  const c = $("#starfield");
  const ctx = c.getContext("2d");
  let stars = [];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function resize() {
    c.width = innerWidth;
    c.height = innerHeight;
    const n = Math.min(140, Math.floor((innerWidth * innerHeight) / 14000));
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * c.width,
      y: Math.random() * c.height,
      r: Math.random() * 1.3 + 0.2,
      a: Math.random() * 0.6 + 0.2,
      tw: Math.random() * 0.02 + 0.004,
      ph: Math.random() * Math.PI * 2,
      gold: Math.random() < 0.18,
    }));
  }
  function draw() {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of stars) {
      s.ph += s.tw;
      const a = reduce ? s.a : s.a + Math.sin(s.ph) * 0.25;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.gold
        ? `rgba(230,192,104,${Math.max(0, a)})`
        : `rgba(220,226,255,${Math.max(0, a * 0.8)})`;
      ctx.fill();
    }
    if (!reduce) requestAnimationFrame(draw);
  }
  resize();
  draw();
  addEventListener("resize", resize);
})();

// ---------- navigation ----------
function goHome() {
  S = null;
  $("#topbarStep").textContent = "";
  renderHome();
}
$("#brandHome").addEventListener("click", goHome);
$("#brandHome").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    goHome();
  }
});

function setStep(step) {
  if (!S) return;
  S.step = step;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------- render router ----------
function render() {
  if (!S) return renderHome();
  const M = MODULES[S.module];
  $("#topbarStep").textContent = `${M.nameZh}`;
  app.innerHTML = "";
  app.appendChild(constellation());
  if (S.step === "setup") renderSetup();
  else if (S.step === "intake") renderIntake();
  else if (S.step === "followup") renderFollowup();
  else if (S.step === "result") renderResult();
}

// ---------- constellation progress ----------
function constellation() {
  const M = MODULES[S.module];
  const order = ["setup", "intake", "followup", "result"];
  const idx = order.indexOf(S.step);
  const wrap = el("div", { class: "constel" });
  wrap.appendChild(el("div", { class: "constel-line" }));
  const fill = el("div", { class: "constel-line-fill" });
  fill.style.width = `calc((100% - 44px) * ${idx / (order.length - 1)})`;
  wrap.appendChild(fill);
  M.steps.forEach((label, i) => {
    const cls = "constel-node" + (i < idx ? " done" : i === idx ? " active" : "");
    wrap.appendChild(
      el("div", { class: cls },
        el("div", { class: "constel-star", html: i < idx ? "&#10003;" : "" }),
        el("div", { class: "constel-label" }, label)
      )
    );
  });
  return wrap;
}

// ---------- HOME ----------
function renderHome() {
  app.innerHTML = "";
  const hero = el("div", { class: "hero fade-in" },
    el("div", { class: "hero-eyebrow" }, "www.nissinart.com"),
    el("h1", { class: "hero-title" }, "出願神器"),
    el("div", { class: "hero-rule" })
  );
  app.appendChild(hero);

  const grid = el("div", { class: "module-grid fade-in" });
  ["shibo", "kenkyu"].forEach((key, i) => {
    const M = MODULES[key];
    const card = el("div", {
      class: "module-card",
      role: "button",
      tabindex: "0",
      onclick: () => startModule(key),
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          startModule(key);
        }
      },
    },
      el("div", { class: "module-num" }, "0" + (i + 1)),
      el("div", { class: "module-name" }, M.name),
      el("div", { class: "module-name-jp" }, M.nameJp),
      el("div", { class: "module-desc" }, M.desc),
      el("div", { class: "module-go" }, "开始", el("span", { class: "arrow" }, "→"))
    );
    grid.appendChild(card);
  });
  app.appendChild(grid);

}

function startModule(key) {
  S = freshState(key);
  render();
  window.scrollTo({ top: 0 });
}

// ---------- STEP 1: SETUP ----------
function promptZh(q) {
  const map = {
    "本学・本学科を志望する理由": "为什么选择本校 / 本学科",
    "これまでの制作・美術活動について": "过往制作 / 美术活动",
    "入学後に学びたいこと・制作したいもの": "入学后想学和想做的创作",
    "将来の目標・進路": "毕业后的目标 / 进路",
    "なぜ日本で学びたいのか": "为什么想在日本学习",
    "本学・本学部を志望する理由": "为什么选择本校 / 本学部",
    "高校時代に力を入れたこと": "高中阶段投入最多的事",
    "入学後の学修計画": "入学后的学习计划",
    "将来の目標": "未来目标",
    "自己 PR": "自我优势",
    "本研究科を志望する理由": "为什么选择本研究科",
    "これまでの研究・制作活動": "过往研究 / 制作活动",
    "本学で取り組みたい研究・制作テーマ": "入学后想推进的研究 / 制作主题",
    "指導を希望する教員とその理由": "希望指导教员及理由",
    "修了後の進路・目標": "修了后的进路 / 目标",
    "これまでの研究内容・関心": "过往研究内容 / 关心方向",
    "入学後の研究計画の概要": "入学后的研究计划概要",
    "希望指導教員": "希望指导教员",
    "修了後の展望": "修了后的展望"
  };
  return map[q] || "";
}

function renderSetup() {
  const M = MODULES[S.module];
  const isShibo = S.module === "shibo";
  const su = S.setup;

  const panel = el("div", { class: "panel fade-in" });
  panel.appendChild(el("div", { class: "step-head" },
    el("div", { class: "step-kicker" }, "Step 01"),
    el("div", { class: "step-title" }, "设定 · 基本情報"),
    el("div", { class: "step-desc" }, "先告诉我目标和形式，后面的问题会据此调整。")
  ));

  // 区分 (shibo only)
  if (isShibo) {
    const levels = [
      ["ug", "学部", "学部"],
      ["grad", "大学院", "大学院"],
    ];
    panel.appendChild(fieldSeg("申请阶段", "出願区分", levels, su.level, (v) => {
      su.level = v;
      su.prompts = [];
      render();
    }));
  }

  // school / faculty
  panel.appendChild(el("div", { class: "row" },
    fieldText("志望校", "大学名", "school", su.school, "例：武蔵野美術大学"),
    fieldText(isShibo && su.level === "ug" ? "学部・学科" : "研究科・専攻", isShibo && su.level === "ug" ? "学部・学科" : "研究科・専攻", "faculty", su.faculty, "例：造形学部 油絵学科")
  ));
  panel.appendChild(el("div", { class: "row" },
    fieldText("专攻 / 课程", "コース", "major", su.major, "例：版画 / 选填", true),
    (S.module === "kenkyu" || (isShibo && su.level === "grad"))
      ? fieldText("希望指导教员", "指導希望教員", "professor", su.professor, "确认过研究方向再填 / 选填", true)
      : el("div")
  ));

  // 設問库 (shibo only)
  if (isShibo) {
    const key = shiboPromptKey(su.level, su.art);
    const list = SHIBO_PROMPTS[key];
    if (su.prompts.length === 0) su.prompts = list.filter((p) => p.on).map((p) => p.q);
    const wrap = el("div", { class: "field" },
      el("div", { class: "field-label" }, "学校要求你回答哪些内容 ", el("span", { class: "jp" }, "設問構成")),
      el("div", { class: "field-hint" }, "按募集要项勾选需要回答的内容；不确定就先用推荐项。")
    );
    list.forEach((p) => {
      const on = su.prompts.includes(p.q);
      const toggle = () => {
        const i = su.prompts.indexOf(p.q);
        if (i >= 0) su.prompts.splice(i, 1);
        else su.prompts.push(p.q);
        render();
      };
      const c = el("div", {
        class: "check" + (on ? " on" : ""),
        role: "checkbox",
        tabindex: "0",
        "aria-checked": on ? "true" : "false",
        onclick: toggle,
        onkeydown: onActivate(toggle),
      },
        el("div", { class: "check-box", html: '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 6l3 3 5-6" stroke="#20180a" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' }),
        el("div", { class: "check-body" }, el("div", { class: "check-jp", style: "font-size:13px;color:var(--ink)" }, p.q), promptZh(p.q) ? el("div", { class: "check-cn" }, promptZh(p.q)) : null)
      );
      wrap.appendChild(c);
    });
    panel.appendChild(wrap);
  }

  // 字数 + 语言
  const policy = getLimitPolicy();
  su.limit = clampLimit(su.limit, policy.min, policy.min, policy.max);
  panel.appendChild(el("div", { class: "row" },
    el("div", { class: "field" },
      fieldNumber("字数上限", "字数制限", "limit", su.limit, "字", policy.min, policy.max),
      el("div", { class: "field-hint" }, `${S.module === "kenkyu" ? "按募集要项上限选择；没有写就先选 1500。" : "如果募集要项写 800 字以内，就选 800。"}${formatLimitRangeHint(policy)}`)
    ),
    fieldSelect("输出语言", "出力言語", "lang", su.lang, [
      ["both", "日文 + 中文对照"],
      ["jp", "仅日文"],
    ])
  ));

  // actions
  panel.appendChild(el("div", { class: "actions" },
    el("button", { class: "btn btn-ghost", onclick: goHome }, "← 返回"),
    el("div", { class: "spacer" }),
    el("button", { class: "btn btn-primary", disabled: S.busy, onclick: () => {
      if (S.busy) return;
      const issues = validateSetupInputs();
        const limitIssue = validateLimitInRange();
        if (limitIssue) return toast(limitIssue, true);
        if (issues.length) return toast(issues[0], true);
        setStep("intake");
    } }, "下一步 · 填素材 →")
  ));

  app.appendChild(panel);

  // ---- small field builders bound to su ----
  function bind(id) { return (e) => { su[id] = e.target.value; }; }
  function fieldText(label, jp, id, val, ph, optional) {
    return el("div", { class: "field" },
      labelRow(label, jp, !optional),
      el("input", {
        id,
        name: id,
        type: "text",
        value: val,
        placeholder: ph,
        oninput: bind(id),
        onblur: bind(id),
      })
    );
  }
  function fieldArea(label, jp, id, val, hint, optional, big) {
    const counter = counterNode(val);
    const ta = el("textarea", {
      placeholder: "",
      oninput: (e) => {
        su[id] = e.target.value;
        updateCounter(counter, e.target.value);
      },
      onblur: bind(id),
      value: val,
      style: big ? "min-height:74px" : "",
    }, val || "");
    return el("div", { class: "field" },
      labelRow(label, jp, !optional),
      hint ? el("div", { class: "field-hint" }, hint) : null,
      ta,
      counter
    );
  }
  function fieldNumber(label, jp, id, val, unit, min, max) {
    const lower = Number.isFinite(min) ? min : 100;
    const upper = Number.isFinite(max) ? max : 5000;
    const base = clampLimit(val, lower, lower, upper);
    return el("div", { class: "field" },
      labelRow(label, jp, true),
      el("input", {
        id,
        name: id,
        type: "number",
        value: base,
        min: String(lower),
        max: String(upper),
        step: "50",
        oninput: (e) => {
          su[id] = clampLimit(e.target.value, lower, lower, upper);
        },
      })
    );
  }
  function fieldSelect(label, jp, id, val, opts) {
    const sel = el("select", { id, name: id, onchange: bind(id), onblur: bind(id) });
    opts.forEach(([v, t]) => sel.appendChild(el("option", { value: v, ...(v === val ? { selected: "selected" } : {}) }, t)));
    return el("div", { class: "field" }, labelRow(label, jp, false), sel);
  }
  function fieldSeg(label, jp, opts, val, onpick) {
    const seg = el("div", { class: "seg" });
    opts.forEach(([v, t, j]) => seg.appendChild(
      el("div", {
        class: "seg-opt" + (v === val ? " on" : ""),
        role: "button",
        tabindex: "0",
        "aria-pressed": v === val ? "true" : "false",
        onclick: () => onpick(v),
        onkeydown: onActivate(() => onpick(v)),
      },
        t, el("span", { class: "jp" }, j))));
    return el("div", { class: "field" }, labelRow(label, jp, false), seg);
  }
}

function labelRow(label, jp, req) {
  return el("div", { class: "field-label" }, label,
    jp ? el("span", { class: "jp" }, jp) : null,
    req ? el("span", { class: "req" }, "＊") : null);
}

// ---------- STEP 2: INTAKE ----------
function renderIntake() {
  const M = MODULES[S.module];
  const su = S.setup;
  const ids = S.module === "shibo" ? M.getQuestions(su.level, su.art) : M.getQuestions();
  const bank = M.bank;
  const coreIds = getCoreMaterialIds(S.module, ids, su);
  const coreSet = new Set(coreIds);
  const supplementalIds = ids.filter((qid) => !coreSet.has(qid));

  const panel = el("div", { class: "panel fade-in" });
  panel.appendChild(el("div", { class: "step-head" },
    el("div", { class: "step-kicker" }, "Step 02"),
    el("div", { class: "step-title" }, "素材 · 真实内容"),
    el("div", { class: "step-desc" }, S.module === "kenkyu"
      ? "先填主题、背景、问题、方法和已有成果；其余内容有把握再补。"
      : "先填 2–3 项最有把握的真实素材；其余有内容再补。")
  ));

  const meterCount = el("span", { class: "meter-count" });
  const meterHint = el("span", { class: "meter-hint" });
  const meter = el("div", { class: "material-meter" }, meterCount, meterHint);
  const gateHint = el("div", { class: "action-hint" });
  let directButton;
  let followButton;
  let updateMaterialMeter = () => {};

  const renderQuestion = (qid) => {
    const q = bank[qid];
    if (!q) return null;
    const value = S.intake[qid] || "";
    const counter = counterNode(value);
    const ta = el("textarea", {
      id: qid,
      name: qid,
      placeholder: q.placeholder || "",
      oninput: (e) => {
        S.intake[qid] = e.target.value;
        updateCounter(counter, e.target.value);
        updateMaterialMeter();
      },
      onblur: (e) => { S.intake[qid] = e.target.value; },
    }, value);
    return el("div", { class: "field material-question" },
      labelRow(q.label, q.jp, coreSet.has(qid)),
      q.hint ? el("div", { class: "field-hint" }, q.hint) : null,
      ta,
      counter);
  };

  const appendQuestionGroup = (title, subtitle, groupIds, optional = false) => {
    if (!groupIds.length) return;
    const body = el("div", { class: "material-section-body" });
    groupIds.forEach((qid) => {
      const node = renderQuestion(qid);
      if (node) body.appendChild(node);
    });
    if (optional) {
      const group = el("details", { class: "material-section supplemental" },
        el("summary", { class: "material-section-head" },
          el("span", { class: "material-section-title" }, title),
          el("span", { class: "material-section-sub" }, subtitle)
        ),
        body
      );
      panel.appendChild(group);
      return;
    }
    panel.appendChild(el("section", { class: "material-section required" },
      el("div", { class: "material-section-head" },
        el("div", { class: "material-section-title" }, title),
        el("div", { class: "material-section-sub" }, subtitle)
      ),
      body
    ));
  };

  appendQuestionGroup("核心素材", "带 ＊ 的题请优先填；至少先完成 2 项，AI 会把不足处列入追问。", coreIds);
  appendQuestionGroup("补充素材", "展开后可补充更多细节；没有真实内容就留空。", supplementalIds, true);

  updateMaterialMeter = () => {
    const stats = materialStats(ids);
    const coreStats = materialStats(coreIds);
    const ready = coreStats.filled >= MIN_MATERIAL_FIELDS;
    meter.className = "material-meter" + (ready ? " ready" : "");
    meterCount.textContent = `${stats.filled}/${ids.length} 项素材`;
    meterHint.textContent = ready
      ? `核心素材 ${coreStats.filled}/${coreIds.length} 项，已可生成`
      : `至少先填写 ${MIN_MATERIAL_FIELDS} 项核心素材，才能追问或成稿`;
    if (directButton) directButton.disabled = S.busy || !ready;
    if (followButton) followButton.disabled = S.busy || !ready;
    gateHint.textContent = ready ? "" : `还差 ${Math.max(0, MIN_MATERIAL_FIELDS - coreStats.filled)} 项核心素材。先补真实内容，再让 AI 整理。`;
    gateHint.hidden = ready;
  };
  updateMaterialMeter();
  panel.appendChild(meter);

  directButton = el("button", { class: "btn btn-ghost", disabled: true, onclick: () => doGenerate(true) }, "直接生成初稿");
  followButton = el("button", { class: "btn btn-primary", disabled: true, onclick: doFollowup }, "先让 AI 追问");
  panel.appendChild(el("div", { class: "actions" },
    el("button", { class: "btn btn-ghost", disabled: S.busy, onclick: () => setStep("setup") }, "← 上一步"),
    el("div", { class: "spacer" }),
    directButton,
    followButton
  ));
  panel.appendChild(gateHint);
  updateMaterialMeter();
  app.appendChild(panel);
}

// ---------- STEP 3: AI FOLLOWUP ----------
async function doFollowup() {
  if (S.busy) return;
  const M = MODULES[S.module];
  const su = S.setup;
  const ids = S.module === "shibo" ? M.getQuestions(su.level, su.art) : M.getQuestions();
  const limitIssue = validateLimitInRange();
  if (limitIssue) return toast(limitIssue, true);
  const setupIssues = validateSetupInputs();
  if (setupIssues.length) return toast(setupIssues[0], true);
  const coreIds = getCoreMaterialIds(S.module, ids, su);
  const badInputs = validateMaterialInputs(ids);
  if (badInputs.length) return toast(`以下内容未通过校验：${badInputs.slice(0, 3).join("；")}，请认真填写真实内容。`, true);
  if (!hasEnoughMaterial(coreIds)) return toast(`至少填 ${MIN_MATERIAL_FIELDS} 项核心素材，AI 才能有效追问`, true);
  const followupReadyBad = validateFollowupAnswers();
  if (followupReadyBad.length) return toast(`追问字段有无效内容：${followupReadyBad.slice(0, 3).join("；")}`, true);

  setBusy(true);
  S.step = "followup";
  S.followups = [];
  renderLoading("AI 正在审阅你的素材…", "找出空泛、断裂、缺细节的地方");

  const system = S.module === "kenkyu"
    ? `あなたは日本の美術大学院入試に詳しい研究計画書の指導者です。中国人留学生が提供した「${M.name}」の素材を読み、研究テーマ、背景、リサーチクエスチョン、方法、資料、現時点までの成果、期待される成果、ポートフォリオや面接との整合性を確認します。追加質問では、本人がまだ書いていない具体的な制作・調査・先行研究・資料・年次計画だけを引き出してください。鉄則：事実、読んでいない文献、存在しない作品、教授との接触、受賞歴を捏造させない。研究として成立しない広すぎるテーマは、対象・方法・成果に分解して聞く。`
    : `あなたは日本の大学・大学院出願の専門指導者です。中国人留学生が提供した「${M.name}」の素材を読み、説得力に欠ける点・抽象的すぎる点・論理の飛躍・具体性の不足を見抜きます。学生は中国で学習・制作・研究を重ね、日本でさらに深めようとしている留学生です。追加質問では、留学の必然性、大学・学部の志望理由、制作意欲、入学後の展望、日本語・面接準備が本人の素材から説明できるかを確認してください。鉄則：事実を捏造させる質問はしない。中国での経験を低く見せたり、日本を空泛に称賛させたりしない。一般論ではなく、その学生の回答に即した質問をする。`;

  const prompt = buildContext() +
    `\n\n上記をふまえ、より良い${M.name}にするために本人へ尋ねるべき追加質問を 3〜4 個、日本語と中国語で作成してください。各質問にはなぜそれを聞くのか（why）も添えてください。\n` +
    `次の JSON のみを出力（前後に説明や\`\`\`は不要）：\n` +
    `{"questions":[{"q_cn":"中文问题","q_jp":"日本語の質問","why":"中文：为什么问这个"}]}`;

  try {
    const text = await callAPI(prompt, system, FOLLOWUP_SCHEMA);
    const data = parseJSON(text);
    S.followups = (data.questions || []).slice(0, 4);
    if (S.followups.length === 0) throw new Error("no questions");
    setBusy(false);
    render();
  } catch (e) {
    setBusy(false);
    toast("追问生成失败，可直接成稿：" + (e.message || ""), true);
    setStep("intake");
  }
}

function renderFollowup() {
  const panel = el("div", { class: "panel fade-in" });
  panel.appendChild(el("div", { class: "step-head" },
    el("div", { class: "step-kicker" }, "Step 03"),
    el("div", { class: "step-title" }, "追问 · 挖出细节"),
    el("div", { class: "step-desc" }, "这些是 AI 觉得最该补充的地方。回答得越具体，成稿越像你本人。可留空。")
  ));
  panel.appendChild(el("div", { class: "ai-banner" },
    el("div", { class: "ico" }, "✦"),
    el("div", { class: "txt" }, "下面的回答只用来丰富你的真实素材，不会被编造。答不上来的可以跳过。")
  ));

  S.followups.forEach((f, i) => {
    panel.appendChild(el("div", { class: "fq" },
      el("div", { class: "fq-q" }, el("span", { class: "fq-num" }, (i + 1) + "."), el("span", {}, f.q_cn || f.q_jp)),
      f.q_jp ? el("div", { class: "fq-jp" }, f.q_jp) : null,
      f.why ? el("div", { class: "fq-why" }, "— " + f.why) : null,
      el("textarea", {
        placeholder: "（可留空）",
        oninput: (e) => { S.followupAnswers[i] = e.target.value; },
        onblur: (e) => { S.followupAnswers[i] = e.target.value; },
      }, S.followupAnswers[i] || "")
    ));
  });

  panel.appendChild(el("div", { class: "actions" },
    el("button", { class: "btn btn-ghost", disabled: S.busy, onclick: () => setStep("intake") }, "← 上一步"),
    el("div", { class: "spacer" }),
    el("button", { class: "btn btn-primary", disabled: S.busy, onclick: () => doGenerate(false) }, "生成志望理由書 →")
  ));
  if (S.module === "kenkyu") panel.querySelector(".btn-primary").textContent = "生成研究計画書 →";
  app.appendChild(panel);
}

// ---------- STEP 4: GENERATE ----------
async function doGenerate(skipFollowup) {
  if (S.busy) return;
  const M = MODULES[S.module];
  const su = S.setup;
  const ids = S.module === "shibo" ? M.getQuestions(su.level, su.art) : M.getQuestions();
  const limitIssue = validateLimitInRange();
  if (limitIssue) return toast(limitIssue, true);
  const setupIssues = validateSetupInputs();
  if (setupIssues.length) return toast(setupIssues[0], true);
  const coreIds = getCoreMaterialIds(S.module, ids, su);
  const badInputs = validateMaterialInputs(ids);
  if (badInputs.length) return toast(`以下输入未通过校验：${badInputs.slice(0, 3).join("；")}，请先认真补充再成稿。`, true);
  if (!hasEnoughMaterial(coreIds)) return toast(`至少填 ${MIN_MATERIAL_FIELDS} 项核心素材，才能生成初稿`, true);
  const followupBad = validateFollowupAnswers();
  if (followupBad.length) return toast(`追问回答存在问题：${followupBad.slice(0, 3).join("；")}`, true);

  setBusy(true);
  S.step = "result";
  renderLoading("AI 正在撰写…", "对照设问、卡准字数、规避套话");

  const structure = su.prompts && su.prompts.length
    ? su.prompts.map((p, i) => `${i + 1}. ${p}`).join("\n")
    : "（学生未指定设问，按该类文书的标准结构组织）";

  const system = S.module === "kenkyu"
    ? `あなたは日本の美術大学院入試に詳しい研究計画書の編集者です。学生本人が提供した素材だけを用いて、研究テーマ、背景、問い、方法、資料、現時点までの成果、期待される成果、年次計画が論理的につながる日本語の${M.name}を作成します。学生は中国人留学生です。中国での制作・研究経験を土台にしつつ、日本の研究室・制作環境で何を深めるのかを誠実に示してください。鉄則：(1) 素材にない事実、先行研究、作品名、調査実績、受賞歴、教授との接触を捏造しない。(2) 研究として広すぎる表現は、対象・方法・資料・成果に絞って書く。(3) 指定字数に従い、面接で説明できる内容だけを書く。(4) 「社会に貢献したい」などの常套句でごまかさず、計画の実行可能性を優先する。`
    : `あなたは日本の大学出願書類の作成を支援するプロの編集者です。学生本人が提供した素材だけを用いて、自然で説得力のある、審査員に響く日本語の${M.name}を作成します。学生は中国人留学生です。中国での学習・制作・研究経験、日語学習や来日準備、作品集・卒業制作・問題意識から、留学の必然性、志望校での目標、入学後の展望へ自然につなげてください。中国での経験を低く見せたり、日本を空泛に称賛したりせず、留学生としての視点を誠実に表現します。鉄則：(1) 素材にない事実・経験・固有名詞・受賞歴・日語資格・教授との接触を捏造しない。情報が足りない箇所は無理に埋めず、自然に簡潔にする。(2)\u300c私は幼い頃から\u300d、\u300c貴校の充実した環境\u300dなどのありがちな決まり文句や、いかにも AI が書いたような常套句を避ける。(3) 指定の字数と設問構成に従う。字数超過しそうな場合は具体性を保ったまま情報を取捨選択する。(4) 一人の学生の個性・声が滲む文章にする。誇張しない。`;

  let prompt = buildContext();
  if (!skipFollowup && S.followups.length) {
    prompt += "\n\n【追加で引き出した素材】\n";
    S.followups.forEach((f, i) => {
      const a = (S.followupAnswers[i] || "").trim();
      if (a) prompt += `Q: ${f.q_cn || f.q_jp}\nA: ${a}\n`;
    });
  }
  prompt += `\n\n【出力する設問構成】\n${structure}\n`;
  prompt += `\n【字数】日本語で約 ${su.limit} 字（±10%）。\n`;
  prompt += `\n【本文形式】設問構成は内容の順序を決めるためのものです。本文中に「1.」「2.」などの番号見出しを入れず、自然な段落の文章として書いてください。指定字数を超えそうな場合は、素材を全部並べず、志望理由に効く情報を優先して短くまとめてください。\n`;
  prompt += `\n次の JSON のみを出力（前後の説明や\`\`\`は不要）：\n` +
    `{"jp":"日本語の${M.name}本文","cn":"中文对照译文（帮助学生理解，并非逐字直译，可意译通顺）","tips":["中文：面接前需要补强/确认的3条建议"]}`;

  try {
    const text = await callAPI(prompt, system, DRAFT_SCHEMA);
    const data = parseJSON(text);
    if (!data.jp) throw new Error("empty");
    S.result = { jp: data.jp, cn: data.cn || "", tips: data.tips || [] };
    S.activeTab = "jp";
    setBusy(false);
    render();
  } catch (e) {
    setBusy(false);
    toast("生成失败，请重试：" + (e.message || ""), true);
    setStep(S.followups.length ? "followup" : "intake");
  }
}

function renderResult() {
  const M = MODULES[S.module];
  const r = S.result;
  const su = S.setup;
  const panel = el("div", { class: "panel fade-in" });
  panel.appendChild(el("div", { class: "step-head" },
    el("div", { class: "step-kicker" }, "Step 04"),
    el("div", { class: "step-title" }, "成稿 · " + M.name),
    el("div", { class: "step-desc" }, "这是初稿，不是终稿。务必通读、用自己的话改一遍，确认每个事实都属实。")
  ));

  // tabs
  const hasCn = su.lang === "both" && r.cn;
  if (!S.activeTab) S.activeTab = "jp";
  if (hasCn) {
    const tabs = el("div", { class: "result-tabs" });
    [["jp", "日本語"], ["cn", "中文对照"]].forEach(([v, t]) =>
      tabs.appendChild(el("button", {
        class: "result-tab" + (S.activeTab === v ? " on" : ""),
        onclick: () => {
          S.activeTab = v;
          render();
        },
      }, t))
    );
    panel.appendChild(tabs);
  }

  const body = S.activeTab === "cn" ? r.cn : r.jp;
  const count = Array.from(r.jp || "").length;
  const ratio = count / (su.limit || 1);
  const badgeClass = ratio > 1.12 ? "badge over" : ratio > 0.85 ? "badge good" : "badge";
  panel.appendChild(el("div", { class: "result-meta" },
    el("span", { class: badgeClass }, `${count} 字 / 上限 ${su.limit}`),
    el("span", { class: "badge" }, su.school || M.name)
  ));

  panel.appendChild(el("div", { class: "result-doc" + (S.activeTab === "cn" ? " zh" : "") }, body));

  panel.appendChild(el("div", { class: "copy-row" },
    el("button", { class: "btn btn-ghost", disabled: S.busy, onclick: () => copy(r.jp) }, "复制日文"),
    hasCn ? el("button", { class: "btn btn-ghost", disabled: S.busy, onclick: () => copy(r.cn) }, "复制中文") : null,
    el("button", { class: "btn btn-ghost", disabled: S.busy, onclick: () => downloadTxt(r) }, "下载 .txt")
  ));

  // tips
  if (r.tips && r.tips.length) {
    const tips = el("div", { class: "tips" }, el("div", { class: "tips-title" }, "面接前 · 待补强"));
    r.tips.forEach((t, i) => tips.appendChild(
      el("div", { class: "tip" }, el("span", { class: "ti-num" }, (i + 1) + ""), el("span", {}, t))
    ));
    panel.appendChild(tips);
  }

  panel.appendChild(el("div", { class: "disclaimer" },
    "⚠️ AI 可能写入你没提供的细节或弄错教员方向 —— 逐句核对，凡是不属实的一律删改。志望理由書是你自己的承诺，面接官会照着问。"));

  panel.appendChild(el("div", { class: "actions" },
    el("button", { class: "btn btn-ghost", disabled: S.busy, onclick: () => S.followups.length ? setStep("followup") : setStep("intake") }, "← 改素材"),
    el("div", { class: "spacer" }),
    el("button", { class: "btn btn-ghost", disabled: S.busy, onclick: () => S.followups.length ? doGenerate(false) : doGenerate(true) }, "↻ 重新生成"),
    el("button", { class: "btn btn-primary", disabled: S.busy, onclick: goHome }, "完成 · 回首页")
  ));
  app.appendChild(panel);
}

// ---------- shared: context builder ----------
function buildContext() {
  const M = MODULES[S.module];
  const su = S.setup;
  const bank = M.bank;
  const ids = S.module === "shibo" ? M.getQuestions(su.level, su.art) : M.getQuestions();
  const levelMap = { ug: "学部", grad: "大学院" };

  let out = `【文書種別】${M.name}\n`;
  if (S.module === "shibo") out += `【出願区分】${levelMap[su.level]} / ${su.art ? "美術系" : "一般"}\n`;
  out += `【志望校】${su.school}\n`;
  if (su.faculty) out += `【学部・研究科】${su.faculty}\n`;
  if (su.major) out += `【専攻・コース】${su.major}\n`;
  if (su.professor) out += `【希望指導教員】${su.professor}\n`;
  out += `\n【学生が提供した素材】（事実の箇条書き。捏造禁止、不足はそのまま扱う）\n`;
  ids.forEach((qid) => {
    const q = bank[qid];
    const a = (S.intake[qid] || "").trim();
    if (q && a) out += `■ ${q.jp}（${q.label}）\n${a}\n\n`;
  });
  return out;
}

// ---------- API ----------
function humanizeAPIError(error, detail) {
  const detailText = Array.isArray(detail) ? detail.join("；") : (detail || "");
  const combined = `${error || ""} ${detailText}`;
  if (/quota|rate limit|rate-limits|429/i.test(combined)) {
    return "AI 额度已用完或触发频率限制。请稍后再试，或请管理员在 Vercel 更新 GEMINI_API_KEY / 配置 ANTHROPIC_API_KEY。";
  }
  if (/high demand|UNAVAILABLE|503/i.test(combined)) {
    return "AI 服务当前繁忙。系统已自动重试但仍失败，请稍后再试。";
  }
  return detailText ? `${error} (${detailText})` : error;
}

async function callAPI(prompt, system, schema) {
  const resp = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, system, schema }),
  });
  if (!resp.ok) {
    let msg = `服务错误 ${resp.status}`;
    try {
      const e = await resp.json();
      msg = humanizeAPIError(e.error || msg, e.detail);
    } catch {}
    throw new Error(msg);
  }
  const data = await resp.json();
  return data.text;
}

function parseJSON(text) {
  let t = (text || "").trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try {
    return JSON.parse(t);
  } catch (err) {
    throw new Error(`AI 返回内容不是 JSON：${err?.message || "parse failed"}`);
  }
}

// ---------- loading ----------
function renderLoading(text, sub) {
  app.innerHTML = "";
  app.appendChild(constellation());
  app.appendChild(el("div", { class: "panel" },
    el("div", { class: "loading" },
      el("div", { class: "loading-orbit" }, el("div", { class: "ring" }), el("div", { class: "core" })),
      el("div", { class: "loading-text" }, text),
      el("div", { class: "loading-sub" }, sub || "约需 10–30 秒")
    )));
}

// ---------- utils ----------
function copy(t) {
  if (!t) return toast("暂无内容可复制", true);
  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    const ta = el("textarea", { value: t });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("已复制");
    return;
  }
  navigator.clipboard.writeText(t || "").then(
    () => toast("已复制"),
    () => toast("复制失败，请手动选择", true)
  );
}
function downloadTxt(r) {
  const M = MODULES[S.module];
  let body = `${M.name} — ${S.setup.school}\n${"=".repeat(28)}\n\n${r.jp}\n`;
  if (r.cn) body += `\n${"-".repeat(28)}\n【中文对照】\n\n${r.cn}\n`;
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: `${M.name}_${safeFileName(S.setup.school)}.txt` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- boot ----------
renderHome();

// UX_ENHANCEMENTS_START
const DRAFT_VERSION = 2;
const DRAFT_KEY_PREFIX = "shutsugan-shinki:draft:";
let draftSaveTimer = null;
let uxEnhancementsInstalled = false;

function storageAvailable() {
  try {
    const storage = window.localStorage;
    const probe = "__nissin_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function draftKey(moduleKey = S?.module) {
  return `${DRAFT_KEY_PREFIX}${moduleKey || "unknown"}`;
}

function safeCloneState(state) {
  return JSON.parse(JSON.stringify({ ...state, busy: false, error: "" }));
}

function mergeDraftState(moduleKey, saved) {
  const fresh = freshState(moduleKey);
  const merged = { ...fresh, ...saved, busy: false, error: "" };
  merged.setup = { ...fresh.setup, ...(saved.setup || {}) };
  merged.materials = { ...fresh.materials, ...(saved.materials || {}) };
  merged.followups = Array.isArray(saved.followups) ? saved.followups : [];
  merged.followupAnswers = { ...(saved.followupAnswers || {}) };
  merged.result = saved.result || null;
  if (!["ug", "grad"].includes(merged.setup?.level)) merged.setup.level = fresh.setup.level;
  if (!["setup", "intake", "followup", "result"].includes(merged.step)) merged.step = "setup";
  return merged;
}

function loadDraft(moduleKey) {
  const storage = storageAvailable();
  if (!storage) return null;
  try {
    const raw = storage.getItem(draftKey(moduleKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== DRAFT_VERSION || !parsed.state || parsed.state.module !== moduleKey) return null;
    return mergeDraftState(moduleKey, parsed.state);
  } catch {
    return null;
  }
}

function draftMeta(moduleKey) {
  const storage = storageAvailable();
  if (!storage) return null;
  try {
    const raw = storage.getItem(draftKey(moduleKey));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function stateHasDraftContent(state = S) {
  if (!state) return false;
  const su = state.setup || {};
  const setupText = [su.school, su.faculty, su.major, su.professor].some((v) => String(v || "").trim());
  const intakeText = Object.values(state.intake || {}).some((v) => String(v || "").trim());
  const followText = Object.values(state.followupAnswers || {}).some((v) => String(v || "").trim());
  return setupText || intakeText || followText || !!state.result;
}

function formatDraftTime(ts) {
  if (!ts) return "本地自动保存";
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `已保存 ${hh}:${mm}`;
}

function draftSavedText(savedAt) {
  if (!stateHasDraftContent(S)) return "";
  const meta = draftMeta(S?.module);
  return savedAt ? formatDraftTime(savedAt) : formatDraftTime(meta?.savedAt);
}

function updateSaveStatus(savedAt) {
  const node = document.getElementById("saveStatus");
  if (!node) return;
  const text = draftSavedText(savedAt);
  node.textContent = text;
  node.closest(".save-tools")?.classList.toggle("draft-empty", !text);
}

function saveDraftNow() {
  if (!S || !S.module || S.busy) return;
  const storage = storageAvailable();
  if (!storage) return;
  if (!stateHasDraftContent(S)) {
    try { storage.removeItem(draftKey(S.module)); } catch {}
    updateSaveStatus();
    return;
  }
  try {
    const payload = { version: DRAFT_VERSION, savedAt: Date.now(), state: safeCloneState(S) };
    storage.setItem(draftKey(S.module), JSON.stringify(payload));
    updateSaveStatus(payload.savedAt);
  } catch {
    updateSaveStatus();
  }
}

function scheduleSave() {
  if (!S || !S.module) return;
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(saveDraftNow, 320);
}

function clearCurrentDraft() {
  if (!S?.module) return;
  const moduleKey = S.module;
  const storage = storageAvailable();
  if (storage) storage.removeItem(draftKey(moduleKey));
  S = freshState(moduleKey);
  if (typeof toast === "function") toast("本地草稿已清空");
  render();
}

function makeUxNode(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text != null) node.textContent = options.text;
  if (options.html != null) node.innerHTML = options.html;
  if (options.attrs) Object.entries(options.attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (options.onClick) node.addEventListener("click", options.onClick);
  children.filter(Boolean).forEach((child) => node.appendChild(child));
  return node;
}

function getQuestionBank() {
  return S?.module === "kenkyu" ? KENKYU_Q : Q;
}

function getActiveQuestionIds() {
  const M = MODULES?.[S?.module];
  if (!M) return [];
  if (typeof M.questions === "function") return M.questions(S.setup || {});
  if (Array.isArray(M.questions)) return M.questions;
  if (typeof M.getQuestions === "function") return M.getQuestions(S.setup || {});
  return [];
}

function getMaterialRule(qid) {
  const bank = getQuestionBank();
  const question = bank?.[qid] || {};
  const moduleRules = INPUT_RULES?.intake?.[S?.module] || {};
  const custom = moduleRules[qid] || {};
  return {
    ...(INPUT_RULES?.intakeDefault || {}),
    ...custom,
    required: custom.required ?? !question.optional,
    label: question.label || qid
  };
}

function answerQuality(qid, value = "") {
  const rule = getMaterialRule(qid);
  const raw = value.trim();
  const len = typeof charLen === "function" ? charLen(raw) : raw.length;
  const isResearchPlan = S?.module === "kenkyu";
  const emptyText = isResearchPlan
    ? "这里还缺研究内容。请补研究对象、方法、资料或具体问题。"
    : "这里还缺一段真实经历。写一件具体事：什么时候、做了什么、遇到什么问题。";
  const shortText = isResearchPlan
    ? "这还不像研究素材。请补研究对象、调查方法、参考资料或你想验证的问题。"
    : "这还不像一段经历。请补一个具体场景，例如作品、课程、老师反馈或一次修改过程。";
  const midText = isResearchPlan
    ? "方向可以，但还偏像题目。再补对象、样本、方法或预期成果，会更像研究计划。"
    : "方向可以，但还像提纲。再补时间、作品名、具体动作或结果，会更像本人经历。";
  const goodText = isResearchPlan
    ? "这段有研究信息，可以支撑计划书。提交前再确认资料和方法是否说得清。"
    : "这段有具体信息，可以支撑成稿。提交前再确认事实都能面试说明。";
  if (!raw) {
    return rule.required
      ? { level: "warn", text: emptyText }
      : { level: "neutral", text: "这项可以留空。只有真的有素材时再写，不需要硬编。" };
  }
  if (len < (rule.minLen || 12)) {
    return { level: "warn", text: shortText };
  }
  if (/^(.)\1+$/.test(raw) || /哈哈|呵呵|随便|不知道|无所谓|fuck|shit|傻|滚/i.test(raw)) {
    return { level: "warn", text: "这段不适合提交。请换成真实学习、作品或研究内容。" };
  }
  if (len < 60) {
    return { level: "mid", text: midText };
  }
  if (/努力|认真|感兴趣|貴校|環境|学びたい|頑張/i.test(raw) && len < 120) {
    return { level: "mid", text: "有素材，但套话有点多。请用一个真实例子证明，而不是只写态度。" };
  }
  return { level: "good", text: goodText };
}


function buildTargetSummaryNode() {
  if (!S?.module || S.step === "home") return null;
  const su = S.setup || {};
  const chips = [
    su.school || "未填志望校",
    su.faculty || "未填学部/研究科",
    su.major ? `专攻：${su.major}` : null,
    su.professor ? `教员：${su.professor}` : null,
    `${su.limit || MODULES[S.module].defaultLimit}字`,
    su.lang === "both" ? "日中对照" : "仅日文"
  ].filter(Boolean);
  const chipWrap = makeUxNode("div", { className: "summary-chips" }, chips.map((chip) => makeUxNode("span", { className: "summary-chip", text: chip })));
  const title = makeUxNode("div", { className: "summary-title", text: MODULES[S.module]?.title || "当前目标" });
  const copy = makeUxNode("div", { className: "target-copy" }, [title, chipWrap]);
  const saveText = draftSavedText();
  const saveTools = makeUxNode("div", { className: "save-tools" + (saveText ? "" : " draft-empty") }, [
    makeUxNode("span", { className: "save-status", text: saveText, attrs: { id: "saveStatus" } }),
    makeUxNode("button", {
      className: "mini-link",
      text: "清空",
      onClick: () => {
        if (window.confirm("清空本模块本地草稿，并回到初始填写状态？")) clearCurrentDraft();
      }
    })
  ]);
  return makeUxNode("section", { className: "target-summary" }, [copy, saveTools]);
}

function enhanceTargetSummary() {
  const old = app.querySelector(".target-summary");
  if (old) old.remove();
  const node = buildTargetSummaryNode();
  if (!node) return;
  const anchor = app.querySelector(".step-head") || app.querySelector(".panel") || app.firstElementChild;
  if (anchor) anchor.insertAdjacentElement("afterend", node);
}

function presetValuesForCurrentModule() {
  const candidates = S?.module === "kenkyu" ? [1000, 1500, 2000, 3000] : [600, 800, 1000, 1200, 1500];
  const values = [];
  candidates.forEach((value) => {
    let clamped = value;
    try {
      clamped = clampLimit(S.module, S.setup?.level, value);
    } catch {
      try { clamped = clampLimit(value); } catch { clamped = value; }
    }
    if (clamped === value && !values.includes(value)) values.push(value);
  });
  return values.length ? values : candidates.slice(0, 4);
}

function updateLimitUI(value, input) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return;
  S.setup.limit = limit;
  if (input) input.value = String(limit);
  app.querySelectorAll(".limit-preset").forEach((button) => {
    const active = button.dataset.limit === String(limit);
    button.classList.toggle("active", active);
  });
  const chips = Array.from(app.querySelectorAll(".summary-chip"));
  const limitChip = chips.find((chip) => /^\d+字$/.test(chip.textContent.trim()));
  if (limitChip) limitChip.textContent = `${limit}字`;
  saveDraftNow();
}

function enhanceLimitPresets() {
  if (S?.step !== "setup") return;
  const input = app.querySelector('#limit, input[name="limit"], input[type="number"]');
  if (!input || app.querySelector(".limit-presets")) return;
  const wrap = makeUxNode("div", { className: "limit-presets" }, presetValuesForCurrentModule().map((value) => makeUxNode("button", {
    className: Number(S.setup?.limit) === value ? "limit-preset active" : "limit-preset",
    text: `${value}字`,
    attrs: { type: "button", "data-limit": String(value) },
    onClick: () => updateLimitUI(value, input)
  })));
  input.addEventListener("input", () => updateLimitUI(input.value, input));
  const field = input.closest(".field") || input.parentElement;
  if (field) field.appendChild(wrap);
}

function buildAnswerGuide(qid) {
  const guide = (typeof ANSWER_GUIDES !== "undefined" && (ANSWER_GUIDES[qid] || ANSWER_GUIDES.default)) || null;
  if (!guide) return null;
  const weakExample = makeUxNode("details", { className: "guide-details" }, [
    makeUxNode("summary", { text: "查看容易写空泛的例子" }),
    makeUxNode("div", { className: "guide-card weak" }, [
      makeUxNode("strong", { text: "太空泛" }),
      makeUxNode("span", { text: guide.weak })
    ])
  ]);
  return makeUxNode("div", { className: "answer-guide compact", attrs: { "data-answer-guide": qid } }, [
    makeUxNode("div", { className: "guide-card strong" }, [
      makeUxNode("strong", { text: "更好写法" }),
      makeUxNode("span", { text: guide.strong })
    ]),
    weakExample
  ]);
}

function updateQualityNote(textarea, qid) {
  const field = textarea.closest(".field") || textarea.parentElement;
  if (!field) return;
  let note = field.querySelector(`[data-quality-note="${qid}"]`);
  if (!note) {
    note = makeUxNode("div", { className: "quality-note", attrs: { "data-quality-note": qid } });
    field.appendChild(note);
  }
  const quality = answerQuality(qid, textarea.value || "");
  note.className = `quality-note ${quality.level}`;
  note.textContent = quality.text;
}

function resolveQuestionIdForTextarea(textarea, index, ids) {
  const field = textarea.closest(".field") || textarea.parentElement;
  const direct = [textarea.dataset?.questionId, textarea.id, textarea.name].find((value) => ids.includes(value));
  if (direct) return direct;

  const fieldText = field?.innerText || "";
  const banks = [Q, KENKYU_Q].filter(Boolean);
  const allIds = banks.flatMap((bank) => Object.keys(bank));
  const candidates = allIds
    .map((id) => {
      const question = Q[id] || KENKYU_Q[id] || {};
      return { id, label: question.label || "", jp: question.jp || "" };
    })
    .sort((a, b) => Math.max(b.label.length, b.jp.length) - Math.max(a.label.length, a.jp.length));
  const matched = candidates.find(({ label, jp }) => (label && fieldText.includes(label)) || (jp && fieldText.includes(jp)));
  if (matched) return matched.id;

  return ids[index];
}

function enhanceAnswerGuides() {
  if (S?.step !== "intake") return;
  const ids = getActiveQuestionIds();
  const textareas = Array.from(app.querySelectorAll("textarea"));
  textareas.forEach((textarea, index) => {
    const qid = resolveQuestionIdForTextarea(textarea, index, ids);
    if (!qid) return;
    textarea.dataset.questionId = qid;
    const field = textarea.closest(".field") || textarea.parentElement;
    if (!field) return;
    field.querySelectorAll(".answer-guide, .quality-note").forEach((node) => node.remove());
    const guide = buildAnswerGuide(qid);
    if (guide) field.appendChild(guide);
    field.classList.toggle("is-focused", document.activeElement === textarea);
    textarea.addEventListener("focus", () => field.classList.add("is-focused"));
    textarea.addEventListener("blur", () => field.classList.remove("is-focused"));
    updateQualityNote(textarea, qid);
  });
}

function buildFactCheckNode() {
  const items = [
    "学校名、学部/研究科、专攻、指导教员已经按募集要项核对。",
    "作品、奖项、日语成绩、实习经历只保留真实内容。",
    "没有把“从小喜欢”“贵校环境优越”当作主要理由。",
    "每一段都能在面试中用中文说明，并能准备对应日语表达。",
    "字数限制与学校要求一致；提交前再按原题微调。",
    "中文对照只用于理解，正式提交前以日文原稿为准。"
  ];
  return makeUxNode("section", { className: "fact-check" }, [
    makeUxNode("div", { className: "fact-check-title", text: "提交前 · 事实与面试风险核对" }),
    makeUxNode("div", { className: "risk-list" }, items.map((item) => makeUxNode("label", { className: "risk-item" }, [
      makeUxNode("input", { attrs: { type: "checkbox" } }),
      makeUxNode("span", { text: item })
    ])))
  ]);
}

function enhanceResultChecklist() {
  if (S?.step !== "result" || app.querySelector(".fact-check")) return;
  const anchor = app.querySelector(".tips") || app.querySelector(".result-doc") || app.querySelector(".panel");
  if (anchor) anchor.insertAdjacentElement("afterend", buildFactCheckNode());
}

function enhanceStickyActions() {
  app.querySelectorAll(".actions").forEach((node) => node.classList.add("sticky-actions"));
}

function runUxEnhancements() {
  if (!app) return;
  enhanceTargetSummary();
  enhanceLimitPresets();
  enhanceAnswerGuides();
  enhanceResultChecklist();
  enhanceStickyActions();
  updateSaveStatus();
}

function installUxEnhancements() {
  if (uxEnhancementsInstalled) return;
  uxEnhancementsInstalled = true;

  const baseRender = render;
  render = function enhancedRender(...args) {
    const result = baseRender.apply(this, args);
    runUxEnhancements();
    if (S?.module && S.step !== "home") scheduleSave();
    return result;
  };

  const baseStartModule = startModule;
  startModule = function enhancedStartModule(key) {
    const restored = loadDraft(key);
    if (restored) {
      S = restored;
      render();
      if (typeof toast === "function") toast("已恢复上次本地草稿", false, { center: true });
      return;
    }
    return baseStartModule.apply(this, arguments);
  };

  const baseSetStep = setStep;
  setStep = function enhancedSetStep(...args) {
    const result = baseSetStep.apply(this, args);
    saveDraftNow();
    return result;
  };

  if (typeof doFollowup === "function") {
    const baseDoFollowup = doFollowup;
    doFollowup = async function enhancedDoFollowup(...args) {
      const result = await baseDoFollowup.apply(this, args);
      saveDraftNow();
      return result;
    };
  }

  if (typeof doGenerate === "function") {
    const baseDoGenerate = doGenerate;
    doGenerate = async function enhancedDoGenerate(...args) {
      const result = await baseDoGenerate.apply(this, args);
      saveDraftNow();
      return result;
    };
  }

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!S?.module || !target?.matches?.("input, textarea, select")) return;
    const qid = target.dataset?.questionId;
    if (qid) updateQualityNote(target, qid);
    scheduleSave();
  });

  document.addEventListener("change", () => scheduleSave());
  render();
}

installUxEnhancements();
// UX_ENHANCEMENTS_END
