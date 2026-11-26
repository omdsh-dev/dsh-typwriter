// What the right-click menu offers the AGENT to do with a selection, each in one sentence. The set and the
// sentences are DSH-better-sidebar's selection menu (expand, humanize, shorten, continue, and its rewrite as
// polish; MIT License, Copyright (c) 2026 dsh-external), said in Chinese as the region prompt is, with what a
// paper adds: nothing invented, and the passage's language kept. The rules every task shares are in the region
// prompt (languages/typst/preview/agentCanvas/agentCanvasTurn.ts).
import type { Component } from 'svelte';
import { ArrowDownToLine, FoldVertical, PenLine, UnfoldVertical, WandSparkles } from '@lucide/svelte';
import { m } from '$lib/paraglide/messages';

export type AgentEditTask = {
	id: string;
	label: () => string;
	icon: Component<{ class?: string }>;
	/** the task, in the agent's words */
	ask: string;
};

/** in the order DSH-better-sidebar's menu has, polish first as the one asked for most */
export const AGENT_EDIT_TASKS: AgentEditTask[] = [
	{
		id: 'polish',
		label: m.agent_edit_polish,
		icon: PenLine,
		ask: '润色这段文字：用原文的语言把意思说得更清楚、更通顺，更符合学术论文的规范表达。保持原意和篇幅，只改措辞、语序和句子结构，不新增事实、数据或引用。'
	},
	{
		id: 'humanize',
		label: m.agent_edit_humanize,
		icon: WandSparkles,
		ask: '去掉这段文字的 AI 腔：用原文的语言、以自然、具体、直接的表达重写，让它读起来像有经验的研究者亲手写成的学术文章。去掉空泛、公式化的说法，例如为凑结构而加的总起句和总结句、成串的排比、“值得注意的是”“综上所述”“不仅……而且……”这类套话的堆砌、空洞的宏大评价、句句等长的节奏、多余的强调词和破折号插入语；句子长短自然起伏，能用平实的话就不用华丽的词。意思、事实、数据、术语和结论保持不变，语气不变，不新增任何论断或引用。'
	},
	{
		id: 'expand',
		label: m.agent_edit_expand,
		icon: UnfoldVertical,
		ask: '扩写这段文字：结合上下文补充有用的细节、解释或论证，使论述更充分、更连贯。只能依据选中和上下文已有的信息展开，不编造事实、数据或引用。'
	},
	{
		id: 'shorten',
		label: m.agent_edit_shorten,
		icon: FoldVertical,
		ask: '缩短这段文字：删去冗余、重复和空话，保留所有重要的事实和原意。'
	},
	{
		id: 'continue',
		label: m.agent_edit_continue,
		icon: ArrowDownToLine,
		ask: '续写：选中原文一字不动，紧接在它后面自然地写下去，延续上下文的思路、术语和文体。不编造事实、数据或引用。'
	}
];
