# 04 · 建议与落地状态

> 基于 01–03 的分析，给出可执行建议，并标注落地情况。
>
> **状态：全部落地。** 2026-08-26 逐条对照代码复核（不只看 commit message），
> P0/P1/P2 已无待办项。下表中 2026-07-04 之后新增的三条单独标注。

---

## 已落地 ✅

| 建议 | 对应 commit | 说明 |
|------|------------|------|
| 增加保留强调色 `#D97757` | `9eb72c2` | 用于链接、hover、focus ring |
| 双声部字体（无衬线标题 + 衬线正文） | `47e637b` | `--font-sans` 用于标题，`--font-serif` 用于正文 |
| 测量宽度收回到黄金阅读宽度 | (style.css) | `--measure: 68ch`，替代生产环境的 81.25ch |
| 数据模型加 `coverImage` / `tags` | `556d4da`, `4eb85c3` | 支持封面图与分类标签渲染 |
| 完读率不再公开展示 | `0f32682` | 解决 D4 反向社会证明风险 |
| 主题切换图标 | `a32075c` | Lucide 图标替代原按钮 |
| 修正 `<title>papar</title>` 拼写错误 | (本次) | 改为 `Paper`，`index.html:12` |
| 补充 meta 信息 | (本次) | description、Open Graph、Twitter Card、`theme-color` |
| 暗色模式持久化 | (本次) | `App.vue` 读写 `localStorage`，首次加载读 `prefers-color-scheme` |
| 强化正文链接可供性 | `9eb72c2` | `.prose a` 用 `--accent-ink` 着色 + 强调色下划线，hover 加粗 |
| 文章结尾加相关内容 | `8539011` | "Continue reading" 区块，`PostView.vue:46-54` |
| 阅读进度条 | `23b81e1` | 顶部进度条，附带覆盖了部分"阅读反馈"诉求 |
| **P2-6 阅读时长估算** | `b8d1f23` | `src/shared/reading-time.ts` 估算 + `resolveReadingMinutes` 可手动覆写；`PostView.vue:47` 渲染 "x min read" |
| **P2-7 首页 section 小标题锚点** | `a7d5540` | `.section-heading` 前加了一枚线描图标（Writing 用笔尖、Notes 等各有其形），`HomeView.vue:24,80,129`；不是加粗或色块，而是与本站插画语言一致的做法 |
| **P2-8 暗色模式首屏闪烁** | `efb796f` | `public/theme-init.js` 从 `<head>` 同步执行，在样式表之前把 `dark` / `high-contrast` / `less-artwork` / 光标两项写到 `<html>`；`src/main.ts` 退化为兜底。注：当初判断"CSP 禁止内联脚本所以做不了"只对了一半——`script-src 'self'` 允许**外部**同源脚本 |

---

## 待办 ❌（按优先级）

**空。** P0、P1、P2 全部落地（2026-08-26 复核）。

清单外、后来自行发展出来的相关工作：高对比度调色板（`a842e0e`）、
空状态插画与"减少插画"偏好（`a7d5540`、`efb796f`）、路由转场
（`c213305`，见 [`../page-transitions/design.md`](../page-transitions/design.md)）、
光标主题（`27903b3`，见 [`../cursor-theme.md`](../cursor-theme.md)）。

---

## 保留不动 ✅（现有优点，勿破坏）

- 暖米色背景 + 炭灰文字的色温体系
- 衬线正文、克制留白、统一字重层级
- 极简导航（仅 Writing / Contact）
- wordmark 滚动收起动画
- 文章卡片整块可点击热区
