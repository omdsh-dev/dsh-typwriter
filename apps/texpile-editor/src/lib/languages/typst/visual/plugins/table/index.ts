import { typstTableWrapperView, type TypstPlugin } from '$lib/languages/typst/visual/core';
import { tableDocument } from './document';
import { tableFace } from './tableFace';
import { tableKeys } from './tableKeys';
import { typstHeaderRows } from './typstHeaderRows';
import { typstTableLook } from './tableLook';
import { tableInserts } from './tableInsert';

export const table: TypstPlugin = {
	role(use) {
		const scope = use.entry?.scope;
		return (
			use.form === 'call' && use.origin === 'std' && !!scope && ['cell', 'hline', 'vline'].every((member) => Object.hasOwn(scope, member))
		);
	},
	face: (core) => tableFace(core.source, core),
	document: tableDocument,
	views: () => ({ table_wrapper: (node, view, getPos) => typstTableWrapperView(node, view, getPos as () => number) }),
	// the header rule runs first: the look reads the cells as header or body once that is settled
	editorPlugins: { atStart: tableKeys, afterTableEditing: () => [typstHeaderRows, typstTableLook] },
	insert: tableInserts
};
