// The looks of a Typst table, as the editor now sets and draws them: a row's height, a table narrower
// than the line, the three rules of a three-line table, column and cell alignment, and what the
// editable table shows for each of them. Pure on the document: a transaction in, the source out.
import { describe, it, expect } from 'vitest';
import { CellSelection } from 'prosemirror-tables';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { Fragment, type Node } from 'prosemirror-model';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import {
	distribute,
	parseTrack,
	parseTracks,
	pctOnlyRatio,
	toPercentTracks,
	tracksWidth
} from '$lib/languages/typst/visual/serialize/tracks';
import {
	allLinesTr,
	argText,
	cellAlignTr,
	columnAlignTr,
	columnAligns,
	noBorderTr,
	rowHeightTr,
	tableArgTr,
	threeLineTr,
	withArg
} from '$lib/languages/typst/visual/serialize/tableFormatting';
import { tableLook, tableLookDecorations } from '$lib/languages/typst/visual/plugins/table/tableLook';

const PLAIN = '#table(\n  columns: 2,\n  [a], [b],\n  [c], [d],\n)';
const HEADED = '#table(\n  columns: 2,\n  table.header([a], [b]),\n  [c], [d],\n)';
const TALL = '#table(\n  columns: 2,\n  [a], [b],\n  table.row(height: 1.5em, [c], [d]),\n)';
const NARROW = '#table(\n  columns: (30%, 30%),\n  [a], [b],\n)';

function docOf(src: string): Node {
	return typstToProseMirror(src).doc;
}
function tableOf(doc: Node): { node: Node; pos: number } {
	let found: { node: Node; pos: number } | null = null;
	doc.descendants((node, pos) => {
		if (node.type.name !== 'table') return true;
		found = { node, pos };
		return false;
	});
	if (!found) throw new Error('no table in the document');
	return found;
}
function stateOf(doc: Node): EditorState {
	return EditorState.create({ schema: doc.type.schema, doc });
}
/** the source after an edit, read off the document the transaction leaves behind */
function edited(src: string, edit: (tr: Transaction, at: { node: Node; pos: number }) => unknown): string {
	const doc = docOf(src);
	const tr = stateOf(doc).tr;
	edit(tr, tableOf(doc));
	return serializeToTypst(tr.doc).trimEnd();
}
/** the file as the editor writes it back untouched */
function saved(src: string): string {
	const parsed = parseTypstFile(src);
	return serializeTypstFile(parsed, parsed.doc).trimEnd();
}
/** the state the editor is in after a drag: every column carries a measured width */
function resized(table: Node, widths: number[]): Node {
	const rows: Node[] = [];
	table.forEach((row) => {
		const cells: Node[] = [];
		row.forEach((cell, _offset, c) => cells.push(cell.type.create({ ...cell.attrs, colwidth: [widths[c]] }, cell.content, cell.marks)));
		rows.push(row.copy(Fragment.fromArray(cells)));
	});
	return table.copy(Fragment.fromArray(rows));
}

