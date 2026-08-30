# Andrej-Karpathy-Extension

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/deerxiaohui-hash/andrej-karpathy-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/deerxiaohui-hash/andrej-karpathy-extension/actions/workflows/ci.yml)

一个 [pi](https://pi.dev) Extension，以程序化方式强制执行 Andrej Karpathy 的四条编码准则。兼容 [pi2dsh](https://npm.im/pi2dsh)，可在 DSH (DeepSeek Harness) 中运行。

---

## 为什么需要它

你当然可以手动把四条准则贴进 system prompt。但问题是：

- **模型会"忘记"。** 长对话里，早期的 system prompt 权重会被后续 token 稀释。
- **提醒 ≠ 执行。** 模型知道原则，但不会主动检查自己是否违反了它们。
- **没有反馈环。** 模型写完 200 行代码后，不会自己说"等等，这可以写成 50 行"。

本 Extension 把准则从"希望模型记住"变成"程序化可见"：每次 tool_call 都附上规模信号，每次 tool_result 都检查产出。它提供可见性和提醒，不拦截任何工具调用——判断留给人。

## 四条准则

蒸馏自 Andrej Karpathy 关于 [LLM 编码陷阱的观察](https://x.com/karpathy/status/2015883857489522876)：

| # | 准则 | 一句话 |
|---|------|--------|
| 1 | Think Before Coding（先想后做） | 不假设、不隐藏困惑，把权衡摆到台面上 |
| 2 | Simplicity First（简单优先） | 用最少的代码解决问题，不写推测性代码 |
| 3 | Surgical Changes（外科手术式修改） | 只改必须改的，只清理自己制造的垃圾 |
| 4 | Goal-Driven Execution（目标驱动执行） | 定义可验证的成功标准，循环直到通过 |

完整措辞见 [guidelines.ts](extensions/karpathy-guidelines/guidelines.ts)——它是唯一来源，system prompt 注入、`self_check` 清单、`/karma` 输出都从这里派生。

## 它做什么

- **常驻欢迎横幅（TUI）。** 启动后把四条准则速览固定在输入框上方，整个 session 可见；print/RPC 模式退回一次性通知。
- **把准则注入到每次 system prompt。** 模型在每一轮都看到它们，不只是"记得加载 skill"时才看到。
- **为大范围编辑提供可见性。** 当单次 `write` 或 `edit` 触动的行数超过阈值时，通知你具体数字（只提醒，不拦截）。一次 `edit` 调用里的多处替换会合并计算总规模。
- **过度工程时引导。** 一次 `write`/`edit` 后，统计新引入的顶层抽象（函数、类、接口、类型；嵌套声明不计入）。对两者都会先减去文件里原本就有的声明，只算净新增。如果太多，在 tool_result 顶部前置警告让模型重新考虑。
- **改动共享模块时提醒验证。** 被改的文件如果有其他源文件相对导入它，在 tool_result 顶部前置波及提示，要求收尾前跑 `tsc --noEmit` 与相关测试。
- **添加 `/karma` 斜杠命令。**
  - `/karma` —— 显示准则 + 当前配置
  - `/karma review` —— 审查 session 中最近的代码改动
  - `/karma configure` —— 显示配置路径和如何编辑
  - `/karma help` —— 显示子命令帮助
- **添加 `self_check` 工具**，让 LLM 在决策点可调用，按四条原则逐项走查清单。

## 效果预览

TUI 启动后，输入框上方常驻：

```text
── Karpathy 编码准则 ────────────────────────────────
  先想后做 / 简单优先 / 外科手术式修改 / 目标驱动执行
  /karma 详情 · /karma configure 调整阈值
```

单次 `write` 超过行数阈值时，通知长这样（文件照常写入，只提醒不拦截）：

```text
karpathy | write src/big.ts | 201 行（阈值 150） | +201/-0
```

一次改动引入过多顶层抽象时，模型会在下一轮收到（这条在界面上不可见，只给模型看）。警告前置在工具结果最前面，要求模型逐条回应：

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

## 安装

### Quick start

```bash
pi install npm:andrej-karpathy-extension
```

临时试用（不写入配置）：

```bash
pi -e npm:andrej-karpathy-extension
```

> [!IMPORTANT]
> Extension 以你的完整用户权限运行。安装第三方扩展前请先审查源码。

### 本地开发

```bash
git clone https://github.com/deerxiaohui-hash/andrej-karpathy-extension.git
cd andrej-karpathy-extension
pi -a
```

仓库已自带 `.pi/settings.json`，`-a` 会自动加载扩展。

### DSH（通过 pi2dsh）

```bash
dsh plugin add pi2dsh
dsh plugin add npm:andrej-karpathy-extension
```

然后重启 dsh。

## 配置

编辑 `~/.pi/agent/karpathy.json`，然后在 pi 里跑 `/reload`。

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `maxLinesPerEdit` | `150` | 单次 `write`/`edit` 触动的总行数上限（新增 + 删除）。超过时 tool guard 会警告 |
| `maxNewAbstractions` | `2` | 单次改动允许的净新增顶层抽象数（函数、类、接口、类型）。超过时 result watcher 会追加警告 |
| `enableToolGuard` | `true` | 是否启用大范围编辑观察者（只通知、不拦截） |
| `enableResultWatcher` | `true` | 是否启用过度工程检测 |
| `enableImpactWatcher` | `true` | 是否启用波及范围提醒（改动被引用的模块时要求验证依赖方） |
| `strictness` | `"medium"` | 同时缩放上面两个阈值：`low` ×1.5 宽松，`high` ×0.6 严格 |

示例配置：

```json
{
  "maxLinesPerEdit": 150,
  "maxNewAbstractions": 2,
  "enableToolGuard": true,
  "enableResultWatcher": true,
  "enableImpactWatcher": true,
  "strictness": "medium"
}
```

测试时可用 `KARPATHY_CONFIG` 环境变量指向别的配置文件。

检测范围是启发式的，刻意接受误报而不是打断工具调用：

- 顶层抽象识别支持 TypeScript / JavaScript / Python，其他语言暂不识别。
- 波及范围只认相对路径导入（`./`、`../`），路径别名与包名导入会被忽略。

## pi2dsh 兼容性

| Pi API | pi2dsh 状态 | 说明 |
|--------|-----------|------|
| `pi.on("before_agent_start")` | ✅ 已映射 | → `system-prompt/assemble` |
| `pi.on("tool_call")` | ✅ 已映射 | 支持阻断（本扩展为观察者模式，未使用阻断） |
| `pi.on("tool_result")` | ✅ 已映射 | 支持修改 content |
| `pi.registerTool()` | ✅ 已映射 | → DSH tool registry |
| `pi.registerCommand()` | ✅ 已映射 | → DSH commands |
| `ctx.ui.notify/confirm` | ✅ 已映射 | |
| `ctx.sessionManager.getEntries()` | ✅ 已映射 | |
| `ctx.ui.setWidget` | ⚠️ TUI 专用 | 扩展按 `ctx.mode` 守卫，DSH/print 下自动退回 notify |
| `pi.sendMessage()` | ❌ 不可用 | 已替换为 tool_result return |
| `pi.appendEntry()` | ⚠️ 3 级旁路 | 不进 DSH 原生日志 |

## 开发

```bash
npm install        # 安装依赖
npm test           # 运行全部测试
npx tsc --noEmit   # 类型检查（含测试文件）
```

测试不需要真的跑起 pi——[test-harness.ts](extensions/karpathy-guidelines/test-harness.ts)
提供假的 `ExtensionAPI` / `ExtensionContext`，直接把事件喂给 handler。

兼容性检查：

```bash
npx pi2dsh inspect npm:andrej-karpathy-extension@latest
```

## 许可证

MIT
