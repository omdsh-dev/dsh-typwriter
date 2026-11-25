// every row of a typst table is header or body all the way across, as typst lays it out. Table edits
// can leave a row half header (a column added beside a header row, a header cell merged down), and
// this plugin makes the whole row one or the other. The rule itself is shared, and lives in the core.
import { Plugin } from 'prosemirror-state';
import { headerRows } from '$lib/languages/typst/visual/core/document';

export { headerRows };

export const typstHeaderRows = new Plugin({
	appendTransaction(trs, _old, state) {
		if (!trs.some((tr) => tr.docChanged)) return null;
		const { table_header, table_cell } = state.schema.nodes;
		const tr = state.tr;
		state.doc.descendants((node, pos) => {
			if (node.type.name !== 'table') return true;
			const header = headerRows(node);
			let rowPos = pos + 1;
			let i = 0;
			node.forEach((row) => {
				const type = header.has(i) ? table_header : table_cell;
				let cellPos = rowPos + 1;
				row.forEach((cell) => {
					if (cell.type !== type) tr.setNodeMarkup(cellPos, type, cell.attrs);
					cellPos += cell.nodeSize;
				});
				rowPos += row.nodeSize;
				i++;
			});
			return false;
		});
		return tr.docChanged ? tr : null;
	}
});
