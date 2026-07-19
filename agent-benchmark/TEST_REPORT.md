# Agent Benchmark v2 MVP 测试记录

日期：2026-07-19

## 已完成验证

| 命令 | 结果 |
|---|---|
| `npx vitest run tests/agent-benchmark/v2-cli.test.ts` | 通过：1 个文件、3 个端到端测试，104.38 秒。覆盖非 TTY 快速失败、fake Codex/Claude 探测、handoff 创建与跨进程恢复、Run ID 真实评价及 SQLite primary/check 持久化。 |
| `npx vitest run tests/agent-benchmark/runner.test.ts tests/agent-benchmark/evaluator.test.ts tests/agent-benchmark/repository.test.ts tests/agent-benchmark/lease-recovery.test.ts` | 通过：4 个文件、17 个测试。覆盖中文首页/向导、评价子进程取消、SQLite migration/事务、操作租约冲突与过期恢复。 |
| `npx vitest run tests/agent-benchmark/engine-v2.test.ts` | 通过：1 个文件、4 个测试。覆盖 v2 attestation、候选指纹、禁止 v2 降级 ad-hoc、排除 benchmark 元数据。 |
| `npx vitest run tests/agent-benchmark/adapters.test.ts tests/agent-benchmark/runner.test.ts` | 通过：2 个文件、10 个测试。覆盖 CLI probe、能力门控、安全 handoff 命令及向导。 |
| `npm run typecheck` | 通过。 |
| `npm run build` | 通过；Vite 构建成功。存在原项目已有的单 chunk 大于 500 kB 警告。 |

## 恢复路径缺陷修复复验

2026-07-19 使用默认 SQLite 中的真实残留记录 `b3ee13cb` 稳定复现：该记录为
`run_mode=ad-hoc`、`status=ready_for_evaluation` 且 `adapter_id=NULL`，旧首页会将其误列为
可恢复 handoff Run，随后报错 `Unsupported agent adapter: null`。

修复后完成以下最小验证：

| 命令/场景 | 结果 |
|---|---|
| `npx vitest run tests/agent-benchmark/repository.test.ts tests/agent-benchmark/runner.test.ts` | 通过：2 个文件、12 个测试。新增覆盖 ad-hoc 未完成记录不进入首页恢复列表，以及显式 `resume` 返回中文兼容错误。 |
| `node agent-benchmark/cli.mjs resume b3ee13cb` | 不再泄露底层 adapter 错误；明确说明 ad-hoc 记录不能通过 handoff resume 恢复。 |
| `pnpm run benchmark` 真实 TTY 首页 | 仅统计并恢复有效 handoff Run；残留 ad-hoc 记录不再计入未完成评测。 |
| `npm run typecheck`、`node --check`、`git diff --check` | 通过。 |

## 历史结果与两次 Run 对比

2026-07-19 完成首页“查看历史结果”和“对比两次结果”的 MVP，并为同一能力增加显式
`results` / `compare` 命令。测试采用独立临时 SQLite，不读取开发者本机历史，也不运行真实 agent。

| 命令 | 结果 |
|---|---|
| `npx vitest run tests/agent-benchmark/history-repository.test.ts tests/agent-benchmark/results-comparison.test.ts tests/agent-benchmark/history-runner.test.ts tests/agent-benchmark/history-cli.test.ts tests/agent-benchmark/repository.test.ts tests/agent-benchmark/runner.test.ts` | 通过：6 个文件、54 个测试。覆盖历史筛选/排序/分页、primary 固定、无评价与仅 non-primary 状态、安全字段白名单、详情、交互错误恢复、超过 100 条的对比候选、完整 Evaluation UUID、post-exposure 标记、显式 CLI 与跨 case 可比性警告。 |
| `node --check agent-benchmark/cli.mjs`、`node --check agent-benchmark/src/repository.mjs`、`node --check agent-benchmark/src/results.mjs`、`node --check agent-benchmark/src/runner.mjs` | 通过。 |
| `npx eslint agent-benchmark/cli.mjs agent-benchmark/src/repository.mjs agent-benchmark/src/results.mjs agent-benchmark/src/runner.mjs tests/agent-benchmark/history-cli.test.ts tests/agent-benchmark/history-repository.test.ts tests/agent-benchmark/history-runner.test.ts tests/agent-benchmark/results-comparison.test.ts` | 通过。 |
| `git diff --check -- agent-benchmark tests/agent-benchmark` | 通过。 |
| `npm run typecheck` | 通过。 |
| `npm run build` | 通过；Vite 构建成功。存在原项目已有的单 chunk 大于 500 kB 警告。 |

