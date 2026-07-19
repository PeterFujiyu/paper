# Paper Agent Benchmark

这是一套从本项目真实 Git 历史中提取的 10 个 commit-reproduction 任务。CLI 会从目标提交的唯一父提交生成隔离仓库，让任意 coding agent 完成任务，再把历史回归测试注入一次性副本中评分。

它不会 checkout、reset、stash 或 clean 当前仓库；即使主工作区有未提交改动，准备和评价流程也只读取 Git 对象。

## 入选提交

筛选权重为：技术深度 35%、产品影响 25%、回归证据 25%、基准隔离性 15%。只考虑线性 `main` 历史，排除了 merge、stash synthetic、旁支重复、纯视觉/文档和机械迁移提交。

| 排名 | 案例 | 目标提交 | 父提交 | 规模 | 主要能力 |
|---:|---|---|---|---:|---|
| 1 | `auth-session-hardening` | `801b47e` | `3a8db61` | 16 files, +382/-20 | JWT audience、会话撤销、旧数据兼容、注册防枚举 |
| 2 | `captcha-metric-gate` | `4f30c14` | `560ba4a` | 18 files, +883/-36 | hCaptcha、Mongo 原子限流、前后端 challenge 协议 |
| 3 | `serverless-route-dispatch` | `1bca3ed` | `da4562b` | 30 files, +324/-113 | Vercel 架构、路由分组、生产/本地契约防漂移 |
| 4 | `notes-vertical-slice` | `936232f` | `abb2adc` | 19 files, +1091/-39 | 模型、富文本、CRUD、搜索、管理端和公共 UI |
| 5 | `content-auth-security` | `156adeb` | `bde35d4` | 21 files, +634/-61 | TipTap allowlist sanitizer、Cookie auth、CSP/安全头 |
| 6 | `full-essay-search` | `abb2adc` | `fc8003f` | 10 files, +304/-7 | 正文投影、安全 regex、回填、异步请求竞态 |
| 7 | `accessibility-pass` | `a83a54c` | `e757893` | 18 files, +584/-102 | landmarks、live regions、焦点陷阱、reduced motion |
| 8 | `post-metrics` | `6bd81b3` | `c9ce5a6` | 17 files, +767/-53 | 原子计数、完成率、滚动检测、全栈数据流 |
| 9 | `hash-scroll-restoration` | `0f3eaa3` | `c18c08b` | 5 files, +122/-4 | Vue Router、动态偏移、异步布局和历史恢复 |
| 10 | `post-media-tags-api` | `556d4da` | `47e637b` | 7 files, +168/-3 | schema 演进、输入验证、规范化和 API 契约 |

完整 40 位 SHA、任务描述、验收标准、选择理由和检查项在 [`benchmarks.json`](./benchmarks.json) 中。CLI 的 `validate` 会核验 SHA、唯一父提交、`main` 可达性、diff 统计和 oracle 文件；benchmark 自带的补充 oracle 还必须是 Git 跟踪的普通文件且匹配清单中的 SHA-256，防止隐藏评分规则随工作区悄悄漂移。

## 5 分钟快速上手（v2 handoff 主路径）

需要 Node.js 22 或更高版本，并先完成根项目依赖安装：

```bash
npm install
npm run benchmark
```

无参数命令会打开中文首页，并行探测本机的 Codex CLI 与 Claude Code。选择“开始新的评测”后，向导会依次确认题目、CLI、模型、思考深度、运行方式和依赖策略；最终确认之前不会创建 Run 或 workspace。

当前第一条 v2 主路径是 handoff：runner 会为每个 Run 创建全新的
`.agent-benchmark/workspaces/<case-id>/<run-uuid>`，然后完整打印绝对目录、供应商中立 Prompt 和安全引用的启动命令。把命令粘贴到另一终端完成任务即可。handoff 无法证明另一终端实际使用的 CLI、模型或 effort，因此 SQLite 会如实记录 `execution_config_verified=false`，结果页显示“准备时探测，实际执行未验证”。托管 agent、历史筛选和结果对比会在后续路径开放，当前首页会明确标为不可用。

随时可以暂停并用短 Run ID 恢复，恢复不会重新准备或覆盖 workspace：

```bash
npm run benchmark -- resume 7f3a91c2
npm run benchmark -- evaluate 7f3a91c2
npm run benchmark -- result 7f3a91c2
```

评价仍使用隐藏 oracle、类型检查、生产构建和原有 100 分公式。Run、Prompt/CLI 配置、Evaluation 和 checks 的权威记录写入 `.agent-benchmark/benchmark.sqlite3`；完整评价完成后会先落原子 recovery spool，再提交 SQLite。可以用 `--db <path>` 覆盖数据库，或用 `db recover` 幂等恢复未提交的评分结果。

CI 或脚本不能在非 TTY 中等待向导，必须显式提供所有选择：

```bash
npm run benchmark -- run \
  --case hash-scroll-restoration \
  --adapter codex \
  --model default \
  --effort high \
  --mode handoff \
  --dependency-strategy isolated \
  --yes --json --no-color
```

`--json` 的 stdout 只包含最终 JSON；诊断写入 stderr。Prompt、数据库和默认报告不保存认证 secret、模型思考或隐藏测试原始输出。

## 低层命令（保持兼容）

先确认本机环境和清单：

```bash
npm run benchmark -- doctor
npm run benchmark -- list
npm run benchmark -- show hash-scroll-restoration
npm run benchmark -- validate
```

准备一个不含后续 Git 历史的题目仓库：

```bash
npm run benchmark -- prepare hash-scroll-restoration
```

