# Paper Agent Benchmark 交互式 Runner 产品规格

> 文档状态：Draft（待实现）
> 产品版本：Benchmark CLI v2
> 文档版本：1.0
> 更新日期：2026-07-19
> 适用范围：本地中文终端中的 Claude Code CLI、Codex CLI 真实代码库能力评测

## 1. 摘要

Paper Agent Benchmark 已经能够从真实 Git 历史准备隔离任务，并通过隐藏回归测试、类型检查、生产构建和生产代码路径覆盖率进行评分。目前完整流程仍需要用户手动组合 `prepare`、外部 agent 和 `evaluate` 命令；运行时使用了哪个 CLI、版本、模型和思考深度也没有形成可查询的结构化记录。

v2 将现有低层命令扩展成一套中文交互式 benchmark runner：自动探测本机 Claude Code 和 Codex CLI，创建环境前明确询问并确认 agent CLI、已安装 CLI 版本、模型和思考深度；准备完成后提供绝对工作目录、完整可直接粘贴 Prompt 和可执行命令；支持由 runner 托管 agent 进程，也支持用户在另一终端手动运行；agent 完成后可一键评价。运行配置、生命周期、评分和检查明细统一写入 SQLite，便于恢复中断任务、查看历史和公平比较多个 agent。

本版本不改变现有 10 个题目的任务含义、oracle、计分公式和隔离边界。

## 2. Problem Statement

当前用户要比较 Claude Code、Codex 或不同模型时，需要自行完成以下工作：

1. 记住并输入多条 benchmark 命令。
2. 为每个 agent 手动创建不冲突的工作目录。
3. 手动查找 CLI 版本，并记录模型和思考深度。
4. 从任务文件中组织 Prompt，再切换终端粘贴。
5. agent 结束后重新寻找正确的 workspace 并执行评价。
6. 从分散的 JSON 文件中人工汇总结果。
7. 自行判断两个结果是否来自相同题目和可比配置。

这让一次本应可重复的能力评测变成容易出错的操作流程。尤其是在同一题目连续测试多个 agent 时，workspace 复用、版本漏记、Prompt 不一致或评分报告混淆都会破坏对比的公平性。

## 3. 产品目标

### 3.1 核心目标

1. 让首次使用者只运行一个命令，就能在中文引导下完成一次 benchmark。
2. 在任何 workspace 被创建之前，完成 CLI、版本、模型、思考深度和运行方式的确认。
3. 自动探测已安装 CLI 的真实版本，优先使用自动结果，避免要求用户手填。
4. 为 Claude Code 和 Codex 提供一致的产品体验，同时保留各自真实能力差异。
5. 每次准备都生成独立 workspace，杜绝不同 agent 互相继承代码。
6. 无论托管还是手动运行，都提供绝对目录和完整、未截断、可直接粘贴的统一 Prompt。
7. agent 完成后，用一次确认或一条短命令开始评价。
8. 以 SQLite 作为运行与评分历史的权威数据源，支持恢复、查询和对比。
9. 保持现有低层命令和机器可读模式可用，不强迫自动化调用方使用交互界面。

### 3.2 成功指标

1. 已安装任一受支持 CLI 时，新用户能够在 2 分钟内完成配置并启动任务。
2. 从 agent 结束到开始评价最多需要一次确认，不再要求重新输入 case ID 或 workspace。
3. 100% 的新建运行记录 case、CLI、自动探测版本、模型选择、思考深度、Prompt 哈希和 workspace。
4. 100% 的成功评价在 SQLite 中具有完整总分、检查项和路径 F1 数据。
5. 进程被 `Ctrl+C` 中断后，已准备 workspace 的运行可以从首页恢复，不需要重新准备。
6. 同一题目下的两次运行可通过一个对比命令生成并排摘要。
7. 现有 `list`、`show`、`doctor`、`validate`、`prepare` 和 `evaluate` 自动化用法保持兼容。

## 4. 非目标

1. 不提供模型账号注册、登录或订阅购买。
2. 不自动安装或升级 Claude Code、Codex，也不从包仓库查询“最新版本”。
3. 不把 benchmark 变成恶意代码安全沙箱；现有隔离仍主要防止历史泄漏和工作区污染。
4. 不统一不同供应商的计费、token 定义或模型能力口径。
5. 不修改现有题目、参考提交、隐藏测试和 100 分计分公式。
6. 不在首版提供远程队列、多人服务、Web UI 或云数据库。
7. 不自动判定两个不同题目、不同 Prompt 模板版本或不同安全策略的结果“完全公平”。

## 5. 用户与使用场景

### 5.1 目标用户

- Benchmark 设计者：希望用真实代码任务稳定比较不同 coding agent。
- 模型评测者：希望比较同一 CLI 的不同模型或思考深度。
- Agent 开发者：希望快速定位某次运行在哪个检查项失败。
- 项目维护者：希望保留可审计的本地运行历史，同时不泄露 oracle。

### 5.2 主要场景

1. 用 Codex 和 Claude Code 各完成一次 `auth-session-hardening`，随后比较结果。
2. 用同一个 CLI、同一个模型测试 `medium` 与 `high` 思考深度。
3. 在 runner 中创建环境，但在另一终端手动启动 agent。
4. 托管运行中断后，第二天回到首页继续评价现有代码。
5. 通过非交互参数批量发起运行，并从 JSON 输出或 SQLite 查询结果。

## 6. 术语

| 术语 | 定义 |
|---|---|
| Case | `benchmarks.json` 中定义的一道真实 Git 历史任务。 |
| Run | 某个 case 与一次 agent 配置、一个独立 workspace 的完整作答生命周期。 |
| Adapter | 把统一 runner 能力映射到 Claude Code 或 Codex CLI 的适配层。 |
| Probe | 不发起模型请求，仅探测 CLI 可执行文件、版本和受支持参数。 |
| Managed run | runner 直接启动并等待 agent CLI，随后引导评价。 |
| Handoff run | runner 只准备 workspace 并输出目录、Prompt 和命令，用户自行运行 agent。 |
| Requested model | 用户选择或输入并传给 CLI 的模型标识。 |
| Effective model | CLI 结构化输出能够证明的实际模型；无法证明时为空，不猜测。 |
| Reasoning effort | 供应商 CLI 支持的思考深度；数据库同时保留统一展示值和原始传参值。 |
| Evaluation | 对某一时刻的候选 workspace 执行现有 typecheck、build、behavior 和路径 F1 评分。 |

## 7. 设计原则

1. **先配置，后创建**：case、CLI、版本、模型、思考深度和运行方式未确认前，不创建 workspace。
2. **自动探测优先**：版本来自实际可执行文件；只有探测失败时才允许用户指定另一个可执行文件。
3. **统一 Prompt**：同一 case 和 Prompt 模板版本在不同 adapter 间保持逐字一致，供应商参数不写入 Prompt。
4. **显式可复制**：目录、Prompt 和命令使用无省略号的纯文本块输出，不依赖终端装饰才能理解。
5. **安全默认值**：不默认使用跳过审批、关闭沙箱或授权额外目录的危险参数。
6. **可恢复**：外部进程可能运行很久，任意步骤中断后都应保存足够状态。
7. **SQLite 优先、JSON 兼容**：SQLite 是历史记录权威来源；JSON 继续服务脚本输出和兼容导出。
8. **不伪造确定性**：无法从 CLI 得知实际模型、token 或费用时明确显示“未知”，不从别名推断。
9. **隐藏信息最小化**：默认数据库和终端都不保存或显示 oracle 命令、断言和原始失败输出。

## 8. 整体方案

```text
启动 CLI
  → 自动检查 benchmark 与 Claude/Codex 安装
  → 选择题目
  → 选择 agent CLI（显示自动探测版本）
  → 选择模型
  → 选择思考深度
  → 选择托管或手动运行
  → 最终确认
  → 创建独立 workspace 并写入 Run
  → 显示绝对目录、完整 Prompt、启动命令
  → agent 作答
  → 快捷评价
  → SQLite 持久化
  → 查看或比较结果
```

## 9. 中文交互体验

### 9.1 入口

无参数运行以下命令时进入中文交互首页：

```bash
npm run benchmark
```

首页提供：

1. 开始新的评测
2. 继续未完成的评测
3. 查看历史结果
4. 对比两次结果
5. 环境检查
6. 退出

如果存在 `preparing`、`prepared`、`agent_running`、`ready_for_evaluation`、`evaluating` 或 `evaluation_failed` 状态的 Run，首页顶部优先显示“有 N 个未完成评测”，并默认选中“继续未完成的评测”。陈旧的操作状态先执行恢复核对，再向用户展示动作。

`npm run benchmark -- run` 直接进入新建向导；原有显式子命令继续执行非交互行为。

### 9.2 启动诊断

进入首页时并行执行轻量 probe，不发送模型请求，不触发登录，不更新 CLI：

