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
