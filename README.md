# 出願神器 · Shutsugan Shinki

AI 志望理由書 / 研究計画書 生成器 — 日新美術学院。
一个引擎、两个模块，按「学部 / 大学院 × 美术系 / 一般」动态出题，AI 追问挖细节，产出日文 + 中文对照初稿。

API key 全部走 Vercel serverless 函数（`/api/generate`），**永远不会暴露在前端**。

---

## 文件结构

```
.
├── index.html        # 应用外壳
├── styles.css        # 金箔×深绀 视觉
├── templates.js      # 题库 + 设问库（改这里就能改问题）
├── app.js            # 向导引擎（状态机 / 渲染 / 提示词）
├── api/
│   └── generate.js   # serverless 代理：Gemini 主用 + Anthropic 兜底
├── generate.js        # 兼容入口：重新导出 api/generate.js
├── vercel.json       # Vercel 函数参数
├── package.json
├── .env.example
└── README.md
```

---

## 部署到 Vercel（约 3 分钟）

### A. 命令行（推荐）
```bash
npm i -g vercel
cd /path/to/ai文书生成器
vercel --prod --name ai-zuoyu-generation
```

首次部署完成后补环境变量：

1. `vercel env add GEMINI_API_KEY`（必填）
2. `vercel env add ANTHROPIC_API_KEY`（兜底）
3. `vercel --prod`

### B. 平台网页
1. 把这个文件夹推到一个 GitHub 仓库。
2. 打开 [vercel.com](https://vercel.com) → **Add New → Project** → 选这个仓库 → Deploy。
3. 进入项目 **Settings → Environment Variables**，添加：
   - `GEMINI_API_KEY` = 你的 Google AI Studio key
   - `ANTHROPIC_API_KEY` = 你的 Anthropic key
4. 回到 **Deployments**，点最近一次 **⋯ → Redeploy**（让环境变量生效）。完成。

---

## 本地预览

```bash
npm i -g vercel
vercel dev        # 本地起 serverless，读取 .env.local
```

（先把 `.env.example` 复制成 `.env.local` 并填好 key。）

> 直接双击 `index.html` 也能看界面，但点「AI 追问 / 生成」会失败，因为没有后端。

---

## 改东西

- **改问题 / 加题**：编辑 `templates.js`。`Q` 是志望理由書题库，`KENKYU_Q` 是研究計画書题库，`SHIBO_PROMPTS` 是各类设问推荐项。
- **改提示词 / 输出格式**：在 `app.js` 里搜 `system =` 和 `buildContext`。
- **换模型**：在 Vercel 加 `GEMINI_MODEL` / `ANTHROPIC_MODEL` 环境变量即可，无需改代码。
- **改视觉**：`styles.css` 顶部 `:root` 是配色变量。

---

## 设计原则

工具定位是「整理 · 翻译 · 润色」，**不是代写**。提示词里硬性约束 AI 不得捏造学生未提供的事实、规避「私は幼い頃から」这类 AI 套话。成稿页明确提示：这是初稿，须逐句核对、用自己的话改写。
