// What the editor shows of a paragraph's own settings. The rules that carry them are still chips in
// the document - the dialog rewrites them, the source is in them - but they are drawn as Word draws
// a paragraph's formatting: a small paragraph mark at the start of the text, not the code. The
// settings themselves are drawn as they will print: the side the text hugs, the indent, the space
// between lines.
import { Plugin, type EditorState, type Transaction } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { readTypstCall, typstLengthCss } from '$lib/languages/typst/visual/core';
import { formatRules, isParagraphRuleChip, paraHolderOf, paraStyle, readRules, type ParaFormat } from '../../paragraphFormat';
import { readBlock } from '../../paragraphBlock';
import { CHIP_MARK } from '$lib/editor/visual/extensions/drawnChips/DrawnChipView';
import './paraFormat.css';

/** a typst length as the browser draws it, where the length came written as text */
export function lengthCss(text: string): string | null {
	const call = readTypstCall(`#set par(leading: ${text.trim()})`);
	const arg = call ? call.args[0] : null;
	return call && arg ? typstLengthCss(arg.node, call.source) : null;
}

/** a decoration whose attributes are also its spec, which is where a decoration read back off the set exposes them */
function marked(from: number, to: number, attrs: Record<string, string>): Decoration {
	return Decoration.node(from, to, attrs, attrs);
}

/** the chips that open a container's content, as text */
function openingChips(node: PMNode): string[] {
	const texts: string[] = [];
	for (let i = 0; i < node.childCount && node.child(i).type.name === 'raw_latex'; i++) texts.push(node.child(i).textContent.trim());
	return texts;
}

/** the settings of a paragraph container: its opening rules and, for a block, its arguments */
export function holderFormat(node: PMNode): ParaFormat {
	return formatRules(readRules(openingChips(node)), readBlock(node.attrs.name === 'block' ? node.attrs.args : null));
}

/** the room a paragraph's mark takes at the start of its first line */
const MARK_EM = 1.4;
const MARK = `${MARK_EM}em`;

/** a paragraph's indent as css: a first line indented by the measure, or every line but the first */
function indentStyle(style: { firstLine: string; hanging: string }): string {
	if (style.firstLine) return `text-indent: ${style.firstLine}`;
	if (style.hanging) return `padding-left: ${style.hanging}; text-indent: -${style.hanging}`;
	return '';
}

/** a css length in em, where its unit says: enough to compare one with another; 0 where it does not say */
function inEm(length: string): number {
	const match = /^([0-9]*\.?[0-9]+)(em|pt|mm|cm|in)$/.exec(length.trim());
	if (!match) return 0;
	// typst's em is the font's size, 12pt in the body of a thesis
	return Number(match[1]) / ({ em: 1, pt: 12, mm: 4.2333, cm: 0.42333, in: 0.16667 } as Record<string, number>)[match[2]]!;
}

/** the same, with the first line starting after the paragraph's mark where its own indent does not already give the mark room */
function clearedIndentStyle(style: { firstLine: string; hanging: string }): string {
	if (style.firstLine)
		return inEm(style.firstLine) >= MARK_EM ? `text-indent: ${style.firstLine}` : `text-indent: calc(${MARK} + ${style.firstLine})`;
	if (style.hanging) return `padding-left: ${style.hanging}; text-indent: calc(${MARK} - ${style.hanging})`;
	return `text-indent: ${MARK}`;
}

/**
 * One decoration per container with settings, one per paragraph in it that looks different from
 * plain text, and one per rule chip that opens it, which is what turns the code into a mark.
 */
export function paraFormatDecorations(doc: PMNode): DecorationSet {
	const out: Decoration[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name !== 'typ_env') return true;
		// '' is a content block with no name, itself a holder: only null is not one
		const holder = paraHolderOf(node);
		if (holder === null) return true;
		const opening = openingChips(node);
		const format = formatRules(readRules(opening), readBlock(holder === 'block' ? node.attrs.args : null));
		const style = paraStyle(format, lengthCss);
		// the rules are marks where they are all that opens the container: beside another rule's chip a
		// mark would read as part of it
		const marks = opening.length > 0 && opening.every(isParagraphRuleChip);
		const end = pos + node.nodeSize;
		// a block's own view paints its outer element (the gear, the margins, the inset): the content
		// block is styled here, and a block's paragraphs each carry the text style themselves
		// a content block with a paragraph in it flows with the text around it; one of rules alone keeps its box
		const flows = holder === '' && node.childCount > opening.length;
		const holderClass = `typ-par-holder${flows ? ' typ-par-flow' : ''}${marks ? ' typ-par-marked' : ''}`;
		out.push(
			marked(pos, end, holder === 'block' ? { class: holderClass } : { class: holderClass, ...(style.box ? { style: style.box } : {}) })
		);
		// the mark is as tall as the paragraph's line, which is the line height its rules give it
		const markStyle = /line-height: [^;]+/.exec(style.box)?.[0];
		let at = pos + 1;
		let index = 0;
		let first = true;
		node.forEach((child) => {
			if (child.type.name === 'raw_latex') {
				// the chips that open the container, and only those: a rule set further down shapes
				// what follows it and is not the paragraph's own
				if (marks && index < opening.length)
					out.push(
						marked(at, at + child.nodeSize, {
							class: 'typ-par-rule',
							[CHIP_MARK]: index ? 'more' : 'first',
							...(markStyle ? { style: markStyle } : {})
						})
					);
			} else {
				const paragraph = child.type.name === 'paragraph';
				const parts = [
					holder === 'block' ? style.box : '',
					paragraph ? (marks && first ? clearedIndentStyle(style) : indentStyle(style)) : ''
				].filter(Boolean);
				if (parts.length) out.push(marked(at, at + child.nodeSize, { style: parts.join('; ') }));
				first = false;
			}
			at += child.nodeSize;
			index++;
		});
		return false;
	});
	return DecorationSet.create(doc, out);
}

/** the container the caret is in, if its paragraphs have settings of their own: marked while the caret is there */
function activeMarks(selection: EditorState['selection']): Decoration[] {
	const $from = selection.$from;
	for (let d = $from.depth; d > 0; d--) {
		const node = $from.node(d);
		if (node.type.name !== 'typ_env') continue;
		return paraHolderOf(node) === null ? [] : [marked($from.before(d), $from.after(d), { class: 'typ-par-active' })];
	}
	return [];
}

/** what the document draws, kept as long as the document lasts, and the mark of the caret's container over it */
const byDoc = new WeakMap<PMNode, DecorationSet>();
function decorationsOf(state: { doc: PMNode; selection: EditorState['selection'] }): DecorationSet {
	let drawn = byDoc.get(state.doc);
	if (!drawn) byDoc.set(state.doc, (drawn = paraFormatDecorations(state.doc)));
	return drawn.add(state.doc, activeMarks(state.selection));
}

export const paraFormatLook: Plugin = new Plugin({
	state: {
		init: (_config, state) => decorationsOf(state),
		// the document's own decorations are read again only when it changes; the caret's move is the mark alone
		apply(tr: Transaction, prev) {
			return tr.docChanged || tr.selectionSet ? decorationsOf(tr) : prev;
		}
	},
	props: {
		decorations: (state) => paraFormatLook.getState(state)
	}
});
