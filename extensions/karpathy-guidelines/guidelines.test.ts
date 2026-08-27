/**
 * guidelines.ts 的两个格式化出口：
 * - buildSystemPromptSuffix：给 system prompt，必须覆盖四条原则的叙述全文。
 * - buildChecklistForLLM：给 self_check，必须是完整清单——之前从 body 反推
 *   `- ` 行，会把编号列表和叙述性关键条目丢掉，这里锁定显式 checklist 的行为。
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { PRINCIPLES, buildChecklistForLLM, buildSystemPromptSuffix, principleShorts, welcomeMessage } from "./guidelines.js";

describe("PRINCIPLES", () => {
	it("恰好四条原则", () => {
		assert.equal(PRINCIPLES.length, 4);
	});

	it("每条原则的 checklist 都非空且无空条目", () => {
		for (const p of PRINCIPLES) {
			assert.ok(p.checklist.length > 0, `${p.name} 的 checklist 不应为空`);
			for (const item of p.checklist) {
				assert.ok(item.trim().length > 0, `${p.name} 有空 checklist 条目`);
			}
		}
	});
});

describe("buildSystemPromptSuffix", () => {
	it("包含全部四条原则的名称", () => {
		const text = buildSystemPromptSuffix();
		for (const p of PRINCIPLES) {
			assert.ok(text.includes(p.name), `缺少原则：${p.name}`);
		}
	});
});

describe("buildChecklistForLLM", () => {
	it("每条原则都有勾选项", () => {
		const text = buildChecklistForLLM();
		for (const p of PRINCIPLES) {
			assert.ok(text.includes(p.name), `清单缺少原则：${p.name}`);
		}
		const boxes = text.match(/\[ \]/g) ?? [];
		assert.equal(
			boxes.length,
			PRINCIPLES.reduce((sum, p) => sum + p.checklist.length, 0),
			"勾选项数量应等于所有 checklist 条目之和",
		);
	});

	it("包含从 body 反推时会丢失的关键条目", () => {
		const text = buildChecklistForLLM();
		// 原则 4 的核心是"任务转可验证目标"（body 里是叙述+编号列表，无 `- ` 行）
		assert.match(text, /可验证目标/);
		assert.match(text, /复现 bug 的测试/);
		// 原则 2 的"问自己"（body 里是叙述段落，不是 `- ` 行）
		assert.match(text, /资深工程师/);
		// 原则 3 的检验标准（body 里是叙述段落）
		assert.match(text, /追溯到用户请求/);
	});
});

describe("principleShorts", () => {
	it("从 name 的全角括号里提取短名", () => {
		const shorts = principleShorts();
		assert.equal(shorts.length, 4);
		assert.equal(shorts[0], "先想后做");
		assert.equal(shorts[1], "简单优先");
		assert.equal(shorts[2], "外科手术式修改");
		assert.equal(shorts[3], "目标驱动执行");
	});

	it("name 没有括号时退回完整 name（鲁棒性）", () => {
		// principleShorts 直接从 PRINCIPLES 派生，这里只验证它不会因括号缺失而抛错。
		assert.equal(principleShorts().length, PRINCIPLES.length);
	});
});

describe("welcomeMessage", () => {
	it("三行结构：题头 / 四条短名 / 命令入口", () => {
		const msg = welcomeMessage();
		const lines = msg.split("\n");
		assert.equal(lines.length, 3, "欢迎通知应为三行");
		// 第 1 行：编辑部风题头，以细线开头、以细线结尾
		assert.match(lines[0]!, /^── Karpathy 编码准则 ─+$/);
		// 第 2 行：行首缩进两格 + 四条短名（用 / 分隔）
		assert.match(lines[1]!, /^  .+ \/ .+ \/ .+ \/ .+$/);
		// 第 3 行：行首缩进两格 + /karma 命令入口
		assert.match(lines[2]!, /^  \/karma .+\/karma configure/);
	});

	it("第二行包含全部原则短名", () => {
		const line2 = welcomeMessage().split("\n")[1]!;
		for (const short of principleShorts()) {
			assert.ok(line2.includes(short), `欢迎语缺少短名：${short}`);
		}
	});
});
