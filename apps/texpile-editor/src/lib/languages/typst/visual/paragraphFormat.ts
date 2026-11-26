// The paragraph settings of the dialog, kept in the document as the typst that scopes them. The set
// rules shape every paragraph after them in their block, so a few paragraphs with settings of their
// own open in a content block that starts with them (convert/envConvert.ts), the rules as chips
// above the text:
//
//   #[
//     #set align(center)
//     #set par(justify: false, first-line-indent: 2em)
//
//     The paragraphs this shapes.
//   ]
//
// What Typst has no set rule for goes in a `block` around them (paragraphBlock.ts):
//
//   #block(above: 1em, inset: (left: 2em))[ ... ]
//
// The document's own defaults are the same rules standing at the top of the file (paragraphDefaults.ts).
import { Fragment, type Node as PMNode, type ResolvedPos, type Schema } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { readTypstCall, type CallArg } from '$lib/languages/typst/visual/core';
import { DEFAULT_LEAD } from './serialize/envSerializer';
import { blockArgsOf, dictionaryEntries, noBlock, readBlock, type BlockArgs } from './paragraphBlock';

export type Align = 'left' | 'center' | 'right';

/**
 * The two indents Word calls special, each with one measure. 'none' is written out too, as
 * `first-line-indent: 0em`: a paragraph with none where the defaults have one.
 */
export type Special = 'first-line' | 'hanging' | 'none';

/** what the dialog can set; null is what the document's defaults, or typst's own, say */
export type ParaFormat = {
	/** which side the text hugs; justified text needs the start side, which is left here */
	align: Align | null;
	justify: boolean | null;
	special: Special | null;
	/** the measure of the special indent, a typst length such as 2em */
	indent: string | null;
	/** leading, the space between lines, a typst length such as 0.65em */
	leading: string | null;
	/** the room left on each side of the paragraphs, as the block's inset */
	left: string | null;
	right: string | null;
	/** space before and after the paragraphs, as the block's above and below */
	above: string | null;
	below: string | null;
	/** all lines on one page: the block is not breakable */
	keepTogether: boolean | null;
	/** the page does not break between this and what follows: the block is sticky */
	keepWithNext: boolean | null;
};

/** the fields the set rules carry */
export type RuleFields = Pick<ParaFormat, 'align' | 'justify' | 'special' | 'indent' | 'leading'>;
export type Rules = RuleFields & {
	/**
	 * How a first-line indent is written: null is the bare length, which typst reads as indenting only
	 * a paragraph that follows another; true or false is the dict `(amount: 2em, all: true)`, which
	 * indents the first paragraph after a heading too, as Word does.
	 */
	indentAll: boolean | null;
	/** the indent of the first line where it is its own, in a paragraph indented both ways; null is none */
	firstLine: string | null;
	/** arguments of the par rule that are none of the above, as written */
	extraPar: string[];
	/** every other leading chip, as written */
	rest: string[];
};

type Held = { rules: Rules; block: BlockArgs };

export function noRules(): Rules {
	return {
		align: null,
		justify: null,
		special: null,
		indent: null,
		leading: null,
		indentAll: null,
		firstLine: null,
		extraPar: [],
		rest: []
	};
}

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

