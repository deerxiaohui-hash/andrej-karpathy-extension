/**
 * 加载和保存 Extension 的运行时配置。
 * 默认位于 ~/.pi/agent/karpathy.json，可通过 KARPATHY_CONFIG 环境变量覆盖。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Strictness = "low" | "medium" | "high";

export interface KarpathyConfig {
	/** 单次 write/edit 触发“过大范围”警告的行数阈值。 */
	maxLinesPerEdit: number;
	/** 单次改动允许的新增顶层抽象（函数/类/接口/类型）的最大数量。 */
	maxNewAbstractions: number;
	/** tool_call 守卫是否启用。 */
	enableToolGuard: boolean;
	/** tool_result 监听器是否在过度工程时追加警告。 */
	enableResultWatcher: boolean;
	/** 警告的严格程度。越高 = 越早告警。 */
	strictness: Strictness;
}

export const DEFAULT_CONFIG: KarpathyConfig = {
	maxLinesPerEdit: 150,
	maxNewAbstractions: 2,
	enableToolGuard: true,
	enableResultWatcher: true,
	strictness: "medium",
};

const STRICTNESS_MULTIPLIER: Record<Strictness, number> = {
	low: 1.5,
	medium: 1.0,
	high: 0.6,
};

/**
 * 把严格度应用到数值阈值上，避免在 handler 里重复计算。
 */
export function effectiveThresholds(config: KarpathyConfig): { maxLines: number; maxAbs: number } {
	const mult = STRICTNESS_MULTIPLIER[config.strictness];
	return {
		maxLines: Math.round(config.maxLinesPerEdit * mult),
		maxAbs: Math.max(1, Math.round(config.maxNewAbstractions * mult)),
	};
}

function configPath(): string {
	if (process.env.KARPATHY_CONFIG) return process.env.KARPATHY_CONFIG;
	const home = process.env.HOME ?? process.env.USERPROFILE ?? "~";
	return join(home, ".pi", "agent", "karpathy.json");
}

export function loadConfig(): KarpathyConfig {
	const path = configPath();
	if (!existsSync(path)) {
		return { ...DEFAULT_CONFIG };
	}
	try {
		const raw = readFileSync(path, "utf-8");
		const parsed = JSON.parse(raw);
		return { ...DEFAULT_CONFIG, ...parsed };
	} catch {
		// 配置损坏不应让 Extension 崩溃；回退到默认值。
		return { ...DEFAULT_CONFIG };
	}
}

export function saveConfig(config: KarpathyConfig): void {
	const path = configPath();
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
