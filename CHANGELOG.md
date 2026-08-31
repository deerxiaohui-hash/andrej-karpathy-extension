# 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.3.0] - 2026-08-31

### 新增

- 启动时异步检查 npm 新版本，有更新时在聊天区注入一次性提示（`update-checker`）。
- README 重构：新增英文版（`readme.en.md`），中英文顶部可互相切换；pi2dsh 兼容表下沉至 [docs/pi2dsh.md](docs/pi2dsh.md)；新增 CHANGELOG。

### 变更

- 欢迎横幅重构为三行简洁格式：细线题头 + 四条原则短名（`/` 分隔）+ 命令入口。

## [0.2.1] - 2026-08-31

- 维护性发布（无对应 git tag，变更内容未归档）。

## [0.2.0] - 2026-08-30

### 新增

- 影响观察器（`enableImpactWatcher`）：改动被相对导入的共享模块时，前置波及提醒，要求验证依赖方。

### 变更

- tool guard 降级为纯观察者：大范围编辑只通知、不拦截。
- 警告改为前置到 tool_result 顶部，过度工程检测能力完善（净新增顶层抽象统计）。

## [0.1.0] - 2026-08-28

### 新增

- 首次发布：四条准则的 system prompt 注入、常驻欢迎横幅、大范围编辑提醒、过度工程警告、`/karma` 斜杠命令、`self_check` 工具。