```text
环境检查
✓ Git / Node / 项目依赖可用
✓ Codex CLI    0.144.5    /absolute/path/to/codex
✓ Claude Code  2.1.214    /absolute/path/to/claude
```

版本探测中的 stderr 警告不会污染主界面；可以在“查看诊断详情”中查看。探测超过短超时或输出不可解析时显示“已找到，版本未知”，仍允许 handoff，但托管运行前必须再次提示风险。

如果 CLI 不存在，菜单中保留该项但标记“未安装”，选择后给出官方安装文档和“指定其他可执行文件”选项。runner 不自动安装。

### 9.3 新建 Run 向导

向导顺序固定，确保模型和思考深度在 workspace 创建前完成选择：

1. **选择题目**：显示排名、中文标题、难度、建议时长和主要能力。
2. **选择 agent CLI**：显示 Claude Code/Codex、自动探测版本和可用状态。
3. **选择模型**：必须出现此步骤，不能静默跳过。
4. **选择思考深度**：必须出现此步骤，只展示当前 adapter/版本支持的值。
5. **选择运行方式**：托管运行（推荐）或只准备后手动运行。
6. **确认依赖策略**：默认使用隔离策略；可信快速试跑才允许链接源项目依赖。
7. **确认摘要**：确认后才创建数据库 Run 和 workspace。

模型选项顺序：

1. 最近一次在此 adapter 使用的模型（如果存在）。
2. 使用 CLI 默认模型。
3. adapter 能可靠发现的模型列表（如果该版本提供稳定、本地、无付费请求的能力）。
4. 手动输入模型标识。

首轮没有历史选择时，默认高亮“使用 CLI 默认模型”，但仍要求用户按 Enter 确认。模型别名原样记录，不推断其背后的快照。

思考深度使用 adapter 能力列表。若双方都支持，首次默认高亮 `high（推荐）`；之后默认高亮该 adapter 最近一次选择。用户可以选择“使用 CLI 默认值”。不支持显式 effort 的旧版本只能选择默认值，并显示原因。

依赖策略默认采用正式评测所需的隔离模式，不把主仓库的可写 `node_modules` 链接进候选 workspace。高级选项允许可信本地试跑复用依赖，但确认页、数据库和对比页都必须明确标记 `linked`，因为它会改变隔离条件。若后续引入只读或写时复制依赖快照，应作为新的显式策略值记录，不能沿用 `isolated` 名称。

### 9.4 创建前确认

最终确认页面至少显示：

```text
请确认本次评测

题目        auth-session-hardening · 强化会话校验与注册安全
Agent       Codex CLI
CLI 版本    0.144.5（自动获取）
模型        gpt-5.6-codex
思考深度    high
运行方式    托管运行
依赖策略    隔离（不链接源项目 node_modules）
Agent 超时  无硬超时（建议时长仅提示）
工作目录    /absolute/path/.agent-benchmark/workspaces/<case-id>/<run-id>

确认后才会创建工作目录。继续？ (Y/n)
```

取消返回上一步，不留下空 workspace。只有用户确认后，才创建 Run 记录并进入 `preparing` 状态。

### 9.5 准备完成页面

准备成功后始终完整显示以下三项，不因选择托管模式而省略：

1. 绝对工作目录。
2. 完整、直接可粘贴的 Prompt。
3. 与所选 adapter、模型和 effort 对应的启动命令。

```text
环境已准备
Run ID: 7f3a91c2

工作目录（DIR）
────────────────────────────────────────
/absolute/path/.agent-benchmark/workspaces/auth-session-hardening/7f3a91c2
────────────────────────────────────────

完整 Prompt（从下一行开始复制）
──────────────────── PROMPT BEGIN ────────────────────
...完整 Prompt，永不截断...
───────────────────── PROMPT END ─────────────────────

快捷命令
────────────────────────────────────────
cd '<absolute workspace>'
<agent launch command>
────────────────────────────────────────
```

所有复制块禁用颜色控制字符。路径和命令必须进行适合当前 shell 的安全引用。托管启动使用参数数组和 stdin，不执行打印出来的 shell 字符串。

完整 Prompt 以相同 UTF-8 字节写入 workspace 的 `.benchmark-task.md`，并被本地 Git 排除；不再生成第二份 prompt 文件。终端仍必须完整打印，用户不需要依赖文件才能复制。

### 9.6 托管运行

托管模式下，准备页面后默认选中“启动 Agent”。runner：

1. 启动前再次 probe 选定 executable；版本或能力与创建前确认不一致时停止启动，并要求以新 Run 重新确认，而不是静默改写实验配置。
2. 把子进程 cwd 固定为 workspace，不主动向 CLI 授予额外目录。
3. 通过 stdin 传递规范化 Prompt，避免 shell 转义和命令行历史泄漏。
4. 流式显示 agent 的用户可读输出。
5. 记录开始/结束时间、退出码，以及 adapter 能可靠解析的 session ID、模型、token 和费用摘要。
6. 不默认保存完整思考内容或原始会话日志。
7. CLI 正常或异常退出后都检查 workspace 是否有改动，并允许评价已有结果。

agent 退出后显示：

```text
Agent 已结束（退出码 0，用时 32m 14s）
检测到 14 个生产文件发生变化。

现在开始评价？ (Y/n)
```

按 Enter 立即评价。选择“稍后”时显示短 Run ID 和恢复命令。

托管运行默认没有硬超时，case 的建议时长只用于计划和到时提醒，绝不自动终止付费任务。高级选项 `--agent-timeout <duration>` 可以设置硬上限，并必须出现在确认页和 Run 记录中。触发超时后，runner 先向 agent 进程组发送温和终止信号，等待 10 秒宽限期后再强制结束仍存活的后代；workspace 始终保留，launch outcome 记为 `timed_out`，Run 进入 `ready_for_evaluation`。

### 9.7 手动交接运行

Handoff 模式不启动外部进程。准备页面保持在：

```text
请在另一终端完成任务。

[Enter] Agent 已完成，立即评价
[s]     暂停并稍后继续
[p]     再次打印完整 Prompt
[d]     再次打印工作目录和命令
```

用户关闭当前 runner 不会丢失 Run。下次进入首页，选择该 Run 后可以：

1. 重新打印 DIR、Prompt 和命令。
2. 标记 agent 已完成并评价。
3. 放弃 Run，但默认保留 workspace；删除 workspace 必须单独确认。

Handoff 页面展示的 executable、CLI 版本、模型和 effort 都是 `planned configuration`。runner 无法证明用户在另一终端实际使用了这些值，因此数据库必须记录 `execution_config_verified=false`，历史和对比显示“准备时探测，实际执行未验证”。只有托管模式或用户通过 `launch <run-id>` 包装入口启动，才能记录 verified execution；用户口头确认只能作为 self-reported 元数据，不能升级为 verified。

### 9.8 快捷评价

交互状态下评价不再要求重新输入 case 或 workspace。非交互快捷形式为：

```bash
npm run benchmark -- evaluate <run-id-or-unique-prefix>
```

评价期间按顺序显示阶段状态，但不泄露隐藏输出：

```text
正在评价 7f3a91c2
✓ TypeScript 类型检查       15/15
✓ 生产构建                  15/15
✗ 认证与撤销回归测试         0/70
✓ 生产代码路径覆盖          F1 84.2%

总分 28.8 / 100
结果已写入 SQLite：/absolute/path/.agent-benchmark/benchmark.sqlite3
```

评价失败与“候选得分低”是两种不同状态：测试失败属于有效评价结果；评价基础设施异常才进入 `evaluation_failed`，并允许重试。

默认结果页提供：

1. 查看检查项摘要。
2. 与同一 case 最近一次其他 Run 比较。
3. 重新评价当前 workspace。
4. 返回首页。

`--reveal-check-output` 和 `--keep-evaluation` 继续作为受信任的赛后诊断选项，不在普通向导中默认出现。

### 9.9 历史结果与对比

历史列表支持按 case、agent CLI、模型和日期过滤，默认按最新评价时间倒序。每行显示：

- Run ID 短前缀
- case
- CLI 与版本
- requested model
- effort
- 总分
- behavior/typecheck/build 状态
- 路径 F1
- agent 用时与评价时间
- Run 状态

列表中的主分数默认取 primary evaluation；存在后续评价时追加“latest 另有结果”的标记，而不是悄悄替换主分数。对比命令同样默认选择双方 primary，只有用户显式指定 Evaluation ID 时才比较迭代结果。

对比仅在同一 case 时给出“公平对比”样式。case、Prompt 模板版本、评分 manifest 哈希、运行策略、execution verification 或 exposure 状态不一致时，顶部显示醒目的可比性警告，而不是阻止用户查看。任一 Handoff 运行未验证实际配置时，不显示“配置已验证”或自动宣布赢家。

对比表至少包括：

