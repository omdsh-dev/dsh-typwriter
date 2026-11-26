// The arguments of the block that wraps a few paragraphs when Typst has no set rule for a setting:
// read off as the dialog needs them, and written back with everything else as it was.
import { describe, it, expect } from 'vitest';
import { blockArgsOf, noBlock, readBlock } from '$lib/languages/typst/visual/paragraphBlock';

describe('the arguments of a block', () => {
	it('none, for a block with no arguments and for no block at all', () => {
		expect(readBlock(null)).toEqual(noBlock());
		expect(readBlock('')).toEqual(noBlock());
		expect(blockArgsOf(noBlock())).toBeNull();
	});

	it('the room around the paragraphs, and the two page rules', () => {
		expect(readBlock('above: 1em, below: 0.5em, inset: (left: 2em, right: 1em), breakable: false, sticky: true')).toEqual({
			...noBlock(),
			above: '1em',
			below: '0.5em',
			left: '2em',
			right: '1em',
			keepTogether: true,
			keepWithNext: true
		});
	});

	it("`auto` is typst's own word for no value", () => {
		expect(readBlock('above: auto, below: auto, breakable: true, sticky: false, inset: auto')).toEqual(noBlock());
	});

	it('a setting that comes back to default comes off the arguments', () => {
		const read = readBlock('above: 1em, inset: (left: 2em), breakable: false');
		expect(blockArgsOf({ ...read, above: null, keepTogether: null, left: null })).toBeNull();
	});
});