关键测试按红灯到绿灯推进：先验证缺少历史查询、对比模块、完整交互摘要、非法参数拒绝、
post-exposure/完整 UUID、effective telemetry 警告和跨页候选等行为确实失败，再加入对应实现。
新 JSON 输出还检查了 prompt、workspace、report、diagnostic 与 oracle sentinel 不会泄漏。

本轮没有运行 `npm run benchmark:test` 完整套件；这是此前“尽快交付 MVP / 跳过完整测试”的范围约定。
上表仅记录本轮实际完成的定向测试、typecheck 与 build。

## 完整 benchmark 套件状态

`npm run benchmark:test` 已改为 `--no-file-parallelism`，避免多个真实 Git prepare/evaluate 测试并行争用磁盘。完整套件的早期运行中，功能断言未显示新增失败，但若干真实 Git/评价测试超过原有 5 秒或 60 秒测试时限；对应慢测试时限已按实际负载调整。

最终完整套件重跑于 2026-07-19 按用户指示“跳过测试”中止，因此本文件不将其记录为通过。上表列出的定向测试、端到端测试、typecheck 和 build 均为实际完成结果。

## MVP 覆盖范围

- 无参数中文交互首页与新建 Run 向导
- Codex CLI / Claude Code 版本及 help 能力探测
- 每 Run 独立 workspace、规范 Prompt 与 v2 session attestation
- SQLite Run/Evaluation/check 持久化、primary/latest 与 oracle exposure
- handoff 暂停/恢复、Run ID 快捷评价、评价操作租约和 recovery spool
- 既有 `list/show/doctor/validate/prepare/evaluate <case>` 显式命令兼容

## `content-auth-security` 行为评分拆分

2026-07-19 将该题原先全有或全无的 70 点 `behavior` 拆为四个独立检查：sanitizer
25、认证 20、客户端会话 15、安全头 10。历史列表、详情和 Run 对比会动态展示新检查；旧
Evaluation 中的 `behavior` 仍可读取。

本轮按红灯到绿灯推进了两个公开 seam：`show --json` 的清单契约，以及 SQLite
历史/中文结果展示。

| 命令 | 结果 |
|---|---|
| `npx vitest run tests/agent-benchmark/cli.test.ts -t "content auth security exposes"` | 通过：清单固定为 `sanitizer=25`、`auth=20`、`client-session=15`、`security-headers=10`，行为点数合计 70。 |
| `npx vitest run tests/agent-benchmark/history-repository.test.ts tests/agent-benchmark/history-cli.test.ts tests/agent-benchmark/history-runner.test.ts tests/agent-benchmark/runner.test.ts` | 通过：4 个文件、33 个测试。覆盖动态检查持久化、历史/详情/对比输出和旧 `behavior` 兼容。 |
| `node agent-benchmark/cli.mjs validate content-auth-security --json` | 通过：manifest、Git parent、source ref、diff 统计和 oracle 文件校验均有效。 |
| `node agent-benchmark/cli.mjs validate content-auth-security --run-gold --json` | 通过：未实现基线四个领域全部失败并得 0；参考实现的四领域、typecheck、build 全部通过并得 100；补充安全头 harness 在 base/gold 上分别为 0/100。 |
| `npm run benchmark:test` | 通过：15 个文件、99 个测试，Vitest 总时长 366.65 秒；规格审查随后移除了 2 个范围外的 manifest 硬拒绝测试，保留的实现测试未变。 |
| `npm run typecheck` | 通过。 |
| `npm run build` | 通过；Vite 构建成功，保留原有单 chunk 大于 500 kB 警告。 |
| `node --check`、定向 ESLint、`git diff --check -- agent-benchmark tests/agent-benchmark` | 通过。 |
