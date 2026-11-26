// The AGENT's edits of a selection as a submenu of the editor's right-click menu, where DSH-better-sidebar's
// selection menu has its rewrites: a task runs at once, and the custom entry opens the card to write one.
import { Pencil, Sparkles } from '@lucide/svelte';
import type { ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { m } from '$lib/paraglide/messages';
import { toaster } from '$lib/modals/toaster-svelte';
import { AGENT_EDIT_TASKS, type AgentEditTask } from './agentEditTasks';
import { agentEditService, type PreparedAgentEdit } from './agentSelectionEdit.svelte';

/** the selected text's box, which is where the custom card goes when no toolbar button asked for it */
function selectionRect(): DOMRect | null {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
	const box = sel.getRangeAt(0).getBoundingClientRect();
	return box.width || box.height ? box : null;
}

/** the selection handed to the AGENT with a menu's task on it; its failure is said aloud */
async function run(prepared: PreparedAgentEdit, task: AgentEditTask): Promise<void> {
	const error = await agentEditService.current?.run(prepared, task.ask);
	if (error) toaster.error({ title: error, duration: 6000 });
}

/** none where the AGENT cannot edit a selection here; elsewhere one item with the tasks under it */
export function agentEditMenuItems(hasSelection: boolean): ContextMenuItem[] {
	const service = agentEditService.current;
	if (!service?.available() || !service.visual()) return [];
	// measured while the menu is built, because clicking an item takes the selection off the page
	const prepared = hasSelection ? service.prepare() : null;
	const at = selectionRect();
	const tasks: ContextMenuItem[] = prepared
		? AGENT_EDIT_TASKS.map((task) => ({ label: task.label(), icon: task.icon, onclick: () => void run(prepared, task) }))
		: [];
	return [
		{
			label: m.agent_edit_menu(),
			icon: Sparkles,
			disabled: !prepared || service.busy(),
			submenu: [
				...tasks,
				{ separator: true },
				{
					label: m.agent_edit_custom(),
					icon: Pencil,
					onclick: () => {
						if (!at || !agentEditService.current?.start(at)) toaster.warning({ title: m.agent_edit_no_span(), duration: 5000 });
					}
				}
			]
		}
	];
}
