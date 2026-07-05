# 04 · 建议与落地状态

> 基于 01–03 的分析，给出可执行建议，并标注截至 2026-07-04 的落地情况（对照 `git log`）。

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

---

## 待办 ❌（按优先级）

P0、P1 均已落地。剩余为 P2 可选增强：

### P2 — 可选增强
6. **阅读时长估算**："x min read"，可由 content 长度直接估算，无需存储字段。
7. **首页 section 小标题视觉锚点弱**（`HomeView.vue:150-157`，0.75rem uppercase muted）——如需强化扫描锚点，可加粗或加左侧色块，但优先级低，非必须。
8. **暗色模式首屏闪烁**：`isDark` 的 class 切换发生在 `onMounted`，若用户已保存 dark 偏好，首帧会先渲染浅色再切换。彻底解决需在 `index.html` 加一段内联 script，在 Vue 挂载前读取 `localStorage`/`prefers-color-scheme` 并设置 class。

---

## 保留不动 ✅（现有优点，勿破坏）

- 暖米色背景 + 炭灰文字的色温体系
- 衬线正文、克制留白、统一字重层级
- 极简导航（仅 Writing / Contact）
- wordmark 滚动收起动画
- 文章卡片整块可点击热区
