// 「划选 → AGENT 按输入提示修改」：选区按钮、输入卡和圈选 AGENT 链路之间的胶水。
// 选区到源码行范围的换算放在 workspaceAgentEdit（需要当前文档/视图），这里只存卡片状态。
import { box } from '$lib/runes/box.svelte';
import type { RegionPayload } from '$lib/languages/typst/preview/agentCanvas/agentCanvasTurn';

import type { AgentRegionRect } from './agentRegion.svelte';

export type AgentEditCardState = {
	/** 按钮的屏幕矩形：卡片放在它旁边 */
	anchor: DOMRect;
	/** 已换算好的行范围；发送时直接复用圈选的 sendRegionEdit */
	region: RegionPayload;
	/** 选中的源码片段（卡片里给一眼确认） */
	snippet: string;
	/** 选区在屏幕上的外接矩形（待修改区域动效用） */
	rect: AgentRegionRect;
	/** 可视化编辑器里的 PM 位置：源码 offset ≠ PM pos，装饰器要用这一对 */
	pmFrom: number;
	pmTo: number;
};

/** 选区按 AGENT 要的样子：文件里的范围，以及它在可视化编辑器里的位置 */
export type PreparedAgentEdit = {
	region: RegionPayload;
	pmFrom: number;
	pmTo: number;
};

export type AgentSelectionEditService = {
	/** 当前文档能不能用（Typst 可视化、非 guest、有 AGENT 桥） */
	available(): boolean;
	/** 可视化页是否在前面：右键菜单里的入口只在它上面给出 */
	visual(): boolean;
	/** 把当前选区换算好；null = 没有选区，或映射不到源码。在菜单建好时就量：点菜单项会把页面上的选区拿掉 */
	prepare(): PreparedAgentEdit | null;
	/** 从当前选区生成行范围并打开输入卡；false = 选区映射失败 */
	start(anchor: DOMRect): boolean;
	/** 把菜单里的一项任务直接交给 AGENT，用在 prepare 量好的选区上；失败返回错误文本 */
	run(prepared: PreparedAgentEdit, intent: string): Promise<string | null>;
	/** 把用户写的提示交给 AGENT；失败返回错误文本 */
	send(prompt: string): Promise<string | null>;
	busy(): boolean;
};

export const agentEditCard = box<AgentEditCardState | null>(null);
export const agentEditService = box<AgentSelectionEditService | null>(null);

export function closeAgentEditCard(): void {
	agentEditCard.current = null;
}
