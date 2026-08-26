# 03 · Paper 博客现状审计

> 逐文件、逐 token 的事实记录，作为建议（04）的依据。所有行号基于 2026-06-18 仓库状态。

> ⚠️ **这是 2026-06-18 的快照，不是现状。** 2026-08-26 复核：本文列出的缺口**已全部补上**——
> `--accent: #D97757` / `--accent-ink: #B85333`（`src/style.css:16-17`）、
> `--font-sans` 标题声部（`:42`）、`coverImage` / `tags` / `readingMinutes`
> （`src/types/content.ts:30-33`）、`<title>Paper</title>`（`index.html:19`）、
> 暗色模式持久化并在首帧前生效（`public/theme-init.js`）、结尾"Continue reading"、
> 顶部阅读进度条。落地对照见 [`04-recommendations.md`](04-recommendations.md)。
> 本文保留下来是为了解释建议的**由来**，其中的行号与结论请勿当作当前代码使用。

---

## 1. 设计 token（`src/style.css`）

| Token | 浅色 | 暗色 | 对照 Anthropic |
|-------|------|------|----------------|
| `--bg` | `#F9F9F7` | `#141412` | `#faf9f5` / `#141413` — **几乎完全一致** ✅ |
| `--bg-subtle` | `#F2F2EE` | `#1E1E1B` | 对应浅灰 `#e8e6dc` ✅ |
| `--text-main` | `#181818` | `#E8E8E4` | `#141413` / `#faf9f5` ✅ |
| `--text-muted` | `#666666` | `#888882` | 中灰 `#b0aea5` 同族 ✅ |
| `--border` | `#E5E4DF` | `#2E2E2A` | 细边框，一致 ✅ |
| **强调色** | **无** | **无** | ❌ Anthropic 有 `#d97757` |

- 正文字体：`Georgia, "Times New Roman", "Songti SC", "SimSun", serif`，`18px / line-height 1.7`（`style.css:14-16`）。**系统衬线，非 web 字体**。
- 加载的 web 字体（`index.html:10`）：Google Sans、Montserrat、Noto Sans SC、WDXL Lubrifont SC——但**正文用的 Georgia 并不在其中**；Montserrat 仅用于 wordmark。
- **结论**：色彩系统已经是"Anthropic 同款"，唯独**缺一个保留强调色**；字体是"单声部全衬线"，缺无衬线标题声部。

---

## 2. 布局与测量宽度（`src/App.vue`）

- `.page-wrap { max-width: 81.25ch }`（`App.vue:135`），header 同为 `min(81.25ch, 100%)`（`App.vue:152`）。
- ~~⚠️ **回归点**：原型 `design.html:39` 明确写 `max-width: 65ch` 并注释"黄金阅读宽度"，正文还有一段专门讲"约 65ch + 充足行高，视线换行平稳不疲劳"。**生产环境从 65ch 放宽到了 81.25ch，比设计意图宽 ~25%**，违背 A4（测量宽度）。~~
  **✅ 已修复（`ce3ebf4`）** —— `src/style.css` 现为 `--measure: 68ch`，`src/App.vue:322` 用 `max-width: var(--measure)`。上面 `81.25ch` 的两条描述均已过时。
- wordmark：Montserrat 1.05rem/500，带**滚动时收起为首字母 "P"** 的逐字动画（`App.vue:101-194`）——克制而有辨识度，相当于 Paper 自己的"反斜杠"签名细节 ✅。
- 导航：仅 Writing / Contact（`App.vue:17-18`）——符合希克定律 ✅。
- 页脚：版权 + "All opinions are my own." + 一个**以太坊地址彩蛋**（点击展开/复制，`App.vue:36-62`）——有个性，但与"相关内容/导航型页脚"无关。

---

## 3. 首页（`src/views/HomeView.vue`）