低层 `prepare` 的兼容默认路径仍是 `.agent-benchmark/workspaces/<case-id>`；v2 向导则始终使用 Run UUID 级独立目录。workspace 包含 `.benchmark-task.md`，本地 `.git` 只有一个基线提交，无法 `git show` 目标提交。默认不共享根仓库的 `node_modules`，避免 agent 通过依赖目录反向修改源项目；可信的本地试跑可显式加 `--link-dependencies`。也可以指定独立目录：

```bash
npm run benchmark -- prepare hash-scroll-restoration \
  --workspace /tmp/paper-hash-scroll
```

把被测 agent 的工作目录和文件权限限制在 CLI 输出的 workspace，任务结束后评价：

```bash
npm run benchmark -- evaluate hash-scroll-restoration \
  --workspace /tmp/paper-hash-scroll
```

默认报告写入 `.agent-benchmark/results/`，可用 `--results <path>` 改写。兼容 case/workspace 评价也会创建来源为 `ad-hoc` 的 SQLite Run，但不会伪造 agent、模型或历史 Prompt。`--json` 提供机器可读输出。报告默认只保留检查的通过状态、退出码和耗时，不暴露隐藏测试的命令或原始输出；受信任的赛后诊断可显式使用 `--reveal-check-output`。`--keep-evaluation` 会保留已注入 oracle 的临时评价副本。

## 评分

每题总分 100：

- 80 分：检查项结果的加权值；清单内部为行为回归测试 70、直接运行的 `vue-tsc --noEmit` 15、直接运行的 `vite build` 15。CLI 用当前 Node 可执行文件直接启动隔离依赖中的工具入口，并覆盖使用基线的 TypeScript/Vite 控制配置，避免候选通过 npm 配置、npm script 或项目配置取巧。
- 20 分：候选与参考提交的生产代码变更路径 precision/recall F1，用于发现遗漏的 API、模型或 UI 层。测试、coverage 和运行产物不参与路径分，报告也只返回聚合计数，不暴露参考提交缺少或额外的具体路径。它不要求逐行复制，因此仍应结合行为测试和人工审查。

评价时，CLI 复制候选工作区，拒绝可能越界的候选 symlink，覆盖写入历史 oracle 测试和固定控制配置。typecheck、build、behavior 按安全顺序从原候选分别构造在随机父目录中的一次性副本和写时复制依赖，行为测试最后执行，不存在可写的共享候选模板；Unix 子进程还使用独立进程组并在检查结束后清理残留后代。候选原目录不会被测试注入、构建产物或报告修改。删测试、改测试、改 npm script 或只让当前公开测试通过都不能直接绕过 oracle。

目标提交缺少关键回归证据时，`agent-benchmark/oracles/` 提供经过 base/target 双向验证的补充测试：注册限流与防枚举、hCaptcha 两类指标的浏览器重试、Notes 管理编辑器与公开搜索、HTTP/CSP 部署策略、全文搜索防抖/竞态/清空恢复，以及文章阅读端按路由重置的一次性指标上报。它们只会在评价副本中注入，不会出现在被测 workspace。`validate --run-gold` 会把每个补充 harness 单独覆盖到 base 与 gold 运行，不能由同一行为套件里的其他失败“代替”判别证据。

运行深度自检会先证明 oracle 能拒绝未实现的父提交，再证明参考实现本身能得到满分：

```bash
npm run benchmark -- validate hash-scroll-restoration --run-gold
npm run benchmark -- validate --run-gold
```

第二条会依次构建并测试全部 10 个历史快照，耗时明显更长。

## 隔离与安全边界

- `prepare` 使用 `git archive <base>`，随后在快照内重新 `git init`，不使用共享 `.git` 的 worktree；默认也不链接源项目依赖。
- 目标 SHA、gold patch 和 oracle 测试不会写入被测 workspace。
- 主仓库只执行 `rev-parse`、`cat-file`、`diff`、`show`、`archive` 等只读 Git 操作。
- 所有子进程使用 argv 调用，不通过 shell 拼接命令。
- 评价进程只继承运行工具需要的少量环境变量，使用固定测试 JWT secret，并在一次性写时复制依赖上运行。
- `--keep-evaluation` 和 `--reveal-check-output` 会暴露 oracle 或断言细节，仅用于受信任的赛后诊断；不要把保留目录或详细报告交回同一被测 agent 或用于下一轮盲测。
- 这解决的是 Git 历史和工作区污染，不是恶意代码沙箱。若 agent 仍可读取 workspace 之外的文件，它依然能看到本目录中的 benchmark 清单；严格跑分时应把它的文件系统权限限制到准备好的 workspace，并按需禁网。

## 历史边界说明

这套分数衡量“复现指定历史提交”，不证明实现满足今天的全部最佳实践：

- `post-metrics` 的后续提交才调整实时指标缓存并加入防刷门禁；本题只评价基础指标闭环。
- `content-auth-security` 后续修复了空 TipTap paragraph 的兼容边界；本题使用紧邻测试基础设施提交中的 oracle，冻结目标提交当时的契约。
- `post-media-tags-api` 的后续 review fix 调整了重复标签的计数语义；本题不把后续行为反向加入隐藏要求。
- jsdom 能验证语义和键盘事件，但 `accessibility-pass` 的通过不等同于完整 WCAG 或真实读屏器认证。

因此报告应与每题的任务描述、检查状态和必要的人工代码审查一起解读，不建议只按一个总分判断 agent。

## 开发与验证

工具要求 Node.js 22+，并使用锁定版本的 `better-sqlite3` 保存本地运行历史。运行自身测试：

```bash
npm run benchmark:test
```

运行产物统一写入 `/.agent-benchmark/`，该目录已加入项目 `.gitignore`；工具源码 `agent-benchmark/` 本身保持可追踪。