| 指标 | Run A | Run B |
|---|---:|---:|
| Agent / CLI 版本 |  |  |
| Requested / effective model |  |  |
| 思考深度 |  |  |
| 依赖 / 权限策略 |  |  |
| 总分 |  |  |
| 行为检查 |  |  |
| 类型检查 |  |  |
| 构建 |  |  |
| 路径 F1 |  |  |
| Agent 用时 |  |  |
| Token / 费用（可用时） |  |  |

评价进程的 `durationMs` 单独显示为“评价耗时”，不能冒充 agent 编程耗时。

### 9.10 中断与退出

- 在最终确认前按 `Ctrl+C`：直接退出，不创建 Run 或 workspace。
- 准备过程中中断：记录 `prepare_failed`，清理不完整 workspace；可重试并生成新 workspace。
- 托管 agent 过程中按一次 `Ctrl+C`：先把中断信号转发给子进程，并提示再次按下将强制结束。
- agent 被中断但已有代码：Run 进入 `ready_for_evaluation`，保留退出原因，允许评价。
- 评价过程中中断：当前评价记为 `interrupted`，候选 workspace 不变，下次可重新评价。
- 数据库写入失败：不声称已入库；显示已经原子落盘的 recovery spool 和无需重跑测试的恢复动作。

## 10. Prompt 产品契约

### 10.1 Prompt 目标

Prompt 必须让任意 coding agent 在看不到父仓库和参考提交的前提下，独立理解任务、约束和完成标准。它同时必须保持供应商中立，避免 Claude/Codex 因提示文本差异影响比较。

### 10.2 Prompt 内容顺序

每个 Prompt 由版本化模板生成，包含：

1. 角色和目标：在当前隔离仓库完成真实代码任务。
2. case 中文标题、难度和建议时长。
3. manifest 中的完整任务描述。
4. 全部验收标准。
5. 工作规则：只在当前仓库工作；先检查现状；实现完整纵向行为；运行合适验证。
6. 公平性规则：不读取父目录或外部 Git 历史；不寻找目标提交、gold patch 或隐藏 oracle；不调用 benchmark 评价器；不修改 benchmark session/prompt 元数据来规避评分。
7. 完成输出：总结实现、验证命令和未解决风险。

规范化模板如下；渲染时替换双花括号字段并展开全部验收标准，不能保留占位符：

```text
你正在完成一项真实代码库的隔离基准任务。请直接检查并修改当前仓库中的代码，完成任务；不要只给出方案。

# 任务信息

题目：{{case_title}}
难度：{{difficulty}}
建议时长：{{time_budget_minutes}} 分钟

# 任务描述

{{case_prompt}}

# 验收标准

{{all_acceptance_criteria_as_markdown_list}}

# 工作规则

1. 先检查当前代码、项目约定和公开测试，再制定并实施完整修改。
2. 只在当前仓库内读取和写入文件。不要读取或搜索父目录、原项目、外部 Git 历史、参考提交、gold patch、benchmark 清单或隐藏 oracle。
3. 不要调用 benchmark 评价器，不要修改 .benchmark-task.md 或 .benchmark-session.json，也不要通过删除、弱化或绕过测试来提高分数。
4. 按当前项目的既有架构和编码约定完成生产代码；避免与任务无关的重写。
5. 运行与改动相关的测试、类型检查和构建。发现失败时继续定位并修复，而不是只报告失败。
6. 在任务真正满足验收标准后再结束。

# 完成时回复

请简要说明：

- 完成了哪些修改；
- 实际运行了哪些验证及其结果；
- 是否仍有已知风险或未完成项。

现在开始。
```

实现时模板本身拥有独立版本号。只有模板文本或字段语义发生变化才提升版本；修复终端颜色、边框或换行显示不能改变 Prompt 字节。

Prompt 不包含：

- 目标提交 SHA 或参考补丁
- 参考实现改动文件列表
- oracle 文件、隐藏命令或断言
- 供应商名称、CLI 版本、模型或 effort
- 数据库路径或主仓库路径

### 10.3 一致性和可追溯性

- 同一 `case + prompt_template_version` 生成完全相同的 UTF-8 Prompt。
- workspace 的绝对路径只在独立 DIR 区块显示，不嵌入 Prompt。
- Run 保存完整 Prompt、模板版本和 SHA-256。
- 对比时 Prompt 哈希不同必须显示警告。
- Prompt 在终端输出时不截断、不折叠、不插入 ANSI 控制字符。

## 11. Claude Code 与 Codex 适配

### 11.1 统一 Adapter 能力

每个 adapter 对 runner 暴露相同产品能力：

1. `probe`：发现可执行文件、版本原文、规范化版本和帮助能力。
2. `model choices`：返回 CLI 默认、最近使用和可可靠发现的模型选项。
3. `effort choices`：返回该版本支持的思考深度与真实传参方式。
4. `invocation`：基于 workspace、模型、effort、安全策略和 Prompt 构建无 shell 的启动参数。
5. `event parser`：从结构化输出中提取用户可见文本和可选 telemetry。
6. `capability warnings`：解释当前版本缺失或降级的功能。

runner 不根据版本号单独猜测能力。优先解析该二进制的 `--help`/子命令帮助，并以版本兼容表作为补充和回归保护。

### 11.2 版本自动获取优先级

1. 本次显式指定的可执行文件路径。
2. 已保存且仍存在的 adapter 可执行文件路径。
3. 当前进程 `PATH` 中发现的官方命令。
4. 用户在“未找到”页面手动指定的新路径。

找到后执行只读版本命令，短超时内读取首个有效版本行，同时保存：

- adapter ID
- 可执行文件绝对路径及解析后的真实路径
- 版本原文
- 可解析的语义版本
- probe 时间
- 能力快照

probe 必须分别处理 stdout、stderr 和退出码。二进制以退出码 0 返回有效版本时，stderr 中存在包装器或 PATH 警告不能被误判为版本探测失败；警告应进入诊断详情。

自动结果在 UI 中标记“自动获取”。用户不能直接覆写一个成功探测的版本字符串；如果版本不对，应选择另一个可执行文件。探测不到版本时可以继续 handoff，但记录为 `unknown`。runner 永不自动执行 update/install。

### 11.3 能力映射

| 能力 | Claude Code | Codex CLI |
|---|---|---|
| 版本探测 | `--version`，失败时兼容 `-v` | `--version` |
| 模型 | 使用当前版本声明的 model 参数 | 使用当前版本声明的 model 参数 |
| 思考深度 | 优先使用当前版本原生 effort 参数 | 优先使用当前版本的 reasoning-effort 配置覆盖 |
| 工作目录 | 子进程 `cwd` 固定为 workspace | 子进程 `cwd` 固定为 workspace，并在支持时显式传 workspace 参数 |
| 托管模式 | 非交互输出模式及可解析 JSON/流格式 | `exec` 非交互模式及 JSONL 事件 |
| 默认权限 | 启用该版本可用的最严格本机安全配置，不增加额外目录 | workspace-write 沙箱，不增加额外目录 |
| 会话持久化 | 支持时关闭，避免污染个人历史 | 支持时使用 ephemeral 模式 |

具体 flag 名称属于版本能力，不作为用户界面契约。adapter 必须从探测结果构建参数，避免将当前本机版本的选项永久硬编码。

### 11.4 模型与 effort 规则

- 用户界面显示供应商原始模型标识，不把不同供应商模型映射为同一模型。
- “CLI 默认模型”记录为 requested model `default`；只有结构化事件报告模型时才填写 effective model。
- 用户手动输入的模型必须作为单个 argv 值传递，不能拼接成 shell 字符串。
- effort 保存 `requested_effort`、`adapter_effort_value` 和可选 `effective_effort`。
- adapter 发现版本不支持某个 effort 时，在创建 workspace 前阻止该组合并要求重选。
- 对比不同 effort 时显示配置差异，不把它隐藏在“同模型”标签下。
- Claude 与 Codex 同名的 `high/xhigh` 不代表相同计算预算；跨供应商对比只说明用户请求标签相同，不能描述为 effort 严格等价。

创建前校验只能证明本机 CLI/已知版本在语法与能力层面接受该参数，不能证明当前账号、区域或所选模型实际开放该 effort。provider 在 launch 时拒绝组合属于可记录的 launch failure：保留 workspace，禁止静默降级；用户若改 model/effort，应创建新的 Run。

### 11.5 托管安全策略