/** whether a chip is one of the two rules the settings write, and so one they may rewrite */
export function isParagraphRuleChip(text: string): boolean {
	const call = readChip(text);
	return !!call && call.form === 'set' && (call.name === 'align' || call.name === 'par');
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

/** a first-line indent as the rule wrote it: no amount is `0em`, an indent that is none; null is one the dialog cannot read */
type FirstLine = { amount: string | null; all: boolean | null };

function firstLineOf(arg: CallArg): FirstLine | null {
	if (arg.kind === 'Numeric' || (arg.kind === 'Int' && arg.value === '0'))
		return { amount: ZERO.test(arg.value) ? null : arg.value, all: null };
	if (arg.kind !== 'Dict') return null;
	const entries = dictionaryEntries(arg);
	const amount = entries.find((entry) => entry.key === 'amount');
	const all = entries.find((entry) => entry.key === 'all');
	const measure = amount ? amount.text.slice(amount.text.indexOf(':') + 1).trim() : '';
	if (!measure || !LENGTH.test(measure)) return null;
	return { amount: ZERO.test(measure) ? null : measure, all: all ? all.text.slice(all.text.indexOf(':') + 1).trim() === 'true' : null };
}

/** a length that is no length at all: typst's own word for no indent, in any unit */
const ZERO = /^0+(?:\.0+)?\s*(?:em|pt|mm|cm|in)?$/;
/** a typst length as a person writes it: a number and a unit */
const LENGTH = /^[0-9]*\.?[0-9]+\s*(em|pt|mm|cm|in)$/;
/**
 * The height of the line typst lays out before any leading, for SimSun: 0.683 em, measured with typst
 * 0.15.1 (8.2pt at 12pt). A single-spaced line of the same font in Word is 1.3 em (15.57pt).
 */
export const TYPST_LINE = 0.683;
/** a leading written as a line of a fixed height, Word's own setting: the height less the font's line */
export const EXACT_LEADING = /^([0-9]*\.?[0-9]+\s*(?:em|pt|mm|cm|in))\s*-\s*0\.683em$/;
/** a blank line, wherever it stands in the whitespace that opens a body */
const BLANK_LINE = /\n[ \t]*\n/;

export function readRules(texts: string[]): Rules {
	const rules = noRules();
	for (const text of texts) {
		const call = readChip(text);
		if (!call || call.form !== 'set') {
			rules.rest.push(text);
			continue;
		}
		if (call.name === 'align') {
			const side = call.args.length === 1 ? sideOf(call.args[0].value) : null;
			// an alignment of more than one side (`center + horizon`) is none of the dialog's: it stays as written
			if (side) rules.align = side;
			else rules.rest.push(text);
			continue;
		}
		if (call.name !== 'par') {
			rules.rest.push(text);
			continue;
		}
		let known = false;
		const others: string[] = [];
		let firstLine: FirstLine | null = null;
		let hanging: string | null = null;
		for (const arg of call.args) {
			const value = arg.value;
			if (arg.name === 'justify' && (value === 'true' || value === 'false')) {
				rules.justify = value === 'true';
				known = true;
			} else if (arg.name === 'first-line-indent') {
				const read = firstLineOf(arg);
				if (read) {
					firstLine = read;
					known = true;
				} else others.push(call.source.slice(arg.from, arg.to));
			} else if (arg.name === 'hanging-indent' && LENGTH.test(value)) {
				if (!ZERO.test(value)) hanging = value;
				known = true;
			} else if (arg.name === 'leading' && (LENGTH.test(value) || EXACT_LEADING.test(value))) {
				rules.leading = value;
				known = true;
			} else others.push(call.source.slice(arg.from, arg.to));
		}
		// a paragraph indented both ways keeps the hanging one, as Word offers only one at a time; its
		// first line keeps the indent of its own, as written
		if (hanging) {
			rules.special = 'hanging';
			rules.indent = hanging;
			rules.firstLine = firstLine?.amount ?? null;
		} else if (firstLine) {
			rules.special = firstLine.amount ? 'first-line' : 'none';
			rules.indent = firstLine.amount;
			rules.indentAll = firstLine.all;
		}
		// a par rule that says none of it stays as it was written, whole
		if (known) rules.extraPar.push(...others);
		else rules.rest.push(text);
	}
	return rules;
}

/**
 * The rules as a patch leaves them; a field the patch does not name is kept. A first-line indent
 * that is new is written as the dict with `all: true`, so that it indents the paragraph it was set
 * on even where that is the first after a heading; one that was there keeps the form it had.
 */
export function patchedRules(rules: Rules, patch: Partial<ParaFormat>): Rules {
	const next: RuleFields = {
		align: patch.align === undefined ? rules.align : patch.align,
		justify: patch.justify === undefined ? rules.justify : patch.justify,
		special: patch.special === undefined ? rules.special : patch.special,
		indent: patch.indent === undefined ? rules.indent : patch.indent,
		leading: patch.leading === undefined ? rules.leading : patch.leading
	};
	// a measure with no kind to it is a first line's
	if (next.indent && next.special == null) next.special = 'first-line';
	const firstLine = next.special === 'first-line' ? (rules.special === 'first-line' ? rules.indentAll : true) : null;
	return {
		...next,
		indentAll: firstLine,
		firstLine: next.special === 'hanging' && rules.special === 'hanging' ? rules.firstLine : null,
		extraPar: rules.extraPar,
		rest: rules.rest
	};
}

/** the special indent as typst arguments. Both are written where the paragraph's indent must be its own whatever the defaults say */
function indentArgs(rules: Rules): string[] {
	if (rules.special === 'none') return ['first-line-indent: 0em'];
	if (!rules.indent || rules.special == null) return [];
	if (rules.special === 'hanging') return [`first-line-indent: ${rules.firstLine ?? '0em'}`, `hanging-indent: ${rules.indent}`];
	return [`first-line-indent: ${rules.indentAll == null ? rules.indent : `(amount: ${rules.indent}, all: ${rules.indentAll})`}`];
}

/** the chips the settings' rules are written as, in one order, so that a rewrite settles */
export function chipsOf(rules: Rules): string[] {
	const out: string[] = [];
	if (rules.align) out.push(`#set align(${rules.align})`);
	const par = [
		...(rules.justify == null ? [] : [`justify: ${rules.justify}`]),
		...indentArgs(rules),
		...(rules.leading ? [`leading: ${rules.leading}`] : []),
		...rules.extraPar
	];
	if (par.length) out.push(`#set par(${par.join(', ')})`);
	return [...out, ...rules.rest];
}

/** a rule as a chip block; one after the first stands on the next line, as opening rules do. `gap` is the gap before the first, when it takes the place of a chip that had one */
export function chipNode(schema: Schema, text: string, at: number, gap: unknown = null): PMNode {
	return schema.nodes.raw_latex.create({ typGap: at ? 'newline' : (gap ?? null) }, schema.text(text));
}

/**
 * The paragraphs' container: a plain content block, or a block call when it carries arguments. It
 * keeps the place in the file of the one it replaces, the indentation of its body included. A block
 * whose first paragraph has a first-line indent opens with a blank line: typst indents no paragraph
 * that stands first in a block, and the blank line costs no room (both measured).
 */
function containerOf(
	schema: Schema,
	chips: string[],
	blockArgs: string | null,
	body: Fragment,
	was: PMNode | null,
	typGap: unknown,
	firstLine: boolean
): PMNode {
	const kept = was?.attrs ?? {};
	const attrs = {
		label: null,
		labelGap: null,
		typBodyArg: null,
		code: false,
		typIndent: kept.typIndent ?? null,
		bodyTrail: kept.bodyTrail ?? null
	};
	let lead = typeof kept.bodyLead === 'string' ? kept.bodyLead : null;
	if (blockArgs != null && firstLine && body.firstChild?.type.name === 'paragraph' && !(lead && BLANK_LINE.test(lead)))
		lead = `\n${lead ?? DEFAULT_LEAD}`;
	const inner = [...chips.map((text, at) => chipNode(schema, text, at)), ...body.content];
	// the gap the container had before it in the file is the gap it keeps, whatever it now holds
	return blockArgs == null
		? schema.nodes.typ_env.create({ ...attrs, bodyLead: lead, name: '', args: null, typGap: typGap ?? null }, inner)
		: schema.nodes.typ_env.create({ ...attrs, bodyLead: lead, name: 'block', args: blockArgs, typGap: typGap ?? null }, inner);
}

/** the settings rules and a block's arguments make, as the dialog sees them */
export function formatRules(rules: Rules, block: BlockArgs): ParaFormat {
	return {
		align: rules.align,
		justify: rules.justify,
		special: rules.special,
		indent: rules.indent,
		leading: rules.leading,
		left: block.left,
		right: block.right,
		above: block.above,
		below: block.below,
		keepTogether: block.keepTogether,
		keepWithNext: block.keepWithNext
	};
}

/** every setting at "not set": a paragraph that relies on the document's defaults */
export function noFormat(): ParaFormat {
	return formatRules(noRules(), noBlock());
}

/** the settings of a container as a patch leaves them; a field the patch does not name is kept */
function patchedHeld(held: Held, patch: Partial<ParaFormat>): Held {
	// an inset nobody can read is not written over, so no left or right indent goes beside it
	const foreign = held.block.insetForeign;
	return {
		rules: patchedRules(held.rules, patch),
		block: {
			left: foreign ? null : patch.left === undefined ? held.block.left : patch.left,
			right: foreign ? null : patch.right === undefined ? held.block.right : patch.right,
			above: patch.above === undefined ? held.block.above : patch.above,
			below: patch.below === undefined ? held.block.below : patch.below,
			keepTogether: patch.keepTogether === undefined ? held.block.keepTogether : patch.keepTogether,
			keepWithNext: patch.keepWithNext === undefined ? held.block.keepWithNext : patch.keepWithNext,
			insetRest: held.block.insetRest,
			rest: held.block.rest,
			insetForeign: foreign
		}
	};
}

/**
 * Whether a container is one a paragraph's settings can live in: a content block with no name, or
 * a block. A quote, a column, any other call is not.
 */
export function paraHolderOf(node: PMNode): '' | 'block' | null {
	if (node.type.name !== 'typ_env') return null;
	return node.attrs.name === '' ? '' : node.attrs.name === 'block' ? 'block' : null;
}

/**
 * The container the settings work on: the innermost call or content block around the caret, when
 * that is one a paragraph's settings can live in. Null in a quote, a column, any other container.
 */
export function paraHolderAt(state: EditorState): { node: PMNode; pos: number } | null {
	const here = state.selection.$from;
	for (let d = here.depth; d > 0; d--) {
		const node = here.node(d);
		if (node.type.name !== 'typ_env') continue;
		// the kind of a content block is the empty string, which is no answer to a plain `if`
		return paraHolderOf(node) === null ? null : { node, pos: here.before(d) };
	}
	return null;
}

/** what a container holds: its opening chips, and the settings read off them and off its arguments */
function heldOf(node: PMNode): Held & { chips: number } {
	const chips = leadingChips(node);
	return {
		rules: readRules(chips.texts),
		block: readBlock(node.attrs.name === 'block' ? node.attrs.args : null),
		chips: chips.count
	};
}

export type ParagraphAt = { node: PMNode; pos: number; format: ParaFormat; insetForeign: boolean };

/**
 * The settings of the paragraphs at the caret: the innermost container's. `insetForeign` when that
 * container has an inset the dialog cannot read, and so must leave alone.
 */
export function paraFormatAt(state: EditorState): ParagraphAt | null {
	const at = paraHolderAt(state);
	if (!at) return null;
	const held = heldOf(at.node);
	return { ...at, format: formatRules(held.rules, held.block), insetForeign: held.block.insetForeign };
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
 * paragraph, a selection across three takes the three. Null where a container cannot go.
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

/**
 * Give the paragraphs at the selection a setting. Inside a container its rules and arguments are
 * rewritten, and it turns into a block or back as the settings need one; with nothing left to say
 * it is unwrapped. Around other paragraphs they are wrapped.
 */
export function applyParaFormat(state: EditorState, patch: Partial<ParaFormat>): Transaction | null {
	const at = paraHolderAt(state);
	const held = at ? heldOf(at.node) : { rules: noRules(), block: noBlock(), chips: 0 };
	const next = patchedHeld(held, patch);
	const chips = chipsOf(next.rules);
	const blockArgs = blockArgsOf(next.block);
	const kept = at ? Fragment.fromArray(at.node.content.content.slice(held.chips)) : null;
	// nothing left to say: a container is unwrapped, and where there is none there is nothing to do
	if (!chips.length && blockArgs == null) {
		return at && kept ? state.tr.replaceWith(at.pos, at.pos + at.node.nodeSize, kept) : null;
	}
	const firstLine = next.rules.special === 'first-line';
	if (at && kept) {
		return state.tr.replaceWith(
			at.pos,
			at.pos + at.node.nodeSize,
			containerOf(state.schema, chips, blockArgs, kept, at.node, at.node.attrs.typGap, firstLine)
		);
	}
	const range = blockRange(state);
	if (!range) return null;
	return state.tr.replaceWith(
		range.from,
		range.to,
		containerOf(
			state.schema,
			chips,
			blockArgs,
			state.doc.slice(range.from, range.to).content,
			null,
			state.doc.nodeAt(range.from)?.attrs.typGap,
			firstLine
		)
	);
}

/** what a container gives every one of its paragraphs, as css a browser can draw */
export function paraStyle(
	format: ParaFormat,
	cssLength: (text: string) => string | null
): { box: string; firstLine: string; hanging: string } {
	const box: string[] = [];
	const side = format.align ?? (format.justify ? 'left' : null);
	if (format.justify === true && side === 'left') box.push('text-align: justify');
	else if (side) box.push(`text-align: ${side}`);
	// typst's leading is the space between lines, on top of the line's own height
	const leading = format.leading ? cssLength(format.leading) : null;
	if (leading) box.push(`line-height: calc(1em + ${leading})`);
	return {
		box: box.join('; '),
		firstLine: format.indent && format.special === 'first-line' ? (cssLength(format.indent) ?? '') : '',
		// every line but the first stands in by the measure; the first starts where the block does
		hanging: format.indent && format.special === 'hanging' ? (cssLength(format.indent) ?? '') : ''
	};
}