describe('percentage tracks', () => {
	it('a track can be a share of the line', () => {
		expect(parseTrack('30%')).toEqual({ kind: 'pct', value: 30 });
		expect(parseTracks('(30%, auto, 1fr)', 3)?.map((t) => t.kind)).toEqual(['pct', 'auto', 'fr']);
	});

	it('takes its share of the container, and nothing more', () => {
		expect(
			distribute(
				[
					{ kind: 'pct', value: 30 },
					{ kind: 'pct', value: 30 }
				],
				600
			)
		).toEqual([180, 180]);
		// the last one absorbs the rounding, so the table is never a pixel wider than it says
		expect(
			distribute(
				[
					{ kind: 'pct', value: 33.3 },
					{ kind: 'pct', value: 33.3 },
					{ kind: 'pct', value: 33.4 }
				],
				601
			)
		).toEqual([200, 200, 201]);
	});

	it('leaves what is left to the fr tracks', () => {
		expect(
			distribute(
				[
					{ kind: 'pct', value: 40 },
					{ kind: 'fr', value: 1 },
					{ kind: 'fr', value: 1 }
				],
				500
			)
		).toEqual([200, 150, 150]);
	});

	it('an absolute track keeps its own width beside percentages', () => {
		expect(
			distribute(
				[
					{ kind: 'abs', px: 100 },
					{ kind: 'pct', value: 50 }
				],
				400
			)
		).toEqual([100, 200]);
	});

	it('says how wide a list makes the table, or that the content decides', () => {
		expect(
			tracksWidth(
				[
					{ kind: 'pct', value: 30 },
					{ kind: 'pct', value: 30 }
				],
				600
			)
		).toBe(360);
		expect(tracksWidth([{ kind: 'fr', value: 1 }], 600)).toBe(600);
		expect(tracksWidth([{ kind: 'auto' }, { kind: 'pct', value: 30 }], 600)).toBeNull();
		expect(
			pctOnlyRatio([
				{ kind: 'pct', value: 30 },
				{ kind: 'pct', value: 30 }
			])
		).toBe(0.6);
		expect(
			pctOnlyRatio([
				{ kind: 'pct', value: 30 },
				{ kind: 'fr', value: 1 }
			])
		).toBeNull();
	});

	it('widths become percentages that keep their proportions and the table narrow', () => {
		expect(toPercentTracks([240, 120], 0.6)).toBe('(40%, 20%)');
		expect(toPercentTracks([120, null, 120], 0.6)).toBe('(30%, auto, 30%)');
		expect(toPercentTracks([120], 1.5)).toBeNull();
	});
});

describe('a table narrower than the line', () => {
	it('is left as it was', () => {
		expect(saved(NARROW)).toBe(NARROW);
	});

	it('stays narrow when a column is dragged: percentages, not fr', () => {
		const out = edited(NARROW, (tr, at) => {
			tr.replaceWith(at.pos, at.pos + at.node.nodeSize, resized(at.node, [240, 120]));
		});
		expect(out).toContain('columns: (40%, 20%),');
	});

	it('a full-width table still writes fr after a drag', () => {
		const out = edited('#table(\n  columns: (1fr, 1fr),\n  [a], [b],\n)', (tr, at) => {
			tr.replaceWith(at.pos, at.pos + at.node.nodeSize, resized(at.node, [270, 90]));
		});
		// shares snap to quarter-fr steps, so the source is a layout and not a mouse position
		expect(out).toContain('columns: (1.5fr, 0.5fr),');
	});
});

describe('the height of a row', () => {
	it('a table.row opens in the editor, height and all', () => {
		const { node } = tableOf(docOf(TALL));
		expect(node.childCount).toBe(2);
		expect(node.child(1).attrs.typRowHeight).toBe('1.5em');
		expect(node.child(1).childCount).toBe(2);
	});

	it('comes back as it was written', () => {
		expect(saved(TALL)).toBe(TALL);
	});

	it('is set on a row that had none', () => {
		const out = edited(PLAIN, (tr, at) => rowHeightTr(tr, at.pos + 1 + at.node.child(0).nodeSize, at.node.child(1), '2em'));
		expect(out).toContain('table.row(height: 2em, [c], [d]),');
		expect(out).not.toContain('table.row(height: 2em, [a]');
	});

	it('is taken away again', () => {
		const out = edited(TALL, (tr, at) => rowHeightTr(tr, at.pos + 1 + at.node.child(0).nodeSize, at.node.child(1), ''));
		expect(out).toBe(PLAIN);
	});

	it('shows on the row in the editor', () => {
		const doc = docOf(TALL);
		const decos = tableLookDecorations(doc);
		const { node, pos } = tableOf(doc);
		const rowPos = pos + 1 + node.child(0).nodeSize;
		const styles = decos
			.find(rowPos, rowPos + node.child(1).nodeSize)
			.map((deco) => String(deco.spec.style ?? ''))
			.filter((style) => style.startsWith('height'));
		expect(styles).toEqual(['height: 1.5em']);
	});
});

