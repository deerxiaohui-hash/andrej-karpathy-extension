# pi2dsh 兼容性

> 本扩展只使用 pi2dsh 已映射的 Pi API 子集，在 DSH (DeepSeek Harness) 中可完整运行。
> This extension only uses Pi APIs that pi2dsh maps, and runs fully under DSH.

## API 映射表

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

## 备注

- **欢迎横幅**依赖 `ctx.ui.setWidget`，仅在 TUI 模式渲染；DSH / print / RPC 模式下自动退回一次性 `notify` 通知。
- **更新检查提示**通过 `pi.sendMessage()` 注入聊天区，而 pi2dsh 未映射该 API，因此 DSH 下不会出现更新提示（不影响其他功能）。
