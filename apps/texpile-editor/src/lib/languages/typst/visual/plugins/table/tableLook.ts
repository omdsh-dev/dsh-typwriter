// What a #table(..) says about its own looks, drawn onto the editable table. The editor used to
// show every Typst table with the same grey grid, whatever its stroke:, hlines and align: said: a
// three-line table read as a boxed one, a centred column as a left-aligned one, and a tall row as
// an ordinary one. The chip face (tableFace.ts) has always drawn these; the table you edit in did not.
import { Plugin } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';
import {
	horizontalAlignment,
	namedArg,
	readTypstCall,
	strokeCss,
	typstColorCss,
	typstLengthCss,
	typstSidesCss,
	type CallArg,
	type TypstCall
} from '$lib/languages/typst/visual/core';
import { parseTracks } from '$lib/languages/typst/visual/core/document';
import './tableLook.css';

/** a line the source gave no stroke: typst's own 1pt black, in the editor's text colour */
const OWN_LINE = '1px solid currentColor';

/** verbatim-source attrs ride through the DOM on copy/paste, where one can come back as anything */
function asStrings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];
}

type ReadArg = { name: string; arg: CallArg; call: TypstCall };

/**
 * One named argument, read out of the verbatim text it was in the file. The call is rebuilt around
 * that text, so its nodes address it and the css readers can be pointed at it again.
 */
function readArg(text: string, wrap: (text: string) => string): ReadArg | null {
	const call = readTypstCall(wrap(text));
	const arg = call && call.args.length === 1 ? call.args[0] : null;
	return call && arg && arg.name ? { name: arg.name, arg, call } : null;
}

function tableArg(text: string): string {
	return `#table(${text})`;
}
function cellArg(text: string): string {
	return `#table.cell(${text})`;
}

export type TableLook = {
	/** the stroke every cell edge gets: '' when the source says none, null for typst's own default */
	stroke: string | null;
	/** cell padding, null for the default */
	inset: string | null;
	/** horizontal alignment, one per column or one for the whole table; null for the default */
	aligns: (string | null)[] | string | null;
};

/** what the table's own named arguments say about its looks */
export function tableLook(table: PMNode): TableLook {
	const look: TableLook = { stroke: null, inset: null, aligns: null };
	for (const text of asStrings(table.attrs.typArgs)) {
		const read = readArg(text, tableArg);
		if (!read) continue;
		if (read.name === 'stroke') {
			look.stroke = read.arg.kind === 'None' ? '' : (strokeCss(read.call, read.arg) ?? null);
		} else if (read.name === 'inset') look.inset = typstSidesCss(read.arg.node, read.call.source);
	}
	const align = typeof table.attrs.typAlign === 'string' ? table.attrs.typAlign.trim() : '';
	if (/^\([^()]*\)$/.test(align)) {
		look.aligns = align
			.slice(1, -1)
			.split(',')
			.map((part) => horizontalAlignment(part.trim()));
	} else if (align) look.aligns = horizontalAlignment(align);
	return look;
}

function cellLook(cell: PMNode): { align: string | null; fill: string | null } {
	const out = { align: null as string | null, fill: null as string | null };
	for (const text of asStrings(cell.attrs.typCellArgs)) {
		const read = readArg(text, cellArg);
		if (!read) continue;
		if (read.name === 'align') out.align = horizontalAlignment(read.arg.value);
		else if (read.name === 'fill' && read.arg.kind !== 'None') out.fill = typstColorCss(read.arg.node, read.call.source) ?? null;
	}
	return out;
}

function lineOf(rule: string): string | null {
	const text = rule.trim();
	if (!text.startsWith('table.hline')) return null;
	const call = readTypstCall(`#${text}`);
	const stroke = call ? namedArg(call, 'stroke') : null;
	return (call && stroke && strokeCss(call, stroke)) || OWN_LINE;
}

/** the line drawn at a place: when the source puts two there, the later one is the one on top */
function lineBefore(rules: string[]): string | null {
	let line: string | null = null;
	for (const rule of rules) line = lineOf(rule) ?? line;
	return line;
}

function heightCss(text: string): string | null {
	const call = readTypstCall(`#table.row(height: ${text})`);
	const arg = call ? namedArg(call, 'height') : null;
	return call && arg ? typstLengthCss(arg.node, call.source) : null;
}