- 默认禁止危险的“绕过全部审批和沙箱”参数。
- 不向 agent 添加 workspace 之外的可写目录。
- 在不破坏用户现有认证的前提下，优先关闭个人插件、MCP、hooks、自动记忆和会话持久化；无法关闭时记录能力警告。
- provider 控制面网络与 agent 工具网络必须分开建模：CLI 调用模型服务需要前者，不代表 WebFetch、curl 或包下载必须开放。adapter 能力允许时默认关闭工具网络，并记录 `tool_network_isolation=enforced|cli_claimed|unrestricted`。
- 无法提供安全、无人值守写入模式的旧 CLI 版本自动降级为 handoff，不以危险 flag 换取自动化。
- adapter 要求的本机 sandbox 初始化失败时必须停止托管启动并给出 handoff/外部隔离建议，不能静默扩大权限。
- 所有外部命令通过 `spawn` 参数数组运行，Prompt 使用 stdin；不使用 shell 拼接。

产品必须把默认模式称为“本机便捷评测”，不能宣称它可以阻止 agent 读取宿主机所有文件。需要正式排名或严格防作弊时，应在容器或 VM 中只挂载候选 workspace 和必要依赖；强隔离执行器不属于本规格的实现范围。

每次 launch 都记录 `write_isolation`：`enforced` 表示 runner 外部的 OS/container policy 已验证边界，`cli_claimed` 表示仅依赖所选 CLI 声明的 sandbox，`best_effort` 表示只固定 cwd、限制参数和工具权限。默认本机模式通常只能声明后两者；UI 和对比页必须展示真实级别，不能用“唯一可写目录”描述它。

托管 launch 前，adapter 必须生成并审计最终权限计划：不得含 dangerous bypass、额外 writable root、用户插件/MCP/hook 或允许 unsandboxed escape 的配置；支持 fail-closed sandbox 时必须启用。Codex 的 workspace-write 或平台临时目录例外、Claude 的合并 settings 等不能被隐藏，无法消除的可写/网络范围写入 capability snapshot 并降低 isolation 等级。安全配置初始化失败时停止，不静默回退到更宽权限。

