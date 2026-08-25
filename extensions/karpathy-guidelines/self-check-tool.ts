/**
 * 注册一个 `self_check` 工具，让 LLM 在决策点调用。
 *
 * 从 LLM 的视角使用：在非平凡改动之前/之后，调用
 *   self_check({ context: "刚刚为一个新的抽象层加了 X" })
 * 并在下一条回复中逐项走查返回的清单。
 */

import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildChecklistForLLM } from "./guidelines.js";

const SelfCheckParams = Type.Object({
	context: Type.Optional(
		Type.String({
			description:
				"你打算做（或者刚刚做完）的事。请具体。例子：'为 auth provider 加一个新的抽象基类'。",
		}),
	),
	step: Type.Optional(
		Type.String({
			description:
				"可选的步骤标签。例子：'第 2 步/共 5 步：实现重试逻辑'。帮用户追踪当前是哪一步。",
		}),
	),
});

export function registerSelfCheckTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "self_check",
		label: "Self-Check",
		description:
			"在决策点运行 Karpathy 准则自检。在非平凡改动之前使用（尤其是：新增抽象、重构、做大范围编辑时）。传入一个简短的描述说明你打算做什么。",
		parameters: SelfCheckParams,

		async execute(_toolCallId, params) {
			const context = (params.context as string | undefined) ?? "";
			const step = (params.step as string | undefined) ?? "";

			const header = step ? `[${step}] ` : "";
			const contextBlock = context
				? `\n上下文：${header}${context}\n`
				: `\n上下文：（未提供）\n`;

			const checklist = buildChecklistForLLM();

			const instructions = [
				"",
				"逐项走查上面每个未勾选项。在下一条消息中回答：",
				"  - 通过、失败、或不适用",
				"  - 一句话解释原因",
				"",
				"如果任何一项失败，不要继续。要么调整你的计划以满足它，要么",
				"请用户确认他们希望你无论如何继续。",
				"",
				"不要跳过这一步。self_check 的全部意义在于让推理过程可见。",
			].join("\n");

			return {
				content: [
					{
						type: "text",
						text: `Karpathy 自检${contextBlock}\n${checklist}\n${instructions}`,
					},
				],
				details: { context, step },
			};
		},
	});
}
