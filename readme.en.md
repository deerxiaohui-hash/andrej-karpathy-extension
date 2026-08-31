# Andrej-Karpathy-Extension

[简体中文](readme.md) | English

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/deerxiaohui-hash/andrej-karpathy-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/deerxiaohui-hash/andrej-karpathy-extension/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/andrej-karpathy-extension.svg)](https://www.npmjs.com/package/andrej-karpathy-extension)

A [pi](https://pi.dev) extension that programmatically enforces Andrej Karpathy's four coding guidelines. Compatible with [pi2dsh](https://npm.im/pi2dsh); runs under DSH (DeepSeek Harness).

---

## Why it exists

Of course you could paste the four guidelines into the system prompt manually. But:

- **Models "forget".** In long conversations, the weight of an early system prompt gets diluted by later tokens.
- **A reminder is not enforcement.** The model knows the principles, but it won't proactively check itself against them.
- **There is no feedback loop.** After writing 200 lines of code, the model won't say "wait, this could be 50 lines".

This extension turns the guidelines from "hoping the model remembers" into "programmatically visible": every tool_call carries a size signal, and every tool_result gets checked. It provides visibility and reminders — it never blocks a tool call. Judgment stays with you.

## The four guidelines

Distilled from Andrej Karpathy's [observations on LLM coding pitfalls](https://x.com/karpathy/status/2015883857489522876):

| # | Guideline | In one sentence |
|---|-----------|-----------------|
| 1 | Think Before Coding | No assumptions, no hidden confusion — put trade-offs on the table |
| 2 | Simplicity First | Solve the problem with the least code; no speculative code |
| 3 | Surgical Changes | Change only what must change; clean up only your own mess |
| 4 | Goal-Driven Execution | Define verifiable success criteria and loop until they pass |

The full wording lives in [guidelines.ts](https://github.com/deerxiaohui-hash/andrej-karpathy-extension/blob/main/extensions/karpathy-guidelines/guidelines.ts) — the single source of truth from which the system-prompt injection, the `self_check` checklist, and the `/karma` output are all derived.

## What it does

**Persistent welcome banner (TUI).** On startup, a compact overview of the four guidelines is pinned above the input box for the whole session; print/RPC modes fall back to a one-time notification.

```text
── Karpathy Coding Guidelines ──────────────────────
  先想后做 / 简单优先 / 外科手术式修改 / 目标驱动执行
  /karma · /karma configure
```

**Guidelines injected into every system prompt.** The model sees the four guidelines on every turn, not just when it "remembers to load the skill".

**Visibility for large edits.** When a single `write` or `edit` touches more lines than the threshold, you get a notification with the exact number (multiple replacements within one `edit` call are counted together). Reminder only — the file is written as usual:

```text
karpathy | write src/big.ts | 201 行（阈值 150） | +201/-0
```

**Over-engineering detection.** After a `write`/`edit`, it counts the net-new top-level abstractions (functions, classes, interfaces, types; nested declarations don't count, and declarations already in the file are subtracted first). Over the threshold, a warning is prepended to the tool_result asking the model to justify each one before continuing. This warning goes to the model only — it is invisible in the UI:

```text
⚠️ [Karpathy — Simplicity First] 本次改动引入了 3 个新的顶层抽象（阈值：2）：
  - function `foo` (line 3)
  - function `bar` (line 10)
  - class `Baz` (line 18)

在继续下一步之前，逐个回答：
1. 每个抽象都是当前用户请求直接需要的吗？
2. 其中某些能否内联到调用方，而不是新建顶层抽象？
3. 一个资深工程师会认为这些属于过度设计吗？
```

**Ripple alert for shared modules.** If the edited file is imported by other source files via relative paths, a ripple note is prepended to the tool_result asking the model to run `tsc --noEmit` and the relevant tests before wrapping up.

**`/karma` slash command.**

- `/karma` — show the guidelines + current configuration
- `/karma review` — review the most recent code changes in the session
- `/karma configure` — show the config path and how to edit it
- `/karma help` — show subcommand help

**`self_check` tool.** Lets the LLM walk through the four-principle checklist at decision points.

**Update check.** On startup, it asynchronously queries the npm registry; if a newer release than the installed version exists, a one-time update notice is injected into the chat (scrolls away, not persistent). Failures are silently skipped.

## Install

### Quick start

```bash
pi install npm:andrej-karpathy-extension
```

Try it out temporarily (without touching your config):

```bash
pi -e npm:andrej-karpathy-extension
```

> [!IMPORTANT]
> Extensions run with your full user permissions. Review the source code before installing any third-party extension.

### Local development

```bash
git clone https://github.com/deerxiaohui-hash/andrej-karpathy-extension.git
cd andrej-karpathy-extension
pi -a
```

The repo ships with `.pi/settings.json`, so `-a` loads the extension automatically.

### DSH (via pi2dsh)

```bash
dsh plugin add pi2dsh
dsh plugin add npm:andrej-karpathy-extension
```

Then restart dsh.

### Uninstall

```bash
pi remove npm:andrej-karpathy-extension    # or pi uninstall
```

For DSH, remove the plugin entry from your config, then restart dsh.

## Configuration

Edit `~/.pi/agent/karpathy.json`, then run `/reload` inside pi.

| Option | Default | Description |
|--------|---------|-------------|
| `maxLinesPerEdit` | `150` | Max total lines touched (added + removed) by a single `write`/`edit`. The tool guard warns beyond this |
| `maxNewAbstractions` | `2` | Max net-new top-level abstractions (functions, classes, interfaces, types) per change. The result watcher warns beyond this |
| `enableToolGuard` | `true` | Enable the large-edit observer (notify only, never blocks) |
| `enableResultWatcher` | `true` | Enable over-engineering detection |
| `enableImpactWatcher` | `true` | Enable ripple alerts (require verifying dependants when a shared module changes) |
| `strictness` | `"medium"` | Scales both thresholds at once: `low` ×1.5 looser, `high` ×0.6 stricter |

Partial configs are merged with the defaults — only write what you want to override:

```json
{
  "strictness": "high"
}
```

For testing, point the `KARPATHY_CONFIG` environment variable at a different config file.

## Detection scope & limits

Detection is heuristic and deliberately prefers false positives over blocking tool calls:

- Top-level abstraction recognition supports TypeScript / JavaScript / Python; other languages are not recognized yet.
- Ripple analysis only follows relative imports (`./`, `../`); path aliases and package-name imports are ignored.
- All checks are observer-mode: reminders only, never blocking — judgment stays with you.

## Development

```bash
npm install        # install dependencies
npm test           # run the full test suite
npm run check      # type-check (includes test files)
```

Tests don't need a running pi — [test-harness.ts](https://github.com/deerxiaohui-hash/andrej-karpathy-extension/blob/main/extensions/karpathy-guidelines/test-harness.ts) provides fake `ExtensionAPI` / `ExtensionContext` objects and feeds events straight to the handlers.

See [CHANGELOG.md](https://github.com/deerxiaohui-hash/andrej-karpathy-extension/blob/main/CHANGELOG.md) for release history.

## pi2dsh compatibility

The extension only uses Pi APIs that pi2dsh maps, and runs fully under DSH. For the per-API mapping table and known gaps (e.g. the update notice is TUI-only), see [docs/pi2dsh.md](https://github.com/deerxiaohui-hash/andrej-karpathy-extension/blob/main/docs/pi2dsh.md).

## License

MIT
