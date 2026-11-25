// Edits to a Typst table's looks, as transactions. Every one of them is pure on the document: the
// panels hand the transaction to the view, and a test can read what it would write.
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { headerRows } from './tableRows';

export type Side = 'left' | 'center' | 'right';

/** verbatim-source attrs ride through the DOM on copy/paste, where one can come back as anything */
function asStrings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];
}

/** the name of the argument a verbatim line writes; null for a comment or anything positional */
export function argName(text: string): string | null {
	if (/^\s*(\/\/|\/\*)/.test(text)) return null;
	const name = /^\s*([A-Za-z_][\w-]*)\s*:/.exec(text);
	return name ? name[1] : null;
}

/** the arguments with `name` set to `text`, in the place it already had; removed when text is null */
export function withArg(args: unknown, name: string, text: string | null): string[] {
	const list = asStrings(args);
	const at = list.findIndex((a) => argName(a) === name);
	if (text == null) return at < 0 ? list : list.filter((_, i) => i !== at);
	const next = `${name}: ${text}`;
	return at < 0 ? [...list, next] : list.map((a, i) => (i === at ? next : a));
}

/** the value a named argument was written with, as the file has it; null when there is none */
export function argText(args: unknown, name: string): string | null {
	for (const text of asStrings(args)) {
		if (argName(text) !== name) continue;
		const colon = text.indexOf(':');
		return (
			text
				.slice(colon + 1)
				.trim()
				.replace(/,$/, '')
				.trim() || null
		);
	}
	return null;
}

/** each column's `columns:` track as the file wrote it; null for a spec that is not a plain list */
export function trackTexts(colspec: unknown, cols: number): string[] | null {
	const spec = typeof colspec === 'string' ? colspec.trim() : '';
	if (/^\d+$/.test(spec)) return Number(spec) === cols ? new Array(cols).fill('auto') : null;
	if (!spec.startsWith('(') || !spec.endsWith(')') || /[()]/.test(spec.slice(1, -1))) return null;
	const parts = spec
		.slice(1, -1)
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s !== '');
	return parts.length === cols ? parts : null;
}

/** the `columns:` list with column `at` given another track */
export function withTrack(colspec: unknown, cols: number, at: number, track: string): string | null {
	const parts = trackTexts(colspec, cols);
	return parts ? `(${parts.map((p, i) => (i === at ? track.trim() : p)).join(', ')})` : null;
}

function isLine(rule: string): boolean {
	return /^\s*table\.(hline|vline)\b/.test(rule);
}

/** the table as the transaction has it so far: a row may already have been rewritten above it */
function nodeIn(tr: Transaction, pos: number, fallback: PMNode): PMNode {
	return tr.doc.nodeAt(pos) ?? fallback;
}

/** one named argument of the table, set to a typst value; null takes the argument away */
export function tableArgTr(tr: Transaction, pos: number, table: PMNode, name: string, text: string | null): Transaction {
	const current = nodeIn(tr, pos, table);
	return tr.setNodeMarkup(pos, undefined, { ...current.attrs, typArgs: withArg(current.attrs.typArgs, name, text) });
}

/** the table's `stroke:`: `none` draws no line at all, null is typst's own grid */
export function strokeTr(tr: Transaction, pos: number, table: PMNode, stroke: string | null): Transaction {
	return tableArgTr(tr, pos, table, 'stroke', stroke);
}

/** every table.hline and table.vline out of the table: what is left is the grid `stroke:` draws */
export function noLinesTr(tr: Transaction, pos: number, table: PMNode): Transaction {
	let rowPos = pos + 1;
	table.forEach((row) => {
		const rules = asStrings(row.attrs.typRules).filter((rule) => !isLine(rule));
		if (rules.length !== asStrings(row.attrs.typRules).length) tr.setNodeMarkup(rowPos, undefined, { ...row.attrs, typRules: rules });
		rowPos += row.nodeSize;
	});
	const current = nodeIn(tr, pos, table);
	return tr.setNodeMarkup(pos, undefined, {
		...current.attrs,
		typBottomRules: asStrings(current.attrs.typBottomRules).filter((rule) => !isLine(rule))
	});
}

/** typst's own grid and nothing over it */
export function allLinesTr(tr: Transaction, pos: number, table: PMNode): Transaction {
	return strokeTr(noLinesTr(tr, pos, table), pos, table, null);
}

/** no line at all */
export function noBorderTr(tr: Transaction, pos: number, table: PMNode): Transaction {
	return strokeTr(noLinesTr(tr, pos, table), pos, table, 'none');
}

