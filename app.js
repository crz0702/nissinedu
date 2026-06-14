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
function toast(msg, isErr = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "");
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
      customPrompt: "",
    },
    intake: {},
    followups: [],
    followupAnswers: {},
    result: null,
    busy: false,
  };
}

function clampLimit(v, fallback) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < 100) return 100;
  if (n > 5000) return 5000;
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
  type: "object",
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          q_cn: { type: "string" },
          q_jp: { type: "string" },
          why: { type: "string" },
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
  type: "object",
  properties: {
    jp: { type: "string" },
    cn: { type: "string" },
    tips: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "string" },
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
    el("div", { class: "hero-eyebrow" }, "Nissin Art Academy"),
    el("h1", { class: "hero-title" }, "出願神器"),
    el("div", { class: "hero-rule" }),
    el("p", { class: "hero-sub" },
      "把你脑子里零散、真实的经历，问出来、整理好、译成地道日文。不替你编故事 —— 编出来的，面接一问就穿帮。")
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

  app.appendChild(el("div", { class: "home-note" },
    "两个模块共用基本信息 —— 大学院出願通常两份都要。"));
}

function startModule(key) {
  S = freshState(key);
  render();
  window.scrollTo({ top: 0 });
}

// ---------- STEP 1: SETUP ----------
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
      ["kenkyusei", "研究生", "研究生"],
      ["other", "别科·其他", "別科ほか"],
    ];
    panel.appendChild(fieldSeg("出願区分", "出願区分", levels, su.level, (v) => {
      su.level = v;
      su.prompts = [];
      render();
    }));
    panel.appendChild(fieldSeg("方向", "系統", [["art", "美术系", "美術系"], ["gen", "一般", "一般"]],
      su.art ? "art" : "gen", (v) => {
        su.art = v === "art";
        su.prompts = [];
        render();
      }));
  }

  // school / faculty
  panel.appendChild(el("div", { class: "row" },
    fieldText("志望校", "大学名", "school", su.school, "例：武蔵野美術大学"),
    fieldText(isShibo && su.level === "ug" ? "学部・学科" : "研究科・専攻", "学部／研究科", "faculty", su.faculty, "例：造形学部 油絵学科")
  ));
  panel.appendChild(el("div", { class: "row" },
    fieldText("专攻 / 课程", "コース", "major", su.major, "例：版画 / 选填", true),
    (S.module === "kenkyu" || (isShibo && (su.level === "grad" || su.level === "kenkyusei")))
      ? fieldText("希望指导教员", "指導希望教員", "professor", su.professor, "确认过研究方向再填 / 选填", true)
      : el("div")
  ));

  // 設問库 (shibo only)
  if (isShibo) {
    const key = shiboPromptKey(su.level, su.art);
    const list = SHIBO_PROMPTS[key];
    if (su.prompts.length === 0) su.prompts = list.filter((p) => p.on).map((p) => p.q);
    const wrap = el("div", { class: "field" },
      el("div", { class: "field-label" }, "设问项 ", el("span", { class: "jp" }, "設問（出力構成）")),
      el("div", { class: "field-hint" }, "勾选学校实际要求回答的项；不确定就按推荐来。下方也可贴学校原题。")
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
        el("div", { class: "check-body" }, el("div", { class: "check-jp", style: "font-size:13px;color:var(--ink)" }, p.q))
      );
      wrap.appendChild(c);
    });
    panel.appendChild(wrap);
    panel.appendChild(fieldArea("学校设问原题（可选）", "設問原文", "customPrompt", su.customPrompt,
      "如果学校有特定问法或多个小问，把原文贴这里，AI 会严格照着写。", true, true));
  }

  // 字数 + 语言
  panel.appendChild(el("div", { class: "row" },
    fieldNumber("字数上限", "字数制限", "limit", su.limit, "字"),
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
      if (!su.school.trim()) return toast("请填写志望校", true);
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
  function fieldNumber(label, jp, id, val, unit) {
    const base = clampLimit(val, MODULES[S.module].defaultLimit);
    return el("div", { class: "field" },
      labelRow(label, jp, true),
      el("input", {
        type: "number",
        value: base,
        min: "100",
        step: "50",
        oninput: (e) => {
          su[id] = clampLimit(e.target.value, MODULES[S.module].defaultLimit);
        },
      })
    );
  }
  function fieldSelect(label, jp, id, val, opts) {
    const sel = el("select", { onchange: bind(id), onblur: bind(id) });
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

  const panel = el("div", { class: "panel fade-in" });
  panel.appendChild(el("div", { class: "step-head" },
    el("div", { class: "step-kicker" }, "Step 02"),
    el("div", { class: "step-title" }, "素材 · 真实经历"),
    el("div", { class: "step-desc" }, "写事实、写具体，不用组织成文章 —— 那是 AI 的活。越具体，成稿越有说服力。")
  ));

  const meterCount = el("span", { class: "meter-count" });
  const meterHint = el("span", { class: "meter-hint" });
  const meter = el("div", { class: "material-meter" }, meterCount, meterHint);
  let updateMaterialMeter = () => {};

  ids.forEach((qid) => {
    const q = bank[qid];
    if (!q) return;
    const value = S.intake[qid] || "";
    const counter = counterNode(value);
    const ta = el("textarea", {
      placeholder: q.placeholder || "",
      oninput: (e) => {
        S.intake[qid] = e.target.value;
        updateCounter(counter, e.target.value);
        updateMaterialMeter();
      },
      onblur: (e) => { S.intake[qid] = e.target.value; },
    }, value);
    panel.appendChild(el("div", { class: "field" },
      labelRow(q.label, q.jp, !q.optional),
      q.hint ? el("div", { class: "field-hint" }, q.hint) : null,
      ta,
      counter));
  });

  updateMaterialMeter = () => {
    const stats = materialStats(ids);
    const ready = stats.filled >= MIN_MATERIAL_FIELDS;
    meter.className = "material-meter" + (ready ? " ready" : "");
    meterCount.textContent = `${stats.filled}/${ids.length} 项素材`;
    meterHint.textContent = ready
      ? `${stats.chars} 字，已可生成`
      : `至少填写 ${MIN_MATERIAL_FIELDS} 项，再让 AI 追问或成稿`;
  };
  updateMaterialMeter();
  panel.appendChild(meter);

  panel.appendChild(el("div", { class: "actions" },
    el("button", { class: "btn btn-ghost", disabled: S.busy, onclick: () => setStep("setup") }, "← 上一步"),
    el("div", { class: "spacer" }),
    el("button", { class: "btn btn-ghost", disabled: S.busy, onclick: () => doGenerate(true) }, "跳过追问 · 直接成稿"),
    el("button", { class: "btn btn-primary", disabled: S.busy, onclick: doFollowup }, "AI 追问 →")
  ));
  app.appendChild(panel);
}

// ---------- STEP 3: AI FOLLOWUP ----------
async function doFollowup() {
  if (S.busy) return;
  const M = MODULES[S.module];
  const su = S.setup;
  const ids = S.module === "shibo" ? M.getQuestions(su.level, su.art) : M.getQuestions();
  if (!hasEnoughMaterial(ids)) return toast(`至少填 ${MIN_MATERIAL_FIELDS} 项素材，AI 才能有效追问`, true);

  setBusy(true);
  S.step = "followup";
  S.followups = [];
  renderLoading("AI 正在审阅你的素材…", "找出空泛、断裂、缺细节的地方");

  const system = `あなたは日本の大学・大学院出願の専門指導者です。中国人留学生が提供した「${M.name}」の素材を読み、説得力に欠ける点・抽象的すぎる点・論理の飛躍・具体性の不足を見抜きます。本人がまだ書いていない「具体的な事実（固有名詞・実体験・数字・エピソード）」を引き出すための追加質問のみを行います。鉄則：事実を捏造させる質問はしない。一般論ではなく、その学生の回答に即した質問をする。`;

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
  if (!hasEnoughMaterial(ids)) return toast(`至少填 ${MIN_MATERIAL_FIELDS} 项素材，才能生成初稿`, true);

  setBusy(true);
  S.step = "result";
  renderLoading("AI 正在撰写…", "对照设问、卡准字数、规避套话");

  const structure = su.prompts && su.prompts.length
    ? su.prompts.map((p, i) => `${i + 1}. ${p}`).join("\n")
    : "（学生未指定设问，按该类文书的标准结构组织）";
  const custom = (su.customPrompt || "").trim();

  const system = `あなたは日本の大学出願書類の作成を支援するプロの編集者です。学生本人が提供した素材だけを用いて、自然で説得力のある、審査員に響く日本語の${M.name}を作成します。鉄則：(1) 素材にない事実・経験・固有名詞・受賞歴を捏造しない。情報が足りない箇所は無理に埋めず、自然に簡潔にする。(2)\u300c私は幼い頃から\u300d、\u300c貴校の充実した環境\u300dなどのありがちな決まり文句や、いかにも AI が書いたような常套句を避ける。(3) 指定の字数と設問構成に従う。(4) 一人の学生の個性・声が滲む文章にする。誇張しない。`;

  let prompt = buildContext();
  if (!skipFollowup && S.followups.length) {
    prompt += "\n\n【追加で引き出した素材】\n";
    S.followups.forEach((f, i) => {
      const a = (S.followupAnswers[i] || "").trim();
      if (a) prompt += `Q: ${f.q_cn || f.q_jp}\nA: ${a}\n`;
    });
  }
  prompt += `\n\n【出力する設問構成】\n${structure}\n`;
  if (custom) prompt += `\n【学校の設問原文（最優先で従う）】\n${custom}\n`;
  prompt += `\n【字数】日本語で約 ${su.limit} 字（±10%）。\n`;
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
  const levelMap = { ug: "学部", grad: "大学院", kenkyusei: "研究生", other: "別科・その他" };

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
      msg = e.error || msg;
      if (e.detail) msg += ` (${Array.isArray(e.detail) ? e.detail.join("；") : e.detail})`;
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
