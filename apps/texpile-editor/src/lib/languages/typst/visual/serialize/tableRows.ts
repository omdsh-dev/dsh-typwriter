// a typst header is whole rows: a row holding a header cell, or reached by a merged one from above, is header
// all the way across, as typst lays it out. Table edits can leave a row half header (a column added beside a
// header row, a header cell merged down), and this makes the whole row one or the other.
// Shared by the table plugin and the table's settings, so it lives outside the plugin folder.
import type { Node } from 'prosemirror-model';

/** which rows of `table` typst counts as header */
export function headerRows(table: Node): Set<number> {
	const rows: Node[] = [];
	table.forEach((row) => rows.push(row));
	const header = new Set<number>();
	rows.forEach((row, i) => row.forEach((cell) => cell.type.name === 'table_header' && header.add(i)));
	// a merged header cell takes the rows it reaches into the header; a merged body cell keeps the rows it
	// reaches out of one (typst moves such a header down instead)
	for (let i = 0; i < rows.length; i++) {
		const isHeader = header.has(i);
		rows[i].forEach((cell) => {
			for (let d = 1; d < Number(cell.attrs.rowspan ?? 1) && i + d < rows.length; d++) {
				if (isHeader) header.add(i + d);
				else header.delete(i + d);
			}
		});
	}
	return header;
}
