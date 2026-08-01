# Anthropic 设计语言研究 × Paper 博客改进分析

> 探究 anthropic.com 文章（post）页面的设计语言，结合认知心理学原理，分析当前 **Paper** 博客（本仓库）还有哪些可改进之处。
>
> 生成日期：2026-06-18 · 分析对象：本仓库 `src/`（Vue 3 编辑型博客）

---

> **状态更新（2026-07-31）：本文最醒目的那个"回归 bug"已经修好了。**
> 测量宽度已由 `ce3ebf4`（*fix(design): restore golden reading measure to 68ch*）修复，
> `src/style.css` 现为 `--measure: 68ch`，落在本文所述 50–75ch 区间内。
> 下文 [执行摘要](#这份研究包含什么) 与 [`03-blog-audit.md`](03-blog-audit.md) 中关于 `81.25ch` 的描述
> **已过时，请勿据此再"修"一次**。其余建议未逐条核对。
>
> 原型文件 `design.html` 已从仓库根目录移入本目录（它是排版参考，不是页面）。

---

## 这份研究包含什么

| 文件 | 内容 |
|------|------|
| `README.md`（本文件） | 总览、研究过程、信息源、**执行摘要 + 优先级清单** |
| `01-anthropic-design-language.md` | Anthropic 设计语言拆解：色彩、字体、版式、强调手法、设计哲学 |
| `02-psychology-principles.md` | 用于分析的认知/UX 心理学原理目录（含来源） |
| `03-blog-audit.md` | Paper 博客现状审计：逐文件、逐 token 的事实记录 |
| `04-recommendations.md` | **核心产出**：可执行的改进建议，按优先级排序，附代码定位与片段 |

---

## 研究过程（Process）

1. **读懂自己的博客**——通读 `src/style.css`、`src/App.vue`、`src/views/HomeView.vue`、`src/views/PostView.vue`、`src/types/content.ts`、`index.html`、`design.html`、`AGENTS.md`，记录现有设计 token、版式与交互。
2. **拆解 Anthropic 设计语言**——结合用户提供的 4 张参考图（首页 hero、81k 专题、Project Glasswing 文章页、页脚/相关内容）+ 网络检索（品牌指南、字体、设计 token、真实文章页结构）。
3. **建立心理学分析框架**——整理与"长文阅读 + 博客参与度"相关的认知心理学原理，作为评判标尺。
4. **对照分析 + 给建议**——把 Paper 现状逐项放到"Anthropic 做法 × 心理学原理"的坐标里，找出差距并给出可落地的改法。

### 信息源（Sources）

- [Styrene in use: ANTHROP\C — type.today](https://type.today/en/journal/anthropic)
- [Anthropic — Geist (品牌方案)](https://geist.co/work/anthropic)
- [anthropic.com Design Tokens — FontOfWeb](https://fontofweb.com/tokens/anthropic.com)
- [Anthropic brand-guidelines SKILL.md — GitHub](https://github.com/anthropics/skills/blob/main/skills/brand-guidelines/SKILL.md)
- [真实文章页结构参考：Tracing the thoughts of a large language model — anthropic.com](https://www.anthropic.com/news/tracing-thoughts-language-model)
- [Laws of UX — Von Restorff Effect](https://lawsofux.com/von-restorff-effect/)
- [21 Laws of UX — UX Design Institute](https://www.uxdesigninstitute.com/blog/laws-of-ux/)
- [14 cognitive principles every UX designer should know — LogRocket](https://blog.logrocket.com/ux-design/cognitive-principles-for-ux-designers/)
- [Web Psychology Principles — Odown](https://odown.com/blog/web-psychology/)
- 用户提供的 4 张 anthropic.com 截图（首页、81k 专题、Project Glasswing 文章页、相关内容/页脚）

---

## 执行摘要（TL;DR）

**好消息：你的博客已经"骨子里"就是 Anthropic 风格。** 背景色 `#F9F9F7` vs Anthropic `#faf9f5`、暗色 `#141412` vs `#141413`、衬线正文、克制留白、单一强调——方向完全正确。`design.html` 本就是一份"Anthropic 风格排版示例"。

**核心差距在于：你抓住了"安静"，但还没抓住 Anthropic 的三个关键张力。**

1. **字体的"双声部"**——Anthropic = 无衬线标题（Styrene）+ 衬线正文（Tiempos）的"学术期刊"对比。你目前几乎全衬线，标题与正文是"单声部"，缺少那种"研究机构"的紧张感与层级冲击。
2. **一个被克制保留的强调色**——Anthropic 整体近乎无彩，只把全部"色彩预算"押在一抹赤陶色 `#d97757` 上（冯·雷斯托夫效应）。你完全无彩，连链接都用 `inherit`，少了那个能被记住的"签名色"和可点击信号。
3. **阅读旅程的"收尾与进度"**——Anthropic 每篇文章都有封面图、分类标签、结尾"相关内容"三连。你的文章结尾只有"← Back to writing"，且默默统计完读率却不给读者任何进度反馈（违背目标梯度效应与峰终定律）。

~~**还有一个明确的"回归 bug"**：你的正文测量宽度是 `81.25ch`（[src/App.vue:135](../../src/App.vue)），而你自己的原型 `design.html` 写着 `65ch` 并注释"黄金阅读宽度"。生产环境比设计意图宽了 25%，直接损害可读性。~~
**已于 `ce3ebf4` 修复** —— `--measure: 68ch`，见顶部状态更新。

### 优先级清单

| # | 改进项 | 心理学原理 | 工作量 | 影响 | 详见 |
|---|--------|-----------|--------|------|------|
| P0 | 正文测量宽度收回到 ~65–68ch | 处理流畅性 / 阅读疲劳 | XS | 高 | [04 §1](04-recommendations.md) |
| P0 | 引入一个克制的赤陶强调色（链接/激活态/分类标签） | 冯·雷斯托夫效应 / 可供性 | S | 高 | [04 §2](04-recommendations.md) |
| P0 | 文章结尾加"相关内容 / 下一篇" | 峰终定律 / 蔡格尼克 / 减少跳出 | M | 高 | [04 §3](04-recommendations.md) |
| P1 | 顶部阅读进度条（你已有 scroll 计算） | 目标梯度效应 | S | 中高 | [04 §4](04-recommendations.md) |
| P1 | 标题改用一款无衬线，建立"双声部"层级 | 处理流畅性 / 视觉层级 | M | 中高 | [04 §5](04-recommendations.md) |
| P1 | 文章加封面图 + 分类标签字段 | F 型扫描 / Jakob 定律 / 分享 | M | 中高 | [04 §6](04-recommendations.md) |
| P1 | 重新考虑公开"完读率"（低数字 = 负面社会证明） | 社会证明（反向） | S | 中 | [04 §7](04-recommendations.md) |
| P2 | 阅读时长估算（"8 min read"） | 目标设定 / 降低不确定性 | XS | 中 | [04 §8](04-recommendations.md) |
| P2 | 暗色模式持久化 + 跟随系统 | 一致性 / 控制感 | XS | 中 | [04 §9](04-recommendations.md) |
| P2 | 完善 `<title>` / OG / 描述元信息（当前 title 是 "papar" 拼写错误） | 处理流畅性 / 分享 | XS | 中 | [04 §10](04-recommendations.md) |
| P2 | 加粗双下划线作为正文强调手法 | 冯·雷斯托夫 / 模式匹配 | S | 低中 | [04 §11](04-recommendations.md) |
| P3 | 升级一款 web 衬线体（Newsreader / Source Serif 4） | 处理流畅性 / 美学-可用性 | S | 低中 | [04 §12](04-recommendations.md) |

> 注：AGENTS.md 已声明"保留编辑型外观：衬线排版、低饱和色调、细边框、克制动效"。所有建议都在这条约束内——目标是**让安静更有层次**，而非把博客变热闹。