describe('the lines of a table', () => {
	it('a three-line table: thick, thin, thick, and no other line', () => {
		const out = edited(HEADED, (tr, at) => threeLineTr(tr, at.pos, at.node));
		expect(out).toBe(
			[
				'#table(',
				'  columns: 2,',
				'  stroke: none,',
				'  table.hline(stroke: 1.5pt),',
				'  table.header([a], [b]),',
				'  table.hline(stroke: 0.75pt),',
				'  [c], [d],',
				'  table.hline(stroke: 1.5pt),',
				')'
			].join('\n')
		);
		// and it reads back as the same table: the lines are rules before and after rows
		expect(saved(out)).toBe(out);
	});

	it('a table without a header gets its thin line under the first row', () => {
		const out = edited(PLAIN, (tr, at) => threeLineTr(tr, at.pos, at.node));
		expect(out).toContain('table.hline(stroke: 1.5pt),\n  [a], [b],\n  table.hline(stroke: 0.75pt),\n  [c], [d],');
	});

	it('is drawn in the editor: top and head rules on the header, the bottom one on the last row', () => {
		const out = edited(HEADED, (tr, at) => threeLineTr(tr, at.pos, at.node));
		const styles = cellStyles(docOf(out));
		expect(styles[0]).toBe('border-style: none; border-top: 1.5pt solid black; border-bottom: 0.75pt solid black');
		// the body's top edge is the head rule, its bottom the last one
		expect(styles[2]).toBe('border-style: none; border-top: 0.75pt solid black; border-bottom: 1.5pt solid black');
	});

	it('the grid comes back, with no rule left over', () => {
		const three = edited(HEADED, (tr, at) => threeLineTr(tr, at.pos, at.node));
		expect(edited(three, (tr, at) => allLinesTr(tr, at.pos, at.node))).toBe(HEADED);
	});

	it('no line at all', () => {
		const out = edited(HEADED, (tr, at) => noBorderTr(tr, at.pos, at.node));
		expect(out).toContain('stroke: none,');
		expect(out).not.toContain('table.hline');
	});

	it('a rule someone wrote by hand goes when the three rules are set', () => {
		const own = '#table(\n  columns: 2,\n  [a], [b],\n  table.hline(stroke: 3pt),\n  [c], [d],\n)';
		const three = edited(own, (tr, at) => threeLineTr(tr, at.pos, at.node));
		expect(three).toContain('table.hline(stroke: 1.5pt),\n  [a], [b],\n  table.hline(stroke: 0.75pt),');
		expect(three).not.toContain('3pt');
	});
});