- Hero：label（uppercase 小字）→ 大标题 `clamp(2.2rem,5vw,3.4rem)` 衬线 400 → bio（`HomeView:5-16, 116-131`）。结构清晰 ✅。
- section 小标题（"Writing""Contact"）：`0.75rem` uppercase muted（`HomeView:150-157`）——**非常安静**，扫描时的左侧锚点偏弱（B1 F 型）。
- 文章列表：每条显示 `日期 · 浏览量 · 完读率`（`HomeView:30-34, 92-99`），标题 `1.15rem`，摘要灰字。**纯文字列表，无缩略图/封面**。
- 文章卡片 hover 仅给标题加下划线（`HomeView:181-185`）——可点击热区是整块 `block`（菲茨定律 ✅），但视觉反馈很弱。

---

## 4. 文章页（`src/views/PostView.vue`）

- 头部：`← Writing` 返回 → meta（`日期 · 浏览量 · 完读率`）→ 标题，**全部左对齐**（`PostView:15-23`）。无**分类标签**、无**封面图**、无**作者/阅读时长**。
- 正文：TipTap JSON 经 `generateHTML` 渲染，`.prose` 样式在 `PostView:311-357`。
  - 段落 `1rem / line-height 1.8` ✅；标题层级靠字号区分、字重统一 400 ✅（符合 Anthropic"字号而非字重"）。
  - 链接 `a { color: inherit; text-decoration-thickness: 1px }`（`PostView:354`）——⚠️ **可点击信号弱**（C3 可供性）；Anthropic 用双下划线/赤陶色强化。
  - 图片有样式但**正文模型无封面字段**，且配图无 caption 机制。
- **完读追踪**：滚动到 90% 上报完读（`PostView:139-176`），但**不向读者显示任何进度**——后台有数据、前台无反馈，错过 D1 目标梯度。
- **结尾**：仅 `← Back to writing`（`PostView:28-30`）。无"相关内容/下一篇"——违背 D2 蔡格尼克、D3 峰终定律。

---

## 5. 数据模型（`src/types/content.ts`）

```ts
PostSummary  = { _id, slug, title, excerpt, createdAt, published?, ...PostMetrics }
PostDocument = PostSummary + { content, author?, updatedAt? }
PostMetrics  = { viewCount, readCompletionCount, readCompletionRate }
```
- ❌ **无 `coverImage`** 字段 → 无法做封面图 / OG 图。
- ❌ **无 `tags` / `category`** 字段 → 无法做分类标签、相关内容推荐。
- ❌ **无 `readingTime`** → 无法显示"x min read"（可由 content 估算，无需存储）。
- ⚠️ `readCompletionRate` 直接进入 `PostSummary` 并公开渲染——见 D4 反向社会证明风险。

---

## 6. HTML 外壳与元信息（`index.html`）

- ⚠️ `<title>papar</title>`（`index.html:14`）——**拼写错误**（应为 Paper），且全站共用一个标题。
- ❌ 无 `<meta name="description">`、无 Open Graph / Twitter Card、无 `theme-color`。→ 处理流畅性（搜索结果/分享卡片观感）+ 分享传播都受损。
- favicon：`/icon.png`（`index.html:6`）。
- `lang="en"`，但内容/受众可能含中文（`design.html` 为 zh-CN，字体栈含宋体）。

---

## 7. 暗色模式（`src/App.vue:73-79`）

- `toggleDark()` 仅切换 class，**不写 localStorage、不读 `prefers-color-scheme`**。→ 刷新即丢失、不跟随系统，违背 E1 一致性/控制感。

---

## 8. 现有优点（值得保留，勿动）

- ✅ 暖米色背景 + 炭灰文字，色温与 Anthropic 高度一致。
- ✅ 衬线正文（A3）、克制留白、细边框、统一字重层级。
- ✅ 极简导航（希克定律）。
- ✅ wordmark 滚动收起动画——独特的签名细节。
- ✅ 暗色模式存在（只是需持久化）。
- ✅ 文章卡片整块可点（菲茨定律）。