function cellStyle(
	look: TableLook,
	r: number,
	c: number,
	cell: PMNode,
	tops: (string | null)[],
	bottom: string | null,
	rowCount: number
): string {
	const parts: string[] = [];
	if (look.stroke === '') parts.push('border-style: none');
	else if (look.stroke) parts.push(`border: ${look.stroke}`);
	if (tops[r]) parts.push(`border-top: ${tops[r]}`);
	// the line under a cell is the one before the next row, or the table's own last line
	const end = r + Number(cell.attrs.rowspan ?? 1) - 1;
	const under = end >= rowCount - 1 ? bottom : tops[end + 1];
	if (under) parts.push(`border-bottom: ${under}`);
	const whole = typeof look.aligns === 'string' ? look.aligns : null;
	const perColumn = Array.isArray(look.aligns) ? look.aligns[c] : null;
	const own = cellLook(cell);
	const align = own.align ?? perColumn ?? whole;
	if (align) parts.push(`text-align: ${align}`);
	if (look.inset) parts.push(`padding: ${look.inset}`);
	if (own.fill) parts.push(`background-color: ${own.fill}`);
	return parts.join('; ');
}

/** the grid width of a table: its widest row, spans counted */
function columnCount(table: PMNode): number {
	let cols = 0;
	table.forEach((row) => {
		let w = 0;
		row.forEach((cell) => (w += Number(cell.attrs.colspan ?? 1)));
		cols = Math.max(cols, w);
	});
	return cols;
}

/**
 * A node decoration whose attributes are also its spec, which is where a decoration read back off
 * the set exposes them (the editor's number decorations are read the same way).
 */
function marked(from: number, to: number, attrs: Record<string, string>): Decoration {
	return Decoration.node(from, to, attrs, attrs);
}

/**
 * One decoration per row and cell that looks different from the plain grid: borders for `stroke:`
 * and the hlines, text alignment for `align:`, padding for `inset:`, the height of a table.row.
 */
export function tableLookDecorations(doc: PMNode): DecorationSet {
	const out: Decoration[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name !== 'table') return true;
		if (!('typArgs' in node.attrs)) return false; // a LaTeX table has none of these
		const look = tableLook(node);
		const cols = columnCount(node);
		const rows: PMNode[] = [];
		node.forEach((row) => rows.push(row));
		const tops = rows.map((row) => lineBefore(asStrings(row.attrs.typRules)));
		const bottom = lineBefore(asStrings(node.attrs.typBottomRules));
		const covered = new Set<string>();
		let rowPos = pos + 1;
		// a class rather than a style: prosemirror-tables' view owns the table element's `style`
		// (its width is the sum of its columns), and a style decoration would fight it for the attribute
		const tracks = parseTracks(node.attrs.colspec, cols);
		const auto = !tracks || tracks.every((t) => t.kind === 'auto');
		out.push(marked(pos, pos + node.nodeSize, { class: auto ? 'typst-table typst-table-auto' : 'typst-table' }));
		rows.forEach((row, r) => {
			const height = typeof row.attrs.typRowHeight === 'string' ? row.attrs.typRowHeight.trim() : '';
			const tall = height ? heightCss(height) : null;
			if (tall) out.push(marked(rowPos, rowPos + row.nodeSize, { style: `height: ${tall}` }));
			let c = 0;
			let cellPos = rowPos + 1;
			row.forEach((cell) => {
				while (c < cols && covered.has(`${r},${c}`)) c++;
				const style = cellStyle(look, r, c, cell, tops, bottom, rows.length);
				if (style) out.push(marked(cellPos, cellPos + cell.nodeSize, { style }));
				const colspan = Number(cell.attrs.colspan ?? 1);
				const rowspan = Number(cell.attrs.rowspan ?? 1);
				for (let dr = 1; dr < rowspan; dr++) for (let dc = 0; dc < colspan; dc++) covered.add(`${r + dr},${c + dc}`);
				c += colspan;
				cellPos += cell.nodeSize;
			});
			rowPos += row.nodeSize;
		});
		return false;
	});
	return DecorationSet.create(doc, out);
}

/** keeps the decorations current: rebuilt when the document changes, carried over otherwise */
export const typstTableLook: Plugin = new Plugin({
	state: {
		init: (_config, state) => tableLookDecorations(state.doc),
		apply(tr, prev) {
			return tr.docChanged ? tableLookDecorations(tr.doc) : prev;
		}
	},
	props: {
		decorations: (state) => typstTableLook.getState(state)
	}
});