describe('alignment', () => {
	it('a column, then another, written as one align: list', () => {
		const one = edited(PLAIN, (tr, at) => columnAlignTr(tr, at.pos, at.node, 2, 1, 'center'));
		expect(one).toContain('align: (auto, center),');
		expect(tableLook(tableOf(docOf(one)).node).aligns).toEqual([null, 'center']);
		const two = edited(one, (tr, at) => columnAlignTr(tr, at.pos, at.node, 2, 0, 'right'));
		expect(two).toContain('align: (right, center),');
		expect(columnAligns(tableOf(docOf(two)).node, 2)).toEqual(['right', 'center']);
	});

	it('the last alignment off takes the argument away', () => {
		const one = edited(PLAIN, (tr, at) => columnAlignTr(tr, at.pos, at.node, 2, 1, 'center'));
		expect(edited(one, (tr, at) => columnAlignTr(tr, at.pos, at.node, 2, 1, null))).toBe(PLAIN);
	});

	it('one alignment for the whole table, as the file may have written it', () => {
		const whole = PLAIN.replace('columns: 2,', 'columns: 2, align: center,');
		expect(columnAligns(tableOf(docOf(whole)).node, 2)).toEqual(['center', 'center']);
		expect(saved(whole)).toBe(whole);
	});

	it('a cell of its own: the column keeps its alignment, this cell has an exception', () => {
		const doc = docOf(PLAIN);
		const { pos } = tableOf(doc);
		// inside the first cell of the first row: table, row, cell, paragraph, after its text
		const caret = stateOf(doc).apply(stateOf(doc).tr.setSelection(TextSelection.near(doc.resolve(pos + 5))));
		const tr = cellAlignTr(caret, 'right');
		const out = serializeToTypst(tr!.doc).trimEnd();
		expect(out).toContain('table.cell(align: right)[a], [b],');
		expect(saved(out)).toBe(out);
		// and back to a bare cell
		const again = cellAlignTr(stateOf(tr!.doc), null);
		expect(serializeToTypst(again!.doc).trimEnd()).toBe(PLAIN);
	});

	it('every cell of a cell selection', () => {
		const doc = docOf(PLAIN);
		const { pos } = tableOf(doc);
		// the two cells of the first row, by where they stand
		const sel = CellSelection.create(doc, pos + 2, pos + 2 + doc.firstChild!.child(0).child(0).nodeSize);
		const tr = cellAlignTr(stateOf(doc).apply(stateOf(doc).tr.setSelection(sel)), 'center');
		const out = serializeToTypst(tr!.doc).trimEnd();
		expect(out).toContain('table.cell(align: center)[a], table.cell(align: center)[b],');
		expect(out).toContain('  [c], [d],');
	});
});

describe('what the editable table shows', () => {
	it('a centred column is centred, and a cell padding is the padding', () => {
		const styles = cellStyles(docOf('#table(\n  columns: 2,\n  align: (left, center),\n  inset: 5pt,\n  [a], [b],\n)'));
		expect(styles).toEqual(['text-align: left; padding: 5pt', 'text-align: center; padding: 5pt']);
	});

	it('a stroke of the table is the border of every cell', () => {
		const styles = cellStyles(docOf('#table(\n  columns: 2,\n  stroke: 0.5pt + gray,\n  [a], [b],\n)'));
		expect(styles[0]).toBe('border: 0.5pt solid rgb(170, 170, 170)');
	});
});

describe('named arguments kept as written', () => {
	it('the name of a line, and its value', () => {
		expect(argText(['stroke: none', '// a note'], 'stroke')).toBe('none');
		expect(argText(['inset: 5pt'], 'stroke')).toBeNull();
	});

	it('replaced in place, added at the end, removed when null', () => {
		expect(withArg(['fill: gray', 'stroke: 1pt'], 'stroke', 'none')).toEqual(['fill: gray', 'stroke: none']);
		expect(withArg(['fill: gray'], 'inset', '5pt')).toEqual(['fill: gray', 'inset: 5pt']);
		expect(withArg(['fill: gray', 'stroke: 1pt'], 'stroke', null)).toEqual(['fill: gray']);
	});

	it('an argument of the table set through a transaction', () => {
		const out = edited(PLAIN, (tr, at) => tableArgTr(tr, at.pos, at.node, 'inset', '5pt'));
		expect(out).toContain('inset: 5pt,');
		expect(edited(out, (tr, at) => tableArgTr(tr, at.pos, at.node, 'inset', null))).toBe(PLAIN);
	});
});

/** the style decoration of every cell of the first table, in reading order */
function cellStyles(doc: Node): string[] {
	const decos = tableLookDecorations(doc);
	const out: string[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name === 'table') return true;
		if (node.type.name === 'table_row') return true;
		if (node.type.name !== 'table_cell' && node.type.name !== 'table_header') return false;
		// a node decoration is found by a range that reaches into it, not by a point at its start
		for (const deco of decos.find(pos, pos + node.nodeSize)) {
			if (deco.from !== pos) continue;
			if (typeof deco.spec.style === 'string' && !deco.spec.style.startsWith('height')) out.push(deco.spec.style);
		}
		return false;
	});
	return out;
}
