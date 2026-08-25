/**
 * Karpathy 的四条编码准则，蒸馏自
 * https://x.com/karpathy/status/2015883857489522876
 *
 * 使用方：
 * - system-injector.ts：追加到每次 system prompt
 * - commands.ts：在 /karma 审查报告中渲染
 * - self-check-tool.ts：格式化为模型的清单
 *
 * 保持本文件是唯一来源。在此处修改措辞会同步更新所有出现准则的地方。
 */

export interface Principle {
	name: string;
	tagline: string;
	body: string;
}

export const PRINCIPLES: Principle[] = [
	{
		name: "1. Think Before Coding（先想后做）",
		tagline: "不要假设，不要隐藏困惑，要展现权衡。",
		body: [
			"开始实现之前：",
			"- 明确陈述你的假设。如果不确定，先问。",
			"- 如果存在多种理解，把它们都列出来——不要默默选一个。",
			"- 如果存在更简单的方法，说出来。该 push back 就 push back。",
			"- 如果某件事不清楚，就停下来。说清楚哪里不清楚，然后问。",
		].join("\n"),
	},
	{
		name: "2. Simplicity First（简单优先）",
		tagline: "用最少的代码解决问题，不搞推测性代码。",
		body: [
			"- 不加未请求的功能。",
			"- 单次使用的代码不抽抽象。",
			"- 不加未请求的\"灵活性\"或\"可配置性\"。",
			"- 不可能发生的场景不做错误处理。",
			"- 如果你写了 200 行、但其实 50 行就能搞定——重写。",
			"",
			"问自己：\"一个资深工程师看了会说这过度复杂了吗？\"如果是，简化。",
		].join("\n"),
	},
	{
		name: "3. Surgical Changes（外科手术式修改）",
		tagline: "只改你必须改的，只清理你自己制造的垃圾。",
		body: [
			"修改已有代码时：",
			"- 不要\"顺手\"改进相邻代码、注释、格式。",
			"- 没坏的东西不要重构。",
			"- 匹配已有风格，即使你本人会写得不一样。",
			"- 发现无关的死代码——提一下，但别删。",
			"",
			"当你制造的改动产生孤儿时：",
			"- 删除因**你的改动**而废弃的 import/变量/函数。",
			"- 不要删除**已有的**死代码（除非被要求）。",
			"",
			"检验标准：每一行改动都能直接追溯到用户的请求。",
		].join("\n"),
	},
	{
		name: "4. Goal-Driven Execution（目标驱动执行）",
		tagline: "定义成功标准，循环直到验证通过。",
		body: [
			"把命令式任务转化为可验证的目标：",
			"- \"加校验\" -> \"写无效输入的测试，然后让它们通过\"",
			"- \"修 bug\" -> \"写一个能复现 bug 的测试，然后让它通过\"",
			"- \"重构 X\" -> \"确保重构前后测试都通过\"",
			"",
			"对于多步任务，先列计划：",
			"1. [步骤] -> 验证：[检查方式]",
			"2. [步骤] -> 验证：[检查方式]",
			"3. [步骤] -> 验证：[检查方式]",
			"",
			"明确的目标让模型能独立循环。模糊的目标（\"让它工作\"）需要不断澄清。",
			"",
			"在关键决策点使用 self_check 工具，对照这四条准则验证进展。",
		].join("\n"),
	},
];

/**
 * 追加到每次 system prompt 的完整文本。保持为单个字符串，
 * 这样 before_agent_start 一次拼接就能追加完。
 */
export function buildSystemPromptSuffix(): string {
	const sections = PRINCIPLES.map((p) => `### ${p.name}：${p.tagline}\n${p.body}`).join("\n\n");

	return `

## Karpathy 编码准则

你必须在每个任务中遵循以下四条原则。它们是不可妥协的行为准则，不是建议。

${sections}

**你怎么知道这些在起作用：** diff 里不必要的改动变少；因为过度复杂而重写的情况变少；澄清问题出现在动手之前，而不是犯错之后。
`;
}

/**
 * 同样的内容，格式化为 self_check 工具的清单。
 */
export function buildChecklistForLLM(): string {
	return PRINCIPLES.map((p) => {
		const checklist = p.body
			.split("\n")
			.filter((line) => line.trim().startsWith("- "))
			.map((line) => `  [ ] ${line.replace(/^-\s+/, "")}`)
			.join("\n");
		return `${p.name}：${p.tagline}\n${checklist}`;
	}).join("\n\n");
}
