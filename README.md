# Andrej-Karpathy-Extension

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-74%20passing-brightgreen.svg)](extensions/karpathy-guidelines)

一个 [pi](https://pi.dev) Extension，以程序化方式强制执行 Andrej Karpathy 的四条编码准则。兼容 [pi2dsh](https://npm.im/pi2dsh)，可在 DSH (DeepSeek Harness) 中运行。

## 目录

- [为什么需要它](#为什么需要它)
- [它做什么](#它做什么)
- [安装](#安装)
- [配置](#配置)
- [pi2dsh 兼容性](#pi2dsh-兼容性)
- [开发](#开发)
- [许可证](#许可证)

---

## 为什么需要它

你当然可以手动把四条准则贴进 system prompt。但问题是：

- **模型会"忘记"。** 长对话里，早期的 system prompt 权重会被后续 token 稀释。
- **提醒 ≠ 执行。** 模型知道原则，但不会主动检查自己是否违反了它们。
- **没有反馈环。** 模型写完 200 行代码后，不会自己说"等等，这可以写成 50 行"。

本 Extension 把准则从“希望模型记住”变成“程序化可见”：每次 tool_call 都附上规模信号，每次 tool_result 都检查产出。它提供可见性和提醒，不拦截任何工具调用——判断留给人。

## 它做什么

- **把准则注入到每次 system prompt。** 模型在每一轮都看到它们，不只是"记得加载 skill"时才看到。
- **为大范围编辑提供可见性。** 当单次 `write` 或 `edit` 触动的行数超过阈值时，通知你具体数字（只提醒，不拦截）。一次 `edit` 调用里的多处替换会合并计算总规模。
- **过度工程时引导。** 一次 `write`/`edit` 后，统计新引入的顶层抽象（函数、类、接口、类型）。对 `write` 会先减去文件里原本就有的声明，只算净新增。如果太多，在 tool_result 中追加警告让模型重新考虑。
- **改动共享模块时提醒验证。** 被改的文件如果有其他源文件相对导入它，在 tool_result 中追加波及提示，要求收尾前跑 `tsc --noEmit` 与相关测试。
- **添加 `/karma` 斜杠命令。**
  - `/karma` —— 显示准则 + 当前配置
  - `/karma review` —— 审查 session 中最近的代码改动
  - `/karma configure` —— 显示配置路径和如何编辑
- **添加 `self_check` 工具**，让 LLM 在决策点可调用，按四条原则逐项走查清单。

## 安装

### 方式 A：pi 本地加载（推荐大多数用户）

```bash
# 1. 克隆仓库
git clone https://github.com/deerxiaohui-hash/andrej-karpathy-extension.git

# 2. 进入目录
cd andrej-karpathy-extension

# 3. 用项目级配置启动 pi（-a 表示信任 .pi/settings.json）
pi -a
```

仓库已自带 `.pi/settings.json`，`-a` 会自动加载扩展。无需额外配置。

### 方式 B：通过 git URL 直接安装到全局

```bash
pi install https://github.com/deerxiaohui-hash/andrej-karpathy-extension.git -l
```

安装后所有项目可用，无需每次 `-a`。

### 方式 C：从本地克隆安装到全局

```bash
# 先克隆
git clone https://github.com/deerxiaohui-hash/andrej-karpathy-extension.git

# 再安装
pi install ./andrej-karpathy-extension/extensions/karpathy-guidelines -l
```

### 方式 D：DSH（通过 pi2dsh）

```bash
# 1. 安装 pi2dsh（如果还没装）
dsh plugin add pi2dsh

# 2. 安装本扩展
dsh plugin add npm:andrej-karpathy-extension

# 3. 重启 dsh
```

## pi2dsh 兼容性

| Pi API | pi2dsh 状态 | 说明 |
|--------|-----------|------|
| `pi.on("before_agent_start")` | ✅ 已映射 | → `system-prompt/assemble` |
| `pi.on("tool_call")` | ✅ 已映射 | 支持阻断 |
| `pi.on("tool_result")` | ✅ 已映射 | 支持修改 content |
| `pi.registerTool()` | ✅ 已映射 | → DSH tool registry |
| `pi.registerCommand()` | ✅ 已映射 | → DSH commands |
| `ctx.ui.notify/confirm` | ✅ 已映射 | |
| `ctx.sessionManager.getEntries()` | ✅ 已映射 | |
| `pi.sendMessage()` | ❌ 不可用 | 已替换为 tool_result return |
| `pi.appendEntry()` | ⚠️ 3 级旁路 | 不进 DSH 原生日志 |

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

## 开发

```bash
npm install        # 安装依赖
npm test           # 运行 74 个测试
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
