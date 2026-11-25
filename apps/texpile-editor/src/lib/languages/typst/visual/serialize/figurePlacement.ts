// Where a figure sits. Typst floats a figure to where it fits the page, and keeps it where it is
// written when the figure says `placement: none`. The figure's other arguments are kept as the
// file wrote them (convert/reading/callArgs.ts); this reads its placement from among them and
// sets it there.
import type { CallArgs, CallItem } from '../convert/reading/callArgs';
import { isCallArgs, withItem } from './elements/callSource';

/** auto: typst places it; fixed: it stays where it is written; other: a placement the editor does not model */
export type FigurePlacement = 'auto' | 'fixed' | 'other';

/** the value of `placement:` as one argument writes it, null for any other argument */
function placementOf(item: CallItem): string | null {
	if (item.role !== 'arg') return null;
	return /^\s*placement\s*:\s*(.*?)\s*$/.exec(item.text)?.[1] ?? null;
}

/** null for anything that is not a figure's arguments: a bare image never floats */
export function figurePlacement(args: unknown): FigurePlacement | null {
	if (!isCallArgs(args)) return null;
	let written: string | null = null;
	for (const item of args.items) written = placementOf(item) ?? written;
	if (written == null) return 'auto';
	return written === 'none' ? 'fixed' : 'other';
}

/**
 * The same arguments with the figure kept where it is written, or floating again. `auto` takes a
 * `none` away and leaves any other placement as it was written.
 */
export function withPlacement(args: CallArgs, placement: 'auto' | 'fixed'): CallArgs {
	const at = args.items.findIndex((item) => placementOf(item) != null);
	if (placement === 'auto') {
		if (at < 0 || figurePlacement(args) !== 'fixed') return args;
		return { ...args, items: args.items.filter((_item, i) => i !== at) };
	}
	if (at >= 0) return { ...args, items: args.items.map((item, i) => (i === at ? { ...item, text: 'placement: none' } : item)) };
	// after the last argument, separated from it the way the others are from each other
	return { ...args, items: withItem(args.items, { role: 'arg', text: 'placement: none' }, args.items.length - 1) };
}
