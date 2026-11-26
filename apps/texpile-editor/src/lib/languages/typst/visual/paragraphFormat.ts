// The paragraph settings of the toolbar, kept in the document as the typst that scopes them to a
// few paragraphs: a content block that opens with set rules.
//
//   #[
//     #set align(center)
//     #set par(justify: false)
//     The paragraphs this shapes.
//   ]
//
// Such a block opens in the editor as a container with no name (convert/envConvert.ts), the rules
// as chips above its text. The settings here read those chips and rewrite them; when the caret is
// in no such container, the whole paragraphs the selection touches are wrapped in a new one.
import { Fragment, type Node as PMNode, type ResolvedPos, type Schema } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { readTypstCall } from '$lib/languages/typst/visual/core';

export type Align = 'left' | 'center' | 'right';

/** what the settings can set; null is typst's (or the template's) own value */
export type ParaFormat = {
	/** which side the text hugs; justified text needs the start side, which is left here */
	align: Align | null;
	justify: boolean | null;
	/** first-line-indent, a typst length such as 2em */
	indent: string | null;
	/** leading, the space between lines, a typst length such as 0.65em */
	leading: string | null;
};

/** the container's leading chips, read: the settings' own fields and whatever else they say */
type Rules = ParaFormat & {
	/** arguments of the par rule that are none of the above, as written */
	extraPar: string[];
	/** every other leading chip, as written */
	rest: string[];
};

const EMPTY: Rules = { align: null, justify: null, indent: null, leading: null, extraPar: [], rest: [] };

function sideOf(value: string): Align | null {
	if (value === 'left' || value === 'center' || value === 'right') return value;
	// start and end are left and right to every document written in a left-to-right language
	if (value === 'start') return 'left';
	if (value === 'end') return 'right';
	return null;
}

/** a rule's text as a chip holds it, with its leading # whatever the file wrote */
function readChip(text: string): ReturnType<typeof readTypstCall> {
	const written = text.trim();
	return readTypstCall(written.startsWith('#') ? written : `#${written}`);
}

/** the chips that open a container's content, and how many of its blocks they are */
function leadingChips(node: PMNode): { texts: string[]; count: number } {
	const texts: string[] = [];
	let count = 0;
	while (count < node.childCount) {
		const child = node.child(count);
		if (child.type.name !== 'raw_latex') break;
		texts.push(child.textContent.trim());
		count++;
	}
	return { texts, count };
}

function readRules(texts: string[]): Rules {
	const rules: Rules = { ...EMPTY, extraPar: [], rest: [] };
	for (const text of texts) {
		const call = readChip(text);
		if (!call || call.form !== 'set') {
			rules.rest.push(text);
			continue;
		}
		if (call.name === 'align') {
			const value = call.args[0]?.value;
			rules.align = value ? sideOf(value) : null;
			continue;
		}
		if (call.name !== 'par') {
			rules.rest.push(text);
			continue;
		}
		let known = false;
		const others: string[] = [];
		for (const arg of call.args) {
			if (arg.name === 'justify' && (arg.value === 'true' || arg.value === 'false')) {
				rules.justify = arg.value === 'true';
				known = true;
			} else if (arg.name === 'first-line-indent') {
				rules.indent = arg.value;
				known = true;
			} else if (arg.name === 'leading') {
				rules.leading = arg.value;
				known = true;
			} else others.push(call.source.slice(arg.from, arg.to));
		}
		// a par rule that says none of it stays as it was written, whole
		if (known) rules.extraPar.push(...others);
		else rules.rest.push(text);
	}
	return rules;
}

/** the chips the settings' rules are written as, in one order, so that a rewrite settles */
function chipsOf(rules: Rules): string[] {
	const out: string[] = [];
	if (rules.align) out.push(`#set align(${rules.align})`);
	const par = [
		...(rules.justify == null ? [] : [`justify: ${rules.justify}`]),
		...(rules.indent ? [`first-line-indent: ${rules.indent}`] : []),
		...(rules.leading ? [`leading: ${rules.leading}`] : []),
		...rules.extraPar
	];
	if (par.length) out.push(`#set par(${par.join(', ')})`);
	return [...out, ...rules.rest];
}

/** a rule as a chip block; one after the first stands on the next line, as opening rules do */
function chipNode(schema: Schema, text: string, at: number): PMNode {
	return schema.nodes.raw_latex.create({ typGap: at ? 'newline' : null }, schema.text(text));
}

