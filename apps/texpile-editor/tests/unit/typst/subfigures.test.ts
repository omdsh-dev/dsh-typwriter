// Sub-figures side by side: a figure whose body is a grid with an image in each cell. Typst numbers
// each inner figure as part of the outer one (1a, 1b); the editor reads and writes the structure as
// it is, so the one thing to add was a way to insert the frame.
import { describe, it, expect } from 'vitest';
import type { Node } from 'prosemirror-model';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { typSubfiguresNode } from '$lib/languages/typst/visual/typstTableNodes';
import { typstPlugins } from '$lib/languages/typst/visual/typstPlugins';

const EMPTY = '#figure([\n  #grid(columns: 2, [], [])\n], caption: [])\n';
const FILLED =
	'#figure(\n  grid(columns: 2, figure(image("a.png"), caption: [左]), figure(image("b.png"), caption: [右])),\n  caption: [实验装置],\n)\n<fig:setup>\n';
const FRAME = ['typ_figure', 'typ_grid[columns: 2,]', 'typ_grid_cell', 'paragraph', 'typ_grid_cell', 'paragraph', 'typ_figure_caption'];

/** the skeleton of a document: its block nodes, grid cells and images, in reading order */
function skeleton(doc: Node): string[] {
	const out: string[] = [];
	doc.descendants((node) => {
		if (node.isText) return false;
		out.push(
			node.type.name === 'image'
				? `image(${String(node.attrs.src)})`
				: node.type.name + (node.type.name === 'typ_grid' ? `[${String(node.attrs.args).trim()}]` : '')
		);
		return node.type.name !== 'image';
	});
	return out;
}
const saved = (src: string) => {
	const parsed = parseTypstFile(src);
	return serializeTypstFile(parsed, parsed.doc);
};

describe('images side by side', () => {
	it('the frame the insert menu makes is a figure of a two-cell grid', () => {
		const schema = typstToProseMirror('x').doc.type.schema;
		const doc = schema.nodes.doc.create({ typFile: null }, [typSubfiguresNode(schema)]);
		const out = serializeToTypst(doc);
		// the document drops its last line end on the way out; the file has one
		expect(out).toBe(EMPTY.trimEnd());
		expect(skeleton(typstToProseMirror(EMPTY).doc)).toEqual(FRAME);
		expect(saved(`${out}\n`)).toBe(EMPTY);
	});

	it('is among the common blocks of the insert menu', () => {
		const schema = typstToProseMirror('x').doc.type.schema;
		const item = typstPlugins.flatMap((plugin) => plugin.insert?.() ?? []).find((entry) => entry.id === 'subfigures');
		expect(item?.category).toBe('common');
		expect(item?.shape === 'block' ? item.make(schema)?.type.name : null).toBe('typ_figure');
	});

	it('a figure already written this way opens with every image in its cell, and is written back as it was', () => {
		expect(skeleton(typstToProseMirror(FILLED).doc)).toEqual([
			'typ_figure',
			'typ_grid[columns: 2,]',
			'typ_grid_cell',
			'image(a.png)',
			'typ_grid_cell',
			'image(b.png)',
			'typ_figure_caption'
		]);
		expect(saved(FILLED)).toBe(FILLED);
	});

	it('three in a row', () => {
		const schema = typstToProseMirror('x').doc.type.schema;
		const out = serializeToTypst(schema.nodes.doc.create({ typFile: null }, [typSubfiguresNode(schema, 3)]));
		expect(out).toContain('columns: 3, [], [], []');
		expect(saved(`${out}\n`).trimEnd()).toBe(out);
	});
});
