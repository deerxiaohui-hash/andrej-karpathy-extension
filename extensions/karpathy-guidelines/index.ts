/**
 * Karpathy 编码准则 Extension for pi.
 *
 * 以程序化方式强制执行从 Andrej Karpathy 关于 LLM 编码陷阱的观察中
 * 蒸馏出的四条编码准则：
 *   1. 先想后做
 *   2. 简单优先
 *   3. 外科手术式修改
 *   4. 目标驱动执行
 *
 * 本 Extension 的作用：
 *   - 把准则追加到每次 system prompt.
 *   - 在过大范围的 write/edit 工具调用前发出警告。
 *   - 当引入过多新的顶层抽象时引导模型重新考虑。
 *   - 提供 /karma 命令供用户审查、查看配置、重读准则。
 *   - 提供 self_check 工具让 LLM 在决策点调用。
 *
 * 无需配置即可使用。要自定义，编辑 ~/.pi/agent/karpathy.json 然后 /reload。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig, type KarpathyConfig } from "./config.js";
import { registerSystemInjector } from "./system-injector.js";
import { registerToolGuard } from "./tool-guard.js";
import { registerResultWatcher } from "./result-watcher.js";
import { registerCommands } from "./commands.js";
import { registerSelfCheckTool } from "./self-check-tool.js";
import { welcomeMessage } from "./guidelines.js";

export default function karpathyGuidelinesExtension(pi: ExtensionAPI) {
	// 在 Extension 加载时加载一次配置。配置对象在剩余生命周期内可变；
	// 如果用户编辑了 JSON 文件，可以 /reload 重新加载。
	const configRef: { current: KarpathyConfig } = { current: loadConfig() };

	// 1. 始终向每次 system prompt 注入准则。
	registerSystemInjector(pi);

	// 2. 守卫过大范围的 write/edit 操作。
	registerToolGuard(pi, configRef.current);

	// 3. 当引入过多新抽象时引导模型；改动被引用的模块时提醒验证依赖方。
	registerResultWatcher(pi, configRef.current);

	// 4. 注册 /karma 命令。configRef 是实时读取的，以便将来
	//    重新加载（如果添加 /karma reload 子命令）能生效。
	registerCommands(pi, configRef);

	// 5. 注册 self_check 工具。
	registerSelfCheckTool(pi);

	// 一次性欢迎。session_start 带上 reason "startup" 在每个进程里只触发一次，
	// 不是每次 session 恢复都触发。
	pi.on("session_start", async (event, ctx) => {
		if (event.reason !== "startup") return;
		ctx.ui.notify(welcomeMessage(), "info");
	});
}