function containerOf(schema: Schema, chips: string[], body: Fragment): PMNode {
	return schema.nodes.typ_env.create(
		{ name: '', args: null, label: null, labelGap: null, bodyLead: null, bodyTrail: null, typIndent: null, typBodyArg: null, code: false },
		[...chips.map((text, at) => chipNode(schema, text, at)), ...body.content]
	);
}

/** the deepest depth at which both positions are inside the same node */
function commonDepth(from: ResolvedPos, to: ResolvedPos): number {
	let d = 0;
	while (d < from.depth && d < to.depth && from.before(d + 1) === to.before(d + 1)) d++;
	return d;
}

/** whether the blocks from `at` up to the one holding `end` can give way to a container */
function holds(state: EditorState, at: number, end: number, d: number): boolean {
	const env = state.schema.nodes.typ_env;
	const here = state.doc.resolve(at);
	return state.doc.resolve(at).node(d).canReplaceWith(here.index(d), state.doc.resolve(end).indexAfter(d), env);
}

/**
 * The whole blocks the selection touches, as siblings: a caret in a paragraph takes that
 * paragraph, a selection across three takes the three. Null where a container cannot go - a
 * list item that has to open with its paragraph, say.
 */
function blockRange(state: EditorState): { from: number; to: number } | null {
	const { $from, $to } = state.selection;
	let d = commonDepth($from, $to);
	// a caret inside a text block: the block is the unit, not its place inside it
	if ($from.node(d).isTextblock) d--;
	const from = $from.depth > d ? $from.before(d + 1) : $from.pos;
	const to = $to.depth > d ? $to.after(d + 1) : $to.pos;
	if (to > from) return holds(state, from, to, d) ? { from, to } : null;
	// nothing between the two: the block after the caret, else the one before
	const at = state.doc.resolve(from);
	const next = state.doc.nodeAt(from);
	if (next && !next.isText && !next.isInline)
		return holds(state, from, from + next.nodeSize, d) ? { from, to: from + next.nodeSize } : null;
	if (at.index(d) === 0) return null;
	const width = at.node(d).child(at.index(d) - 1).nodeSize;
	return holds(state, from - width, from, d) ? { from: from - width, to: from } : null;
}

/** what a container's leading chips say; null for a node that is no such container */
export function paraFormatOf(node: PMNode): ParaFormat | null {
	if (node.type.name !== 'typ_env' || node.attrs.name !== '') return null;
	const chips = leadingChips(node);
	if (chips.count === 0) return null;
	const rules = readRules(chips.texts);
	return { align: rules.align, justify: rules.justify, indent: rules.indent, leading: rules.leading };
}

/**
 * The container the settings work on, around the caret: the innermost one whose content opens
 * with rules. Null when the caret is in no such container.
 */
export function paraFormatAt(state: EditorState): { node: PMNode; pos: number; format: ParaFormat } | null {
	const here = state.selection.$from;
	for (let d = here.depth; d > 0; d--) {
		const format = paraFormatOf(here.node(d));
		if (format) return { node: here.node(d), pos: here.before(d), format };
	}
	return null;
}

/**
 * Give the paragraphs at the selection a setting. Inside a container its chips are rewritten; with
 * nothing left to say the container is unwrapped again. Around other paragraphs they are wrapped.
 */
export function applyParaFormat(state: EditorState, patch: Partial<ParaFormat>): Transaction | null {
	const at = paraFormatAt(state);
	if (at) {
		const chips = leadingChips(at.node);
		const written = chipsOf({ ...readRules(chips.texts), ...patch });
		const kept = Fragment.fromArray(at.node.content.content.slice(chips.count));
		return state.tr.replaceWith(at.pos, at.pos + at.node.nodeSize, written.length ? containerOf(state.schema, written, kept) : kept);
	}
	const range = blockRange(state);
	if (!range) return null;
	const written = chipsOf({ ...EMPTY, ...patch });
	if (!written.length) return null;
	return state.tr.replaceWith(range.from, range.to, containerOf(state.schema, written, state.doc.slice(range.from, range.to).content));
}

/** the paragraph a container gives every one of its paragraphs, as css a browser can draw */
export function paraStyle(format: ParaFormat, cssLength: (text: string) => string | null): { box: string; indent: string } {
	const box: string[] = [];
	const side = format.align ?? (format.justify ? 'left' : null);
	if (format.justify === true && side === 'left') box.push('text-align: justify');
	else if (side) box.push(`text-align: ${side}`);
	// typst's leading is the space between lines, on top of the line's own height
	const leading = format.leading ? cssLength(format.leading) : null;
	if (leading) box.push(`line-height: calc(1em + ${leading})`);
	return { box: box.join('; '), indent: format.indent ? (cssLength(format.indent) ?? '') : '' };
}
