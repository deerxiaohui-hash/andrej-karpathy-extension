/**
 * Karpathy 的四条编码准则，蒸馏自
 * https://x.com/karpathy/status/2015883857489522876
 *
 * 使用方：
 * - system-injector.ts：追加到每次 system prompt（用 body）
 * - commands.ts：在 /karma 审查报告中渲染（用 body）
 * - self-check-tool.ts：格式化为模型的清单（用 checklist）
 * - index.ts：启动欢迎通知（用 name 括号里的短名）
 *
 * body 和 checklist 是同一原则的两个视图：body 给 system prompt（叙述式，
 * 带解释），checklist 给 self_check（可逐项勾选的祈使句）。之前
 * buildChecklistForLLM 从 body 里反推 `- ` 开头的行，会把编号列表和
 * 关键条目丢掉，所以这里显式写两份。保持本文件是唯一来源：
 * 在此处修改措辞会同步更新所有出现准则的地方。
 */

export interface Principle {
	name: string;
	tagline: string;
	body: string;
	/** self_check 清单条目，每条应当是可以独立回答“是/否”的祈使句。 */
	checklist: string[];
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
		checklist: [
			"明确陈述你的假设；不确定就先问，不要猜。",
			"存在多种理解时全部列出，不要默默选一个。",
			"有更简单的方法就说出来，该 push back 就 push back。",
			"有不清楚的地方就停下来问清楚，不要带着困惑往下写。",
		],
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
		checklist: [
			"没有加任何未请求的功能、灵活性或可配置性。",
			"没有为单次使用的代码抽抽象。",
			"没有为不可能发生的场景做错误处理。",
			"代码量已是最少：200 行能写成 50 行就重写。",
			"一个资深工程师看了不会说这过度复杂。",
		],
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
			"改动会波及别处时：",
			"- 改导出/共享符号前，先找出它的依赖方，明确说出会影响什么。",
			"- 波及面大时，先提出更小的改法或征求确认，不要默默扩大改动。",
			"",
			"当你制造的改动产生孤儿时：",
			"- 删除因**你的改动**而废弃的 import/变量/函数。",
			"- 不要删除**已有的**死代码（除非被要求）。",
			"",
			"检验标准：每一行改动都能直接追溯到用户的请求。",
		].join("\n"),
		checklist: [
			"没有\"顺手\"改进相邻的代码、注释或格式。",
			"没有重构没坏的东西。",
			"匹配已有代码风格，而不是个人偏好。",
			"发现无关死代码只提一下，没有删。",
			"改导出/共享符号前，已找出依赖方并说出会影响什么。",
			"删除了自己制造的孤儿（import/变量/函数）。",
			"没有删除改动前就存在的死代码。",
			"每一行改动都能直接追溯到用户请求。",
		],
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
			"改了共享代码后，把\"依赖方依然正常\"纳入成功标准：",
			"- 跑 `tsc --noEmit` 和相关测试，不绿不收尾。",
			"",
			"在关键决策点使用 self_check 工具，对照这四条准则验证进展。",
		].join("\n"),
		checklist: [
			"任务已转化为可验证目标（如：写无效输入的测试并让它通过）。",
			"修 bug 时先有能复现 bug 的测试。",
			"重构前后测试都通过。",
			"改了共享代码后，跑过 `tsc --noEmit` 与依赖方相关测试且全部通过。",
			"多步任务已列计划，每一步都带验证方式。",
			"在关键决策点调用了 self_check 工具。",
		],
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
 * checklist 字段显式列出，不从 body 反推：body 里的编号列表、
 * 叙述性段落也是准则的一部分，从 `- ` 行反推会把它们丢掉。
 */
export function buildChecklistForLLM(): string {
	return PRINCIPLES.map((p) => {
		const checklist = p.checklist.map((item) => `  [ ] ${item}`).join("\n");
		return `${p.name}：${p.tagline}\n${checklist}`;
	}).join("\n\n");
}

/**
 * 各原则的短名（name 里全角括号中的部分），供紧凑展示用。
 * name 里没有括号时退回完整 name，改名不会让这里崩掉。
 */
export function principleShorts(): string[] {
	return PRINCIPLES.map((p) => p.name.match(/（([^（）]+)）/)?.[1] ?? p.name);
}

/**
 * 启动欢迎通知，编辑部风排版：左锚定细线题头 + 四条短名 + 命令入口。
 * 题头不闭合右边框——CJK 双宽字符宽度不定，闭合对齐会错位，
 * 左锚定反而稳定。行首缩进两格与四条短名行对齐。
 */
export function welcomeMessage(): string {
	return [
		`── Karpathy 编码准则 ${"─".repeat(32)}`,
		`  ${principleShorts().join(" / ")}`,
		"  /karma 详情 · /karma configure 调整阈值",
	].join("\n");
}
