// @vitest-environment jsdom
// The AGENT's edits of a selection as the right-click menu offers them: a task runs at once on the selection
// measured while the menu was built, the custom entry opens the card, and nothing runs where it cannot.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentEditMenuItems } from '$lib/ai/agentEditMenu';
import { AGENT_EDIT_TASKS, type AgentEditTask } from '$lib/ai/agentEditTasks';
import { agentEditService, type AgentSelectionEditService, type PreparedAgentEdit } from '$lib/ai/agentSelectionEdit.svelte';
import type { ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { m } from '$lib/paraglide/messages';
import { toaster } from '$lib/modals/toaster-svelte';

const PREPARED: PreparedAgentEdit = {
	region: { file: '/paper/main.typ', fromLine: 1, toLine: 1, via: 'visual-selection', fromChar: 0, toChar: 5, quote: '正文内容。' },
	pmFrom: 1,
	pmTo: 6
};

type Entry = Exclude<ContextMenuItem, { separator: true }>;

/** the entry among menu items, a separator being none */
function plain(item: ContextMenuItem | undefined): Entry {
	if (!item || 'separator' in item) throw new Error('no entry where one was looked for');
	return item;
}

/** the service as the visual page registers it, doing nothing but remembering what it was asked */
function register(over: Partial<AgentSelectionEditService> = {}) {
	const asked: { run: [PreparedAgentEdit, string][]; start: DOMRect[]; prepared: number } = { run: [], start: [], prepared: 0 };
	agentEditService.current = {
		available: () => true,
		visual: () => true,
		prepare: () => {
			asked.prepared++;
			return PREPARED;
		},
		start: (anchor) => {
			asked.start.push(anchor);
			return true;
		},
		run: async (at, intent) => {
			asked.run.push([at, intent]);
			return null;
		},
		send: async () => null,
		busy: () => false,
		...over
	};
	return asked;
}

/** the menu's one entry, with the tasks under it */
function entry(): Entry & { submenu: ContextMenuItem[] } {
	const items = agentEditMenuItems(true);
	expect(items).toHaveLength(1);
	const item = plain(items[0]);
	if (!item.submenu) throw new Error('no tasks under the entry');
	return { ...item, submenu: item.submenu };
}

/** the menu's item for a task of the menu */
function itemOf(task: AgentEditTask): Entry {
	const found = entry().submenu.find((sub) => !('separator' in sub) && sub.label === task.label());
	return plain(found);
}

/** a selected word on the page, with a box of its own for the custom card to go by */
function selectAWord(): void {
	const word = document.body.appendChild(document.createElement('p'));
	word.textContent = '选中的字';
	const range = document.createRange();
	range.selectNodeContents(word);
	Range.prototype.getBoundingClientRect = () => new DOMRect(10, 10, 40, 16);
	const selection = window.getSelection()!;
	selection.removeAllRanges();
	selection.addRange(range);
}

afterEach(() => {
	agentEditService.current = null;
	window.getSelection()?.removeAllRanges();
	document.body.innerHTML = '';
	vi.restoreAllMocks();
});

describe('the AGENT’s edits in the right-click menu', () => {
	it('are one entry with the tasks under it, named as the toolbar’s button is', () => {
		register();
		const item = entry();
		expect(item.label).toBe(m.agent_edit_menu());
		expect(item.disabled).toBe(false);
		expect(item.submenu.map((sub) => ('separator' in sub ? '|' : sub.label))).toEqual([
			...AGENT_EDIT_TASKS.map((task) => task.label()),
			'|',
			m.agent_edit_custom()
		]);
	});

	it('measure the selection once, while the menu is built', () => {
		const asked = register();
		entry();
		expect(asked.prepared).toBe(1);
	});

	it('run a task at once on what was measured', async () => {
		const asked = register();
		const humanize = AGENT_EDIT_TASKS.find((task) => task.id === 'humanize')!;
		await itemOf(humanize).onclick?.();
		// measured for the menu alone: not again by the click, by then the selection is off the page
		expect(asked.prepared).toBe(1);
		expect(asked.run).toEqual([[PREPARED, humanize.ask]]);
	});

	it('say a task’s failure aloud', async () => {
		register({ run: async () => 'AGENT 会话还没就绪' });
		const error = vi.spyOn(toaster, 'error').mockImplementation(() => '');
		await itemOf(AGENT_EDIT_TASKS[0]).onclick?.();
		expect(error).toHaveBeenCalledWith({ title: 'AGENT 会话还没就绪', duration: 6000 });
	});

	it('stay in the menu with nothing selected, where no task can be run', () => {
		register({ prepare: () => null });
		const item = entry();
		expect(item.disabled).toBe(true);
		// the custom entry alone stays under it
		expect(item.submenu.filter((sub) => !('separator' in sub)).map((sub) => plain(sub).label)).toEqual([m.agent_edit_custom()]);
	});

	it('cannot be opened while the custom card is open', () => {
		register({ busy: () => true });
		expect(entry().disabled).toBe(true);
	});

	it('open the custom card on the box of the selected words', () => {
		selectAWord();
		const asked = register();
		plain(entry().submenu.at(-1)).onclick?.();
		expect(asked.start).toHaveLength(1);
		expect(asked.start[0]).toMatchObject({ left: 10, top: 10, width: 40, height: 16 });
	});

	it('are offered nowhere the AGENT cannot edit a selection', () => {
		register({ available: () => false });
		expect(agentEditMenuItems(true)).toEqual([]);
		register({ visual: () => false });
		expect(agentEditMenuItems(true)).toEqual([]);
	});
});