export type LineSpec = { top: string; head: string; bottom: string };

/** the three rules of a three-line table, as Chinese theses set them: thick, thin, thick */
export const THREE_LINE: LineSpec = { top: '1.5pt', head: '0.75pt', bottom: '1.5pt' };

/**
 * A three-line table: a rule over the first row, one under the header, one under the last row, and
 * no other line. A table without a header row gets its thin rule under the first row, where the
 * reader expects the head to be.
 */
export function threeLineTr(tr: Transaction, pos: number, table: PMNode, spec: LineSpec = THREE_LINE): Transaction {
	const header = headerRows(table);
	const rows = table.childCount;
	let head = -1;
	for (let i = 0; i < rows; i++) {
		if (!header.has(i)) {
			head = i;
			break;
		}
	}
	if (header.size === 0 && rows > 1) head = 1;
	const out = noLinesTr(tr, pos, table);
	let rowPos = pos + 1;
	for (let i = 0; i < rows; i++) {
		const row = out.doc.nodeAt(rowPos)!;
		const line = i === 0 ? `table.hline(stroke: ${spec.top})` : i === head ? `table.hline(stroke: ${spec.head})` : null;
		if (line) out.setNodeMarkup(rowPos, undefined, { ...row.attrs, typRules: [line, ...asStrings(row.attrs.typRules)] });
		rowPos += row.nodeSize;
	}
	const current = nodeIn(out, pos, table);
	out.setNodeMarkup(pos, undefined, {
		...current.attrs,
		typBottomRules: [...asStrings(current.attrs.typBottomRules), `table.hline(stroke: ${spec.bottom})`]
	});
	return strokeTr(out, pos, table, 'none');
}

/** a row's height, as a typst length; null lets the content decide */
export function rowHeightTr(tr: Transaction, rowPos: number, row: PMNode, height: string | null): Transaction {
	const text = height && height.trim() ? height.trim() : null;
	return tr.setNodeMarkup(rowPos, undefined, { ...row.attrs, typRowHeight: text });
}

function sideOf(text: string): Side | null {
	if (text === 'left' || text === 'center' || text === 'right') return text;
	// start and end are left and right to every document written in a left-to-right language
	if (text === 'start') return 'left';
	if (text === 'end') return 'right';
	return null;
}

/** the alignment each column has, from the table's `align:`; null where the source says nothing */
export function columnAligns(table: PMNode, cols: number): (Side | null)[] {
	const align = typeof table.attrs.typAlign === 'string' ? table.attrs.typAlign.trim() : '';
	if (/^\([^()]*\)$/.test(align)) {
		const sides = align
			.slice(1, -1)
			.split(',')
			.map((part) => sideOf(part.trim()));
		return sides.length === cols ? sides : new Array(cols).fill(null);
	}
	const one = align ? sideOf(align) : null;
	return new Array(cols).fill(one);
}

/** one column's alignment; a table where no column has one carries no `align:` at all */
export function columnAlignTr(tr: Transaction, pos: number, table: PMNode, cols: number, column: number, side: Side | null): Transaction {
	const next = columnAligns(table, cols);
	next[column] = side;
	const typAlign = next.every((s) => s == null) ? null : `(${next.map((s) => s ?? 'auto').join(', ')})`;
	return tr.setNodeMarkup(pos, undefined, { ...table.attrs, typAlign });
}

function cellAround(doc: PMNode, pos: number): { node: PMNode; pos: number } | null {
	const here = doc.resolve(pos);
	for (let d = here.depth; d > 0; d--) {
		const at = here.before(d);
		const node = doc.nodeAt(at);
		if (node && (node.type.name === 'table_cell' || node.type.name === 'table_header')) return { node, pos: at };
	}
	return null;
}

/**
 * `align:` on the cells of the selection: every cell of a cell selection, or the one the caret is
 * in. It is the cell's own argument, so the column keeps its alignment and this cell its exception.
 */
export function cellAlignTr(state: EditorState, side: Side | null): Transaction | null {
	const tr = state.tr;
	const sel = state.selection;
	function touch(cell: PMNode, pos: number) {
		tr.setNodeMarkup(pos, undefined, { ...cell.attrs, typCellArgs: withArg(cell.attrs.typCellArgs, 'align', side) });
	}
	if (sel instanceof CellSelection) {
		sel.forEachCell((cell, pos) => touch(cell, pos));
		return tr;
	}
	const cell = cellAround(state.doc, sel.from);
	if (!cell) return null;
	touch(cell.node, cell.pos);
	return tr;
}
