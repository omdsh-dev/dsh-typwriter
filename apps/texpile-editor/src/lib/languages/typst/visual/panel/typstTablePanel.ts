// What the Typst sections of the table settings panel edit. The table is looked up fresh for every
// edit: each one replaces the node, so a position held from before would point at a stale table.
import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

export type TableAt = { node: PMNode; pos: number };

export function tableAt(view: EditorView, tablePos: () => number | null): TableAt | null {
	const pos = tablePos();
	if (pos == null) return null;
	const node = view.state.doc.nodeAt(pos);
	return node && node.type.name === 'table' ? { node, pos } : null;
}

/**
 * Apply one edit to the table. The edit returns null when it could not be made, which so far only
 * happens to a width: it is read off the screen, and a table that is not laid out has none.
 */
export function editTable(
	view: EditorView,
	tablePos: () => number | null,
	edit: (tr: Transaction, at: TableAt) => Transaction | null
): void {
	const at = tableAt(view, tablePos);
	if (!at) return;
	const tr = edit(view.state.tr, at);
	if (!tr) {
		toaster.info({ title: m.ttable_width_failed(), duration: 3000 });
		return;
	}
	view.dispatch(tr);
	view.focus();
}