托管子进程环境不能直接继承整个 `process.env`。runner 从最小操作系统/终端白名单构造环境，默认删除项目与云端敏感变量，并只记录传入/删除的变量名，不记录值。优先使用 CLI 登录态或系统 keychain；如果认证只能依赖 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY` 等 provider secret，必须显式告知用户：除非 adapter 能证明其 shell 子进程环境已过滤，否则 agent 工具可能读取该 secret。用户确认后才传递，并把 `secret_isolation` 标为 `cli_filtered` 或 `best_effort`。`JWT_SECRET`、`MONGODB_URI` 及其他与 provider 无关的 key/token/secret 永不为便利而透传。

## 12. Run 生命周期

### 12.1 状态

| 状态 | 含义 | 可执行动作 |
|---|---|---|
| `preparing` | 已确认配置，正在创建 workspace | 等待、失败恢复 |
| `prepared` | workspace 可用，agent 尚未由 runner 启动 | 打印交接信息、启动、评价、放弃 |
| `agent_running` | 托管 agent 子进程运行中 | 查看输出、中断 |
| `ready_for_evaluation` | agent 已结束或用户声明手动作答完成 | 评价、重新打印信息 |
| `evaluating` | 正在构造一次性副本并评分 | 等待、中断 |
| `completed` | 至少有一次完整评价 | 查看、对比、重新评价 |
| `prepare_failed` | workspace 创建失败且不完整目录已清理 | 查看错误、重新新建 |
| `evaluation_failed` | 评价基础设施异常 | 查看安全摘要、重试 |
| `cancelled` | 用户明确放弃 | 查看；另行确认后删除 workspace |

Agent 的退出结果与 Run 状态分离保存。退出码非 0、超时或用户中断不会自动标记整个 Run 无法评价。

### 12.2 多次评价

一个 Run 可以拥有多次 Evaluation。例如用户第一次评分后继续修复，再次评分。每次评价都记录候选状态指纹、时间和独立检查项。

第一次完整产生评分的 Evaluation 被固定为 `primary evaluation`，即使得分很低也不可替换。历史列表和跨 agent 对比默认使用 primary，以免用户看过得分或隐藏诊断后继续修改，再用较高的 latest 分数冒充首轮能力。详情页同时展示 primary 与 latest；用户可以显式选择后续 Evaluation 对比，但必须标记为“迭代后结果”。

首次评价时，Run 可暂时进入 `evaluating`，成功后进入 `completed`，基础设施失败后进入 `evaluation_failed`。已存在 primary 的 Run 再次评价时，Run 保持 `completed`，只创建处于 running/failed/completed 状态的新 Evaluation，并使用短期操作租约防止并发；失败不能遮蔽已有 primary。

在输出 `--reveal-check-output` 详情或返回 `--keep-evaluation` 保留目录路径前，必须先把 Run 持久标记为 `oracle_exposed`，并记录暴露类型。刚完成、代码快照产生于暴露之前的 Evaluation 仍可成为 primary；此后的评价都带 `post_exposure=true`，不能作为 primary，也不能在默认公平对比中替代盲测结果。

### 12.3 崩溃恢复与操作租约

prepare、托管启动和评价都使用带 owner token、PID、host、开始时间与 heartbeat 的短期操作租约。正常结束时主动释放；runner 启动时检查陈旧的 `preparing`/`agent_running`/`evaluating`：

- 不能仅凭 PID 相同就自动连接或发送信号，避免 PID 复用伤及无关进程。
- 同一 host 上能够证明原进程仍属于本 Run 时，只显示“外部进程仍在运行”，不允许第二次启动。
- `preparing` 的最终 workspace 和 v2 attestation 已完整匹配时恢复为 `prepared`；只有能够证明属于本次失败 prepare 的不完整临时目录才允许清理，否则保留并要求人工选择。
- 无法证明仍在运行且租约超时后，将 launch/evaluation attempt 标为 interrupted，保留 workspace，并提供评价、同配置重试或放弃。
- 过期的首次 Evaluation 标为 interrupted 并回到 `ready_for_evaluation`；后续 Evaluation 失败不改变已 completed Run 的主状态。
- Run 已有 primary 时，陈旧的后续评价不能把 Run 从 completed 降级为 evaluation_failed。

断电或 `SIGKILL` 无法保证清理所有后代进程，因此本机便捷模式必须明确这一边界；启动恢复流程不得以递归删除 workspace 作为自动修复。

## 13. SQLite 数据设计

### 13.1 数据库位置与职责

默认数据库：

```text
.agent-benchmark/benchmark.sqlite3
```

该目录已经被根仓库忽略。可通过全局 `--db <path>` 覆盖，所有交互命令和低层评价命令必须使用同一个解析规则。

数据库路径必须解析现有父目录和 symlink 后再校验：拒绝源仓库 `.git` 内的路径，也拒绝位于当前或任一已登记候选 workspace 内的路径。创建新 workspace 时，如果其范围会包含权威数据库文件，同样必须拒绝。数据库绝不能进入候选指纹、生产路径评分或 agent 可写目录。

SQLite 是以下信息的权威来源：

- Run 配置与状态
- CLI probe 快照
- Prompt 与哈希
- workspace 和 agent 运行元数据
- Evaluation 总分、评分分项和检查项
- 可选 token、费用和 session ID
- 生命周期事件与失败摘要

现有 JSON 报告在兼容期继续生成或按需导出，但历史列表和对比从 SQLite 读取。

### 13.2 表与关键字段

#### `schema_migrations`

- schema version
- applied timestamp
- runner version

#### `benchmark_runs`

- run UUID 与短显示 ID
- case ID、case 标题快照、base tree
- benchmark manifest hash
- Prompt template version、provenance、完整 Prompt、Prompt SHA-256
- adapter ID 与显示名
- planned CLI executable、realpath、version raw、version normalized
- planned capability snapshot JSON
- requested/effective model
- requested/adapter/effective effort
- run mode、execution config verified/source、permission policy、write/secret/tool-network isolation、dependency strategy、agent timeout
- workspace absolute path
- status、agent outcome、agent exit code、signal
- primary/latest evaluation ID、exposure state
- agent session ID
- agent started/finished/duration
- input/output/cached token 与费用（全部可空）
- created/updated/completed timestamps
- safe error summary

`benchmark_runs` 中的 agent outcome、session、时长和 usage 字段是最新一次 launch 的查询缓存，事实记录保存在 `agent_launches`，两者必须在同一事务内更新。

#### `agent_launches`

- launch UUID、run UUID、attempt number
- executed executable、realpath、version raw/normalized、capability snapshot
- invocation mode、去除 Prompt/secret 的 sanitized argv JSON 与 fingerprint
- permission policy 与 telemetry status
- started/finished/duration
- exit code、signal、termination reason
- session ID、effective model/effort
- input/output/cached/reasoning token 与费用（全部可空）
- safe error summary

同一个 Run 只有在尚无 completed Evaluation、尚未暴露 oracle，并且 case、Prompt、adapter、CLI executable/version、requested model、effort、依赖和权限策略都不变时，才允许因登录失败、网络失败或中断重新启动 agent，并新增 launch attempt。若用户要更换模型或 effort，或者已经看过评分后继续调用 agent，必须创建新的 Run 和干净 workspace，避免把不同实验阶段混在一个首轮结果中。

#### `evaluations`

- evaluation UUID、run UUID
- candidate state fingerprint
- started/finished/duration
- status
- score、max score
- check score/max score/weight
- changed-file candidate/reference/matched counts
- precision、recall、F1、weight
- oracle file count、dependency mode
- reveal/keep-evaluation 标记
- primary/post-exposure 标记
- evaluator/runner version
- 完整 report JSON 快照
- optional JSON artifact path
- safe error summary

#### `evaluation_checks`

- evaluation UUID
- check ID、label、kind、顺序
- points、passed
- exit code、signal、duration
- details hidden 标记
- 只有显式 reveal/keep 时才允许保存对应诊断引用，并先更新 exposure；默认不保存原始 oracle 输出或保留目录

#### `run_events`

- run UUID
- 单调递增序号
- event type
- timestamp
- 小型 JSON payload

用于中断恢复和审计状态变化，不存储完整模型思考或任意 shell 输出。

#### `operation_leases`

- run UUID、operation type、attempt UUID
- unpredictable owner token
- PID、host fingerprint
- acquired/heartbeat/expires timestamps

同一 Run 同一时间最多存在一个有效写操作租约。租约用于并发排他和崩溃识别，不把 PID 本身当作进程身份凭证。

### 13.3 完整性与并发

- 启用 foreign keys 和 WAL。
- 使用有限 busy timeout；锁冲突时给出中文重试提示。
- schema migration、Evaluation 与 checks 写入、Run 状态切换均使用短事务。
- 不在外部 agent 或测试运行期间持有数据库事务。
- 数据库初始化和迁移必须幂等。
- 每次状态更新校验合法前驱状态，避免两个终端重复启动同一 Run。
- 数据库文件使用仅当前用户可读写的权限（平台支持时）。
- 不写入认证 token、环境变量值、完整用户配置或模型思考内容。

候选状态指纹必须覆盖基线 tree、全部 tracked diff，以及未忽略 untracked 文件的相对路径和内容；排序和字节编码固定，并排除 benchmark 元数据、依赖和运行产物。只记录 `HEAD` 或 dirty 布尔值不足以区分两次候选状态。

v2 workspace 关联 Run 时必须双向核验：SQLite 中规范化 workspace 路径、case、baseline tree、Prompt hash，与 session attestation 及实际 Git 根 tree 全部一致。候选可写 session 文件本身不是身份凭证；任何 v2 不匹配都硬失败，不能自动挂到另一个 Run 或降级为 ad-hoc。只有真正的 v1 workspace 才可按 legacy/unverified 来源执行低层评价。

### 13.4 JSON 兼容与迁移

- `--json` 继续表示把当前命令结果写到 stdout，不关闭 SQLite 持久化。
- 原 `--results` 在兼容期继续控制 JSON artifact 目录，但不改变数据库位置。
- 新增 `--db` 明确控制 SQLite 文件。
- 旧 JSON 不自动重复导入。提供显式一次性导入能力时，使用 report path/content hash 去重，并将 agent 元数据标记为未知。
- v1 workspace 或旧 JSON 没有可验证的规范 Prompt 时，记录 `prompt_provenance=legacy_unverified` 且 Prompt/hash 为空；不得用当前模板回填并伪装成当时实际 Prompt。
- SQLite 写入成功、JSON artifact 写入失败时，评价仍有效，但必须显示兼容 artifact 警告。

### 13.5 评价恢复 Spool

一次昂贵评价完成后，持久化顺序固定：

1. evaluator 返回不含默认隐藏详情的安全 report。
2. runner 在 `.agent-benchmark/recovery/` 同文件系统临时文件中写入 spool，刷新后原子 rename 为 `<evaluation-id>.json`。
3. runner 用一个 SQLite 事务写入/关联 Run、Evaluation 和 checks，并更新 primary/latest。
4. SQLite commit 成功后删除或标记 spool 已消费；删除失败不会重复入库。
5. 最后尝试写兼容 JSON artifact；该步骤失败只产生警告。

Spool 包含 schema version、evaluation/run ID、恢复所需的规范化 Run provenance 快照、candidate fingerprint、完整安全 report、创建时间和内容 checksum；默认不包含 oracle 命令或原始输出。显式 reveal 产生的敏感诊断必须标记 exposure、使用仅当前用户权限并在 UI 中警告。启动时自动扫描并幂等重放，也提供 `db recover [file]`。幂等键至少包含 evaluation ID 与 checksum，恢复不能重新运行测试或覆盖已有 primary。

如果 spool 写入失败但 SQLite 可写，可以直接事务入库；如果二者都失败，CLI 必须返回非零、在当前机器输出中附带 `persistence=unsaved`，并明确说明进程退出后无法保证恢复，不能声称“结果不会丢失”。

## 14. 命令产品面

### 14.1 新增或扩展命令

| 命令 | 行为 |
|---|---|
| 无参数 | 打开中文交互首页 |
| `run` | 启动新 Run 向导 |
| `resume [run-id]` | 恢复未完成 Run；不提供 ID 时交互选择 |
| `launch <run-id>` | 使用已确认配置由 runner 包装启动 prepared Run，并记录 verified execution |
| `evaluate <run-id>` | 快捷评价已记录 Run |
| `results` | 浏览或筛选 SQLite 历史 |
| `result <run-id>` | 查看 Run、primary 与 latest Evaluation |
| `compare <run-a> <run-b>` | 默认并排比较两次 Run 的 primary |
| `export <run-id>` | 默认导出 primary 的无隐藏信息 JSON |
| `db recover [file]` | 幂等重放未入库的评价 recovery spool |

`compare` 只有在显式传入 `--evaluation-a/--evaluation-b <evaluation-id>`，`export` 只有在显式传入 `--evaluation <evaluation-id>` 时才使用非 primary 结果，并在输出中标记 `iterated=true`/`post_exposure`；不能用模糊的 `--latest` 静默改变公平对比口径。

### 14.2 保留命令

现有 `list`、`show`、`doctor`、`validate`、`prepare <case>` 和 `evaluate <case> --workspace <path>` 保持可用。`evaluate` 的第一个位置参数按以下无歧义顺序解析：

1. 完整 Run UUID，或至少 8 个十六进制字符且唯一的 UUID 前缀；过短或不唯一必须报错。
2. 已知 case ID；此时沿用低层 workspace 模式。

低层 `evaluate` 也必须把结果写入 SQLite。如果 workspace 没有关联 Run，则创建来源为 `ad-hoc` 的 Run，agent/model/effort 字段为空，而不是伪造值。

Run ID 模式禁止传 `--workspace` 覆盖 SQLite 中的规范路径；case ID 模式继续允许 `--workspace`，省略时仍使用现有 case 默认 workspace，保持旧行为。

### 14.3 非交互运行

`run` 提供 case、adapter、model、effort、mode、workspace 和确认等参数，以支持脚本化。非 TTY 环境中若缺少必填选择，必须快速失败并列出缺失参数，不能等待交互输入。

全局 `--db`、`--json`、`--jsonl`、`--no-color` 接受放在子命令前或后；同一选项重复且值冲突时必须报错，不能采用“最后一个生效”的隐式规则。

所有新命令继续提供稳定的机器输出：

- `--json` 的 stdout 在命令结束时只输出一个 JSON 对象；托管 agent 的人类可读流和诊断写到 stderr，过程中不向 stdout 打印进度。
- `--jsonl` 用于需要实时事件的调用方；stdout 每行都是带 `schemaVersion`、`type`、`runId` 的 JSON 事件，最后必须是 `result` 或 `error` 事件。
- `--json` 与 `--jsonl` 互斥，二者都禁止 ANSI；无法解析的上游原始行只能进入受限 stderr/诊断，不能污染 stdout。
- 普通 TTY 模式继续流式显示中文进度；尊重 `NO_COLOR`，窄终端不截断 Prompt。

## 15. Functional Requirements

### 15.1 探测与选择

- **FR-001**：首页必须自动探测 Claude Code 和 Codex CLI。
- **FR-002**：每个 probe 必须设置超时，失败不能阻塞另一个 CLI。
- **FR-003**：成功探测时必须保存版本原文和规范化版本。
- **FR-004**：CLI 选择界面必须同时显示安装状态和版本。
- **FR-005**：模型步骤在 workspace 创建前必须出现并得到确认。
- **FR-006**：思考深度步骤在 workspace 创建前必须出现并得到确认。
- **FR-007**：只允许选择 adapter 当前版本声明支持的 effort。
- **FR-008**：用户可以指定另一个 CLI executable；版本必须重新自动探测。
- **FR-009**：runner 不得自动安装、升级或修改用户 CLI 配置。

### 15.2 Workspace 与 Prompt

- **FR-010**：每个 Run 默认使用包含唯一 Run ID 的新 workspace。
- **FR-011**：确认前不得创建 workspace。
- **FR-012**：准备逻辑继续使用目标提交的父提交快照和独立 Git 仓库。
- **FR-013**：准备成功后必须输出绝对 DIR。
- **FR-014**：必须输出完整、未截断、无 ANSI 的 Prompt。
- **FR-015**：必须输出与 adapter/model/effort 一致的启动命令。
- **FR-016**：Prompt 必须供应商中立，并保存版本和哈希。
- **FR-017**：同一 case 与模板版本在不同 adapter 下的 Prompt 字节必须相同。
- **FR-018**：Prompt 和 session 元数据不得进入候选生产路径评分。

### 15.3 Agent 运行

- **FR-019**：用户可以在托管和 handoff 两种模式间选择。
- **FR-020**：托管模式必须使用参数数组和 stdin 启动 CLI。
- **FR-021**：托管进程的 cwd 必须固定为候选 workspace，不得主动授予额外目录，并必须记录实际 `write_isolation` 级别。
- **FR-022**：默认不得使用 dangerous bypass 参数。
- **FR-023**：agent 退出码非 0 时仍必须允许评价 workspace。
- **FR-024**：runner 必须区分 agent 用时与评价用时。
- **FR-025**：可用时记录 session/model/token/cost；不可用时保留 null。
- **FR-026**：默认不持久化模型思考内容和完整原始日志。
- **FR-027**：中断后的已准备 Run 必须可恢复。

### 15.4 评价与结果

- **FR-028**：交互流程必须在 agent 完成后用一次确认启动评价。
- **FR-029**：快捷评价只需要 Run ID 或唯一前缀。
- **FR-030**：评价必须继续使用独立副本、隐藏 oracle 和现有计分公式。
- **FR-031**：每次评价必须记录候选状态指纹。
- **FR-032**：测试失败必须生成有效低分结果，而非基础设施错误。
- **FR-033**：所有新评价必须事务性写入 SQLite。
- **FR-034**：一个 Run 必须支持多次 Evaluation。
- **FR-035**：历史结果必须可按 case、adapter、model 和日期筛选。
- **FR-036**：必须支持同一 case 的两次 Run 并排比较。
- **FR-037**：关键可比性字段不一致时必须显示警告。
- **FR-038**：默认结果不得暴露缺失/额外参考路径或 oracle 原始输出。

### 15.5 兼容性与恢复

- **FR-039**：现有低层命令和 `--json` 调用保持兼容。
- **FR-040**：低层评价也必须持久化到 SQLite。
- **FR-041**：非 TTY 缺少参数时必须快速失败。
- **FR-042**：SQLite migration 必须幂等且可识别未知未来版本。
- **FR-043**：同一 Run 被两个进程同时操作时，第二个进程必须收到明确冲突信息。
- **FR-044**：删除 workspace 必须单独、明确确认，不与“取消 Run”绑定。
- **FR-045**：依赖策略必须在 workspace 创建前确认并写入 Run。
- **FR-046**：同一 Run 的 agent 重试必须新增 launch attempt；修改 model/effort 必须创建干净的新 Run。
- **FR-047**：版本命令成功时，非空 stderr 警告不得导致 probe 失败。
- **FR-048**：`--json` 模式的 stdout 只能包含 JSON；诊断和警告必须写入 stderr。
- **FR-049**：首个完整评分必须成为不可替换的 primary evaluation；历史和公平对比默认使用它。
- **FR-050**：reveal 输出或 keep-evaluation 目录发生前必须持久化 oracle exposure，后续评价不得标成 primary。
- **FR-051**：候选指纹必须覆盖 tracked diff 与 untracked 内容，而不只记录 Git HEAD。
- **FR-052**：新 workspace 的 session attestation 必须关联 opaque Run ID 和 Prompt hash；旧 v1 session 仍可由低层命令评价。
- **FR-053**：已拥有 primary 或已暴露 oracle 的 Run 不得再次托管启动 agent；继续迭代必须使用新的 Run。
- **FR-054**：prepare、托管启动和评价必须使用可恢复操作租约；陈旧 PID 不得被自动信号或误认为仍属当前 Run。
- **FR-055**：Handoff 必须把计划配置标为未验证；每次托管 launch 必须保存启动前重新 probe 的实际 executable/version/capability 快照。
- **FR-056**：`--json` 必须是单一最终对象，`--jsonl` 必须是逐行类型化事件；agent 文本或 ANSI 不得污染机器 stdout。
- **FR-057**：建议时长不得自动终止 agent；只有显式 agent timeout 才能触发先温和、后强制的进程组终止，并保留 workspace。
- **FR-058**：完整评价必须先原子写 recovery spool 再提交 SQLite；重放按 evaluation ID/checksum 幂等且不得重跑测试。
- **FR-059**：`--db` 必须拒绝源 `.git` 与候选 workspace 范围；v2 workspace/Run 关联必须执行 DB、attestation、实际 Git 的双向核验。
- **FR-060**：托管 launch 必须使用最小环境白名单，默认移除项目/云端 secret，并分别记录 provider 控制面与 agent 工具网络隔离级别。

## 16. Non-functional Requirements

### 16.1 可用性

- 所有面向人的主流程、错误和恢复动作使用简体中文。
- 选择项支持方向键，同时提供数字键/回车可用的降级交互。
- 空状态必须给出下一步，不只显示“无结果”。
- 错误信息包含发生了什么、是否保留 workspace、下一条可执行动作。
- 所有长步骤显示阶段和耗时；不伪造百分比进度。

### 16.2 性能

- 正常机器上两个 CLI probe 并行完成，目标不超过 2 秒；单个 probe 超时不超过 3 秒。
- SQLite 常规写入目标不超过 100ms，不含磁盘异常和 migration。
- 历史列表默认分页，不一次渲染无限记录。
- Prompt 和结构化 agent 输出设置合理大小上限；超限时安全截断日志，但不能截断展示给用户的规范 Prompt。

### 16.3 可移植性

- 支持 macOS、Linux 和 Windows/WSL；Benchmark CLI v2 的最低运行时提升为 Node 22 LTS。
- shell 引用只用于展示；实际启动不依赖 Bash。
- Node 版本过低时，在加载 native SQLite 驱动前输出清晰的中文升级提示，不能只显示模块加载堆栈。
- 终端不支持颜色或 Unicode 边框时使用 ASCII 降级。

### 16.4 安全与隐私

- 不记录认证 secret、完整环境变量或用户全局配置。
- 数据库默认位于 Git ignore 目录，文件权限最小化。
- Prompt、model 和 CLI 路径按数据处理，不参与 shell 求值。
- 所有可执行文件 probe 和 agent 进程都有超时/中断策略。
- reveal/keep 诊断数据必须显式 opt-in，并在 UI 中提示不要交回同一盲测 agent。

## 17. User Stories

1. 作为首次使用者，我希望只运行一个命令进入中文首页，以便不用记忆 benchmark 子命令。
2. 作为评测者，我希望首页自动告诉我 Claude Code 和 Codex 是否安装，以便立即选择可用工具。
3. 作为评测者，我希望 CLI 版本自动从实际二进制获取，以免手工记录错误。
4. 作为有多个 CLI 安装的用户，我希望指定另一个二进制，并让版本重新探测，以便准确测试目标版本。
5. 作为评测者，我希望在创建环境前选择 case，以便先理解任务成本。
6. 作为评测者，我希望在创建环境前明确选择模型，以便结果具有可重复配置。
7. 作为评测者，我希望在创建环境前明确选择思考深度，以便公平比较不同 agent。
8. 作为成本敏感用户，我希望可以选择 CLI 默认模型或较低 effort，以便控制消耗。
9. 作为严谨评测者，我希望手动输入精确模型标识，以便锁定实验变量。
10. 作为评测者，我希望最终确认页汇总所有选择，以便在产生文件前发现错误。
11. 作为并行测试多个 agent 的用户，我希望每次运行自动生成独立目录，以免实现互相污染。
12. 作为手动运行 agent 的用户，我希望得到绝对 DIR，以便直接切换到正确目录。
13. 作为手动运行 agent 的用户，我希望得到完整可粘贴 Prompt，以免自己拼接遗漏验收标准。
14. 作为命令行用户，我希望得到可复制启动命令，以免弄错 model 或 effort 参数。
15. 作为公平性负责人，我希望 Claude 和 Codex 收到相同 Prompt，以便供应商差异不来自提示文本。
16. 作为追求省事的用户，我希望 runner 能直接启动 agent，以便在一个流程里完成作答。
17. 作为需要观察过程的用户，我希望看到 agent 的实时输出，以便知道任务是否仍在进行。
18. 作为安全敏感用户，我希望 runner 不默认关闭审批和沙箱，以免 agent 越界操作。
19. 作为手动工作流用户，我希望关闭 runner 后仍能恢复 Run，以便长任务不需要保持一个等待进程。
20. 作为用户，我希望 agent 异常退出后仍能评价已有改动，以免丢失有价值的部分结果。
21. 作为用户，我希望 agent 完成后按一次 Enter 就开始评价，以免重新查找 case 和目录。
22. 作为评测者，我希望评分进度使用中文显示，但不泄露隐藏测试，以便兼顾体验和盲测。
23. 作为评测者，我希望所有结果自动进入 SQLite，以便长期查询而不是整理散落 JSON。
24. 作为调试者，我希望同一 Run 可以多次评价，以便观察修复前后的得分变化。
25. 作为比较模型的用户，我希望筛选同一 case 的历史结果，以便快速选择对照组。
26. 作为比较 agent 的用户，我希望并排看到分数、行为测试和路径 F1，以便不只看总分。
27. 作为严谨评测者，我希望 Prompt 或运行策略不同时看到可比性警告，以免下错误结论。
28. 作为数据分析者，我希望 JSON 输出仍然稳定，以便脚本可以读取新结果。
29. 作为现有用户，我希望原有低层命令继续工作，以便已有自动化不被破坏。
30. 作为 CI 用户，我希望非 TTY 缺少参数时快速失败，以免作业永久等待输入。
31. 作为中断任务的用户，我希望下次启动自动看到未完成 Run，以便继续工作。
32. 作为隐私敏感用户，我希望数据库不保存 token、secret 或模型思考，以便安全保留历史。
33. 作为维护者，我希望 adapter 能根据 CLI 能力降级，以便上游 flag 变化时错误清晰可控。
34. 作为维护者，我希望数据库 schema 可迁移，以便未来增加指标而不丢历史。
35. 作为公平性负责人，我希望首轮评分永久保留并成为默认对比结果，以免赛后迭代覆盖真实首轮能力。
36. 作为公平性负责人，我希望 handoff 配置明确标为未验证，以免准备时版本被误认为实际执行版本。
37. 作为安全敏感用户，我希望 agent 默认看不到项目密钥和无关云凭证，以免评测泄露宿主环境。
38. 作为运行昂贵评测的用户，我希望数据库暂时不可写时仍能从 spool 恢复结果，以免重跑 agent 和测试。
39. 作为长任务用户，我希望建议时长不会自动杀死 agent，并可以自行设置明确硬超时。

## 18. Implementation Decisions

1. 在现有 benchmark engine 之上增加 orchestration 层，并保留已经验证的安全不变量：Git archive 基线、tree 校验、候选 symlink 拒绝、oracle 只注入一次性副本、检查间隔离、写时复制依赖和进程组清理。当前函数形状可以重构，不能因为“复用”而保留不一致快照、同步不可取消或持久化耦合。
2. CLI 入口分为交互路由和现有显式命令路由；无参数且 stdin/stdout 为 TTY 时进入首页。
3. 使用可注入的中文 prompt UI 抽象，生产环境采用支持 select/input/confirm/cancel 的终端组件，测试使用脚本化答案，不测试 ANSI 实现细节。
4. Claude Code 与 Codex 各自实现 adapter，共享能力接口和统一 Run 配置，不在主流程散落供应商条件分支。
5. adapter 先 probe 帮助文本再构建 invocation；版本映射只承担兼容兜底。
6. 托管调用统一使用子进程 argv、固定 cwd 和 stdin Prompt，不通过 shell。
7. Prompt 生成器独立版本化；agent adapter 不允许改写规范 Prompt。
8. 默认 workspace 从 case 级路径升级为 Run 级唯一路径；低层 `prepare` 的显式路径语义保持不变。
9. Workspace session attestation 升级为向后兼容的新版本，加入 opaque Run ID 和 Prompt hash；agent 配置与结果仍以 workspace 外的 SQLite 为准，不能信任候选可写文件作为权威来源。
10. SQLite repository 是唯一持久化接口，负责 migration、事务、状态转换和查询。
11. Benchmark CLI v2 将最低运行时提升为 Node 22 LTS，并采用锁定版本的 `better-sqlite3` 作为本地驱动，使用同步事务和 WAL，不依赖系统预装 `sqlite3`。驱动加入根项目 `devDependencies` 和 lockfile，因为当前仓库不是 npm workspace，不能只写入嵌套 benchmark package。所选版本必须为支持平台提供预构建产物；`doctor` 验证驱动可加载，并在需要本地编译时给出构建工具诊断。
12. 评价结果继续形成完整 report 对象；同一对象在一个事务内规范化写入 evaluations/checks，并可作为 JSON artifact 导出。
13. Run 与 Evaluation 使用不可预测 UUID；UI 接受至少 8 位的唯一十六进制前缀，数据库仍以完整 ID 关联。
14. Agent telemetry 采用“尽力解析”的可空字段，解析失败不能使有效代码作答失败。
15. 生命周期状态由 repository 进行 compare-and-set 更新，防止多终端重复启动或评价。
16. 现有 doctor 扩展为 benchmark 核心检查与 adapter probe 两部分；缺少某个 agent CLI 不影响另一 adapter 和低层评分功能。
17. SQLite 数据库、workspace、临时输出和兼容 JSON artifact 全部位于已忽略的 runtime 根目录，除非用户显式覆盖。
18. PromptBundle 是 `.benchmark-task.md`、终端完整 Prompt、stdin Prompt 和 Prompt hash 的唯一来源；prepare 不再拥有另一套私有任务渲染逻辑。
19. 评价开始时只从 live workspace 构造一次冻结候选快照；候选指纹、路径 F1、typecheck、build 和 behavior 都从该快照或它的独立派生副本计算，避免 handoff agent 并发写入导致一次报告混合多个代码状态。
20. 检查执行改为可取消的异步子进程编排，或放入受控 evaluator 子进程；主 runner 必须能处理 SIGINT、记录 interrupted、显示阶段进度并清理进程组。
21. Evaluator 只返回 report，不直接写 JSON/SQLite；recovery spool、SQLite repository 和兼容 JSON writer 是按固定顺序调用的独立持久化边界。

## 19. Testing Decisions

### 19.1 最高层测试 seam

主要测试 seam 是 in-process `BenchmarkRunner`：注入 scripted Terminal、fake AgentAdapter、真实临时 SQLite、真实临时 Git/workspace、可控 clock/ID，以及需要时的真实 Evaluator。该 seam 覆盖交互答案、创建前确认、Prompt 输出、agent 生命周期、快捷评价、SQLite 记录和恢复，而不依赖宿主 stdin 是否真的是 TTY。

CLI 子进程测试承担第二层边界：用完整非交互参数运行 `run/evaluate/results`，配合伪造的 Claude/Codex executable 响应 `--version`、`--help` 和托管事件，观察 stdout/stderr、退出码和临时 SQLite。普通 pipe 不是 TTY，因此不使用“向 child stdin 喂按键”冒充交互测试；首版不引入跨平台 PTY native 依赖。

### 19.2 必要的补充 seam

仅对以下难以通过完整流程穷举的边界增加较低层契约测试：

- SQLite migration、事务回滚和并发状态转换。
- adapter 对多个已知 help/version 输出的能力解析。
- Prompt 确定性、哈希与跨 adapter 字节一致性。
- CLI JSON/JSONL telemetry 的容错解析。

### 19.3 测试原则

- 断言用户可观察行为和持久化契约，不断言内部函数调用次数。
- 复用现有 CLI 子进程测试方式和临时 Git 仓库模式。
- 每个测试使用独立临时 runtime root 和 SQLite，不能读取开发者真实历史。
- 所有会触发持久化的 CLI 测试都显式传临时 `--db`，不能写开发者默认数据库。
- 不依赖本机是否安装 Claude/Codex。
- 不把 ANSI spinner 或精确空格作为核心断言；提供无颜色测试模式。
- 真实 prepare/evaluate 至少保留一个端到端案例，证明新 orchestration 没有绕过现有隔离。
- 所有错误路径断言 workspace 是否保留、数据库状态和下一步提示。
- TTY gating 只做少量 CLI 路由测试；完整向导行为通过注入 Terminal 的 Runner seam 验收。
- CI 至少覆盖最低 Node 22 和一个更新的 active LTS；SQLite 安装/打开 smoke test 覆盖 macOS、Linux 与 Windows/WSL 目标环境。

### 19.4 关键验收测试

1. 同时发现 Claude/Codex，显示各自自动版本；probe 不发起模型请求。
2. 仅安装一个 CLI 时，另一个显示未安装但不阻塞流程。
3. 模型和 effort 未确认前，目标 workspace 不存在。
4. 最终取消不创建 Run/workspace。
5. Codex 托管运行收到正确 cwd、model、reasoning effort、安全策略和完整 stdin Prompt。
6. Claude 托管运行收到正确 cwd、model、effort、安全策略和完整 stdin Prompt。
7. 同一 case 的两个 adapter 获得完全相同的 Prompt 哈希。
8. Handoff 输出完整 DIR、Prompt、命令，关闭后可恢复。
9. Agent exit 0 后按 Enter 直接评价并写 SQLite。
10. Agent exit 非 0 且有改动时仍可评价。
11. 有效测试失败写入 completed Evaluation 和低分，不写 evaluation_failed。
12. 评价基础设施失败可重试，旧失败记录保留。
13. 多次评价同一 Run 时保留多个候选指纹和结果。
14. 历史筛选与同 case 对比输出正确。
15. Prompt/manifest/策略不一致时显示可比性警告。
16. 两个进程同时恢复同一 Run 时只允许一个取得运行权。
17. 评分完成后注入 SQLite 写故障，CLI 保留原子 recovery spool；重启后无需重跑测试即可幂等入库。
18. `--json` 输出可解析，同时数据库存在对应记录。
19. 原低层命令兼容测试继续通过。
20. 默认数据库不包含 oracle 原始输出、环境变量 secret 或模型思考。
21. 第一次完整评分固定为 primary；修改代码后的重评只更新 latest，对比默认仍使用 primary。
22. reveal 或 keep 暴露 oracle 后的新评价带 post-exposure 标记，不能替代 primary。
23. 候选 HEAD 相同但 untracked 内容不同，必须产生不同候选指纹。
24. v2 Run session 可关联 SQLite；现有 v1 workspace 仍可使用低层命令评分。
25. 分别在 prepare、agent launch 和 evaluation 中强制终止 runner 后，陈旧操作租约都可安全恢复，且不会向复用 PID 的无关进程发送信号。
26. Handoff 与 managed 结果对比时显示配置可信度差异；managed launch 前版本变化会停止而不是静默继续。
27. fake agent 同时输出普通文本、ANSI 和 stderr 时，`--json` stdout 仍可直接 `JSON.parse`，`--jsonl` 每行仍可独立解析。
28. 默认运行超过建议时长只提示不终止；显式短 timeout 会执行宽限期终止、记录 timed_out 并允许评价。
29. `--db` 指向候选 workspace、源 `.git` 或 symlink 等价路径时被拒绝；篡改 v2 session 不能关联其他 Run 或降级为 ad-hoc。
30. 向父 runner 注入 sentinel `JWT_SECRET`、`MONGODB_URI` 和无关 AWS token 时，fake agent 环境不可见；必须使用 provider env 认证时要求显式确认并记录 secret isolation。

## 20. 错误与恢复矩阵

| 情况 | 用户信息 | 数据/目录处理 | 下一步 |
|---|---|---|---|
| CLI 未安装 | 显示缺失和官方安装入口 | 不创建 Run | 指定路径、换 adapter、退出 |
| 版本未知 | 显示可执行文件存在但版本未知 | 保存 raw probe | handoff 或重新指定路径 |
| 已知 model/effort 能力不支持 | 在确认前说明冲突 | 不创建 Run | 重新选择 |
| provider 在启动时拒绝 model/effort | 标记 launch_failed，不静默降级 | 保留 workspace 与实际错误摘要 | 同配置重试或新建配置 Run |
| workspace 已存在 | 不覆盖任何文件 | Run 记 prepare_failed | 自动生成新 ID 或指定新路径 |
| prepare 失败 | 显示安全摘要 | 清理不完整目录 | 重试新 Run |
| agent 登录失败 | 显示 CLI 退出摘要 | 保留 workspace 和 Run | 登录后重新启动或评价已有代码 |
| agent 被中断 | 显示退出原因 | 保留 workspace | 继续运行、handoff、评价 |
| workspace 无改动 | 评价前警告 | 不自动取消 | 仍评价或返回 |
| SQLite 被锁 | 显示占用提示、Run ID 和 spool 路径 | 原子保留安全 report spool | 自动重放或 `db recover` |
| SQLite migration 失败 | 显示数据库路径 | 不执行后续写入 | 备份、修复或换 `--db` |
| 评价测试失败 | 显示正常低分 | 写 completed Evaluation | 查看、对比、修复后重评 |
| 评价引擎异常 | 区分于测试失败 | 写 evaluation_failed | 重试，不修改候选 |

## 21. 发布与迁移计划

### 阶段 A：持久化基础

1. 引入 SQLite repository 和 schema migration。
2. 让现有 evaluate 双写 SQLite 与兼容 JSON。
3. 增加历史结果读取和数据完整性测试。

### 阶段 B：Adapter 与探测

1. 定义统一 adapter contract。
2. 实现 Claude Code/Codex probe、版本、model/effort 和 invocation。
3. 扩展 doctor，使用 fake binary 完成契约测试。

### 阶段 C：中文交互流程

1. 实现首页、新建向导、确认页和准备完成页。
2. 实现 Handoff、恢复和快捷评价。
3. 保证 Prompt 版本化和跨 adapter 一致。

### 阶段 D：托管运行与对比

1. 实现子进程生命周期、结构化事件和安全中断。
2. 实现历史筛选、详情和并排对比。
3. 完成兼容、跨平台和中断恢复验证。

每个阶段都必须保持现有 benchmark 自检、gold 验证和主项目测试通过。

## 22. Definition of Done

只有同时满足以下条件，v2 才视为完成：

1. 无参数 CLI 提供完整中文交互首页。
2. Claude Code 和 Codex 在受支持版本上都能完成 probe、配置、托管或 handoff 流程。
3. workspace 创建前已询问并确认模型和思考深度。
4. 自动获取 CLI 版本；托管 launch 保存启动时实际 probe，Handoff 明确标记为计划版本、实际未验证；探测失败有清晰降级。
5. 每次准备显示绝对 DIR、完整 Prompt 和启动命令。
6. agent 结束后一次确认即可评价，Run ID 快捷命令可在新终端工作。
7. 所有 Run/Evaluation/check 数据正确写入 SQLite，并支持恢复、历史和对比。
8. 首轮 primary、后续 latest 和 post-exposure 结果被明确区分，默认公平对比不使用迭代分数。
9. Prompt 在两个 adapter 间一致且不泄露 reference/oracle。
10. 默认启动不使用危险 bypass、不主动授予额外目录，并如实展示本机隔离能力。
11. 中断、CLI 失败、评价基础设施失败和 SQLite 锁均有可验证恢复路径。
12. 原有低层命令、JSON 用法、评分公式和隔离测试保持兼容。
13. fake CLI 端到端测试、SQLite migration 测试、现有 benchmark 测试、typecheck 和 build 全部通过。
14. README 更新为新手 5 分钟可完成的中文快速上手，并解释托管/手动、公平性和隐私边界。
15. 托管进程不继承完整环境，项目 secret 默认不可见；实际 write/secret/tool-network isolation 在结果中可审计。

## 23. Out of Scope

- 自动下载指定历史版本的 Claude Code/Codex。
- 远程 Docker/VM 恶意代码隔离。
- 自动充值、预算审批或统一费用结算。
- 对模型自然语言输出做主观质量评分。
- 将数据库同步到云端或团队服务。
- Web dashboard、排行榜和公开上传。
- 自动删除旧 workspace 或数据库记录。
- 自动把 reveal 的隐藏测试信息提供给失败 agent 继续作答。

## 24. Further Notes

### 24.1 当前能力审计基线

截至 2026-07-18，本机探测结果为：

- Codex CLI `0.144.5`
- Claude Code `2.1.214`

当前 Claude Code 帮助信息提供 model、effort、非交互输出和 permission mode；当前 Codex `exec` 提供 model、workspace、sandbox、JSONL 和通用配置覆盖。Codex 的 reasoning effort 可通过配置覆盖表达。以上只作为 adapter 测试样本，不能替代每次运行时 probe。

官方参考：

- [Codex CLI 命令参考](https://developers.openai.com/codex/cli/reference)
- [Codex 配置参考](https://developers.openai.com/codex/config-reference)
- [Claude Code CLI 参考](https://docs.anthropic.com/en/docs/claude-code/cli-usage)

### 24.2 已确定默认值

- 语言：简体中文。
- 新用户运行方式：托管运行（推荐），始终同时提供 handoff 信息。
- 新用户模型：CLI 默认模型，需要显式确认。
- 新用户 effort：`high（推荐）`，不支持时使用 CLI 默认值。
- CLI 版本：自动探测优先，禁止手改成功探测结果。
- 数据库：本地 SQLite，位于 ignored runtime 目录。
- 结果详情：默认隐藏 oracle 输出。
- workspace：每个 Run 独立，不复用 case 级目录。

### 24.3 产品边界提醒

SQLite 让结果可追溯，但不能自动保证实验公平。对比结论仍应同时考虑 case、Prompt hash、CLI/version、model、effort、安全策略、网络环境、agent 用时、检查结果和人工代码审查。
