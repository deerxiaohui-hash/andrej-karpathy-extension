/**
 * 把 Karpathy 准则追加到每次 system prompt。
 *
 * 在 `before_agent_start` 上运行，所以准则能在会话第一轮以及后续每一轮
 * 都到达 LLM。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildSystemPromptSuffix } from "./guidelines.js";

/**
 * Extension 默认启用。System prompt 无条件追加；各特性的配置只影响
 * tool guard 和 result feedback，不影响模型是否看到准则文本。
 */
export function registerSystemInjector(pi: ExtensionAPI): void {
	pi.on("before_agent_start", async (event) => {
		return {
			systemPrompt: event.systemPrompt + buildSystemPromptSuffix(),
		};
	});
}
