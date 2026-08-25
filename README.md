# Andrej-Karpathy-Extension

一个 [pi](https://pi.dev) Extension，以程序化方式强制执行 Andrej Karpathy 的四条编码准则。兼容 [pi2dsh](https://npm.im/pi2dsh)，可在 DSH (DeepSeek Harness) 中运行：

1. **先想后做** —— 不假设；不确定就问
2. **简单优先** —— 最少的代码，不做推测性设计
3. **外科手术式修改** —— 只改你必须改的
4. **目标驱动执行** —— 定义成功标准，循环直到验证通过

## 它做什么

- **把准则注入到每次 system prompt。** 模型在每一轮都看到它们，不只是"记得加载 skill"时才看到。
- **在大范围编辑前警告。** 当单次 `write` 或 `edit` 触动的行数超过你的阈值时，请确认。一次 `edit` 调用里的多处替换会合并计算总规模。
- **过度工程时引导。** 一次 `write`/`edit` 后，统计新引入的顶层抽象（函数、类、接口、类型）。对 `write` 会先减去文件里原本就有的声明，只算净新增。如果太多，在 tool_result 中追加警告让模型重新考虑。
- **添加 `/karma` 斜杠命令。**
  - `/karma` —— 显示准则 + 当前配置
  - `/karma review` —— 审查 session 中最近的代码改动
  - `/karma configure` —— 显示配置路径和如何编辑
- **添加 `self_check` 工具**，让 LLM 在决策点可调用，按四条原则逐项走查清单。

## 在 pi 中安装

```bash
# 本地：克隆后按路径加载
git clone <本仓库>
pi -e ./extensions/karpathy-guidelines/index.ts

# 或者：把路径加到 settings.json 的 packages 数组里。
pi install ./extensions/karpathy-guidelines -l
```

本仓库已经带了 `.pi/settings.json`，在仓库目录里跑 `pi -a` 就会自动加载（`-a` 表示信任项目级配置文件；注意 `packages` 里的相对路径是相对 `.pi/` 解析的）。

## 在 DSH 中安装（通过 pi2dsh）

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

编辑 `~/.pi/agent/karpathy.json`，然后在 pi 里跑 `/reload`：

```json
{
  "maxLinesPerEdit": 150,
  "maxNewAbstractions": 2,
  "enableToolGuard": true,
  "enableResultWatcher": true,
  "strictness": "medium"
}
```

`strictness` 会同时缩放两个阈值：`low` 宽松 1.5 倍，`high` 严格到 0.6 倍。

测试时可以用 `KARPATHY_CONFIG` 环境变量指向别的配置文件。

## 开发

```bash
npm install
npm test           # analysis + config 辅助函数的单元测试
npx tsc --noEmit   # 类型检查
npx pi2dsh inspect npm:andrej-karpathy-extension@latest  # 兼容性检查
```

## 许可证

MIT
