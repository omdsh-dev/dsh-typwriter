// What goes around a few paragraphs when Typst has no set rule for it: space before and after, a
// left or right indent, staying on one page. It is the arguments of the `block` that wraps them,
//
//   #block(above: 1em, inset: (left: 2em))[ ... ]
//
// kept as the file wrote them, with the ones the paragraph dialog sets read off and put back.
import { readTypstCall, type CallArg } from '$lib/languages/typst/visual/core';
import { children } from './convert/reading/syntaxUtils';
import type { ParaFormat } from './paragraphFormat';

type BlockFields = Pick<ParaFormat, 'left' | 'right' | 'above' | 'below' | 'keepTogether' | 'keepWithNext'>;
export type BlockArgs = BlockFields & {
	/** entries of the inset dictionary that are not left or right, as written */
	insetRest: string[];
	/** every argument that is none of the above, as written */
	rest: string[];
	/** an inset the editor cannot read as left and right (a single length, a variable): kept whole, not written over */
	insetForeign: boolean;
};

export function noBlock(): BlockArgs {
	return {
		left: null,
		right: null,
		above: null,
		below: null,
		keepTogether: null,
		keepWithNext: null,
		insetRest: [],
		rest: [],
		insetForeign: false
	};
}

/** a typst length as a person writes it: a number and a unit */
const LENGTH = /^[0-9]*\.?[0-9]+\s*(em|pt|mm|cm|in)$/;

/** a syntax node's bytes within the text its argument was read from */
function callText(arg: CallArg, node: { from: number; to: number }): string {
	return arg.value.slice(node.from - arg.node.from, node.to - arg.node.from);
}

/** the dictionary's entries as the file wrote them, by key */
export function dictionaryEntries(arg: CallArg): { key: string; text: string }[] {
	if (arg.kind !== 'Dict') return [];
	const entries: { key: string; text: string }[] = [];
	for (const entry of children(arg.node)) {
		if (entry.name !== 'Named') continue;
		const parts = children(entry);
		const key = parts[0];
		const value = parts.slice(parts.findIndex((c) => c.name === 'Colon') + 1).find((c) => c.name !== 'Space');
		if (key && value) entries.push({ key: callText(arg, key), text: callText(arg, entry) });
	}
	return entries;
}

/** the bytes an argument takes up in the text its call was read from */
function asWritten(source: string, arg: CallArg): string {
	return source.slice(arg.from, arg.to);
}

/** the arguments between a block's parentheses, as the paragraph dialog reads them */
export function readBlock(args: unknown): BlockArgs {
	const out = noBlock();
	if (typeof args !== 'string' || !args.trim()) return out;
	const call = readTypstCall(`#block(${args})`);
	// not something the reader can take apart: kept whole
	if (!call) return { ...out, rest: [args] };
	for (const arg of call.args) {
		// `auto` is typst's own word for no value
		const value = arg.value === 'auto' ? '' : arg.value;
		switch (arg.name) {
			case 'above':
			case 'below':
				if (LENGTH.test(value)) out[arg.name] = value;
				else if (value) out.rest.push(asWritten(call.source, arg));
				break;
			case 'breakable':
				// false asks for what the checkbox says; true, the word typst has for it, asks for nothing
				if (arg.kind === 'Bool') {
					if (value === 'false') out.keepTogether = true;
				} else out.rest.push(asWritten(call.source, arg));
				break;
			case 'sticky':
				if (arg.kind === 'Bool') {
					if (value === 'true') out.keepWithNext = true;
				} else out.rest.push(asWritten(call.source, arg));
				break;
			case 'inset': {
				// `auto` is no inset of the dialog's, whatever typst makes of it
				if (!value) break;
				const entries = dictionaryEntries(arg);
				// anything but a dictionary of entries (a single length, a variable, the empty `()`) is not read as sides
				if (arg.kind !== 'Dict' || entries.length === 0) {
					out.insetForeign = true;
					out.rest.push(asWritten(call.source, arg));
					break;
				}
				for (const entry of entries) {
					const valueText = entry.text.slice(entry.text.indexOf(':') + 1).trim();
					if ((entry.key === 'left' || entry.key === 'right') && LENGTH.test(valueText)) out[entry.key] = valueText;
					else out.insetRest.push(entry.text);
				}
				break;
			}
			default:
				out.rest.push(asWritten(call.source, arg));
		}
	}
	return out;
}

/** the block's arguments as they are written between its parentheses; null when it would say nothing */
export function blockArgsOf(block: BlockArgs): string | null {
	const out: string[] = [];
	if (block.above) out.push(`above: ${block.above}`);
	if (block.below) out.push(`below: ${block.below}`);
	// an inset nobody can read sits whole among the other arguments; one that is read is written back,
	// its other sides (a top, a rest) kept beside the left and right
	if (!block.insetForeign) {
		const sides = [...block.insetRest];
		if (block.left) sides.push(`left: ${block.left}`);
		if (block.right) sides.push(`right: ${block.right}`);
		if (sides.length) out.push(`inset: (${sides.join(', ')})`);
	}
	if (block.keepTogether) out.push('breakable: false');
	if (block.keepWithNext) out.push('sticky: true');
	return out.length + block.rest.length ? [...out, ...block.rest].join(', ') : null;
}
