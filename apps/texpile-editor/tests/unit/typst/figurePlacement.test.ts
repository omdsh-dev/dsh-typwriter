// Where a figure sits: floating, as typst places it, or kept where it is written.
import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { figurePlacement, withPlacement } from '$lib/languages/typst/visual/serialize/figurePlacement';

const FIGURE = '#figure(image("a.png", width: 70%), caption: [实验装置])\n<fig:setup>\n';
const FIXED = '#figure(image("a.png", width: 70%), caption: [实验装置], placement: none)\n<fig:setup>\n';

function docOf(src: string): Node {
	return typstToProseMirror(src).doc;
}
function imageOf(doc: Node): { node: Node; pos: number } {
	let found: { node: Node; pos: number } | null = null;
	doc.descendants((node, pos) => {
		if (node.type.name !== 'image') return true;
		found = { node, pos };
		return false;
	});
	if (!found) throw new Error('no image in the document');
	return found;
}
const saved = (src: string) => {
	const parsed = parseTypstFile(src);
	return serializeTypstFile(parsed, parsed.doc);
};
/** the file after the image's figure is given another placement */
function edited(src: string, placement: 'auto' | 'fixed'): string {
	const doc = docOf(src);
	const state = EditorState.create({ schema: doc.type.schema, doc });
	const { node, pos } = imageOf(doc);
	// the document drops its last line end on the way out; the file has one
	return (
		serializeToTypst(
			state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, typFigure: withPlacement(node.attrs.typFigure, placement) }).doc
		).trimEnd() + '\n'
	);
}

describe('where a figure sits', () => {
	it('floats unless the figure says otherwise', () => {
		expect(figurePlacement(imageOf(docOf(FIGURE)).node.attrs.typFigure)).toBe('auto');
		expect(saved(FIGURE)).toBe(FIGURE);
	});

	it('is kept where it is written: placement: none follows the other arguments', () => {
		const out = edited(FIGURE, 'fixed');
		expect(out).toBe(FIXED);
		expect(figurePlacement(imageOf(docOf(out)).node.attrs.typFigure)).toBe('fixed');
		expect(saved(out)).toBe(FIXED);
	});

	it('floats again: the argument goes, and the file is as it was', () => {
		expect(edited(FIXED, 'auto')).toBe(FIGURE);
		expect(saved(FIXED)).toBe(FIXED);
	});

	it('a placement written another way is left as it is', () => {
		const own = '#figure(image("a.png"), placement: auto)\n';
		expect(figurePlacement(imageOf(docOf(own)).node.attrs.typFigure)).toBe('other');
		expect(edited(own, 'auto')).toBe(own);
		expect(saved(own)).toBe(own);
	});

	it('a bare image has no placement: it never floats', () => {
		const bare = '#image("a.png")\n';
		expect(figurePlacement(imageOf(docOf(bare)).node.attrs.typFigure)).toBeNull();
	});
});
