// The paragraph settings: where they are written, how they read back, and what they draw.
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import type { DecorationSet } from 'prosemirror-view';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { applyParaFormat, paraFormatAt, type ParaFormat } from '$lib/languages/typst/visual/paragraphFormat';
import { paraFormatDecorations, paraFormatLook } from '$lib/languages/typst/visual/extensions/paragraphFormat/paraFormatLook';

const PLAIN = '第一段。\n\n第二段。\n\n第三段。';
const CENTERED = '#[\n  #set align(center)\n  #set par(justify: false)\n  居中的一段。\n]';
const SPACED =
	'#block(above: 1em, below: 0.5em, inset: (left: 2em, right: 1em), breakable: false, sticky: true)[\n  #set par(justify: false)\n  一段。\n]';
const CLEAR: Partial<ParaFormat> = {
	justify: null,
	left: null,
	right: null,
	above: null,
	below: null,
	keepTogether: null,
	keepWithNext: null
};

function docOf(src: string): Node {
	return typstToProseMirror(src).doc;
}
function stateOf(doc: Node, plugins?: Parameters<typeof EditorState.create>[0] extends { plugins?: infer P } ? P : never): EditorState {
	return EditorState.create({ schema: doc.type.schema, doc, plugins });
}
function stateAt(
	doc: Node,
	at: number,
	plugins?: Parameters<typeof EditorState.create>[0] extends { plugins?: infer P } ? P : never
): EditorState {
	const state = stateOf(doc, plugins);
	return state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(at))));
}
/** the source after an edit made with the caret at `at`, as the editor writes the file back */
function edited(src: string, at: number, edit: (state: EditorState) => ReturnType<typeof applyParaFormat>): string {
	const tr = edit(stateAt(docOf(src), at));
	return serializeToTypst(tr!.doc).trimEnd();
}
/** where the text `needle` starts in the parsed document */
function caretIn(src: string, needle: string): number {
	const doc = docOf(src);
	let at = -1;
	doc.descendants((node, pos) => {
		if (node.isText && node.text?.includes(needle) && at < 0) at = pos + 1;
		return at < 0;
	});
	if (at < 0) throw new Error(`no "${needle}" in the document`);
	return at;
}
const saved = (src: string) => {
	const parsed = parseTypstFile(src);
	return serializeTypstFile(parsed, parsed.doc).trimEnd();
};
/** what the dialog reads at the caret `at` of `src` */
function formatAt(src: string, needle: string) {
	return paraFormatAt(stateAt(docOf(src), caretIn(src, needle)));
}
type Mark = { node: string; text: string; class: string; style: string; mark: string };
/** the decorations that lie exactly on a node, in document order: its class, its style, and the mark its chips carry */
function marksOf(state: EditorState): Mark[] {
	const decos = paraFormatLook.getState(state) ?? paraFormatDecorations(state.doc);
	const out: Mark[] = [];
	state.doc.descendants((node, pos) => {
		for (const deco of decos.find(pos, pos + node.nodeSize)) {
			if (deco.from === pos && deco.to === pos + node.nodeSize)
				out.push({
					node: node.type.name,
					text: node.isTextblock ? node.textContent.slice(0, 14) : '',
					class: deco.spec.class ?? '',
					style: deco.spec.style ?? '',
					mark: deco.spec['data-chip-mark'] ?? ''
				});
		}
		return true;
	});
	return out;
}
const on = (src: string) => marksOf(stateOf(docOf(src)));

describe('a block that opens with paragraph rules', () => {
	it('opens as a container with its text editable, and is written back as it was', () => {
		const doc = docOf(CENTERED);
		expect(doc.firstChild!.type.name).toBe('typ_env');
		expect(doc.firstChild!.attrs.name).toBe('');
		const inner: string[] = [];
		doc.firstChild!.forEach((child) => inner.push(child.type.name === 'paragraph' ? 'paragraph' : child.textContent));
		expect(inner).toEqual(['#set align(center)', '#set par(justify: false)', 'paragraph']);
		expect(saved(CENTERED)).toBe(CENTERED);
	});

	it('a block with arguments opens as one too, arguments and all', () => {
		const doc = docOf(SPACED);
		const env = doc.firstChild!;
		expect(env.type.name).toBe('typ_env');
		expect(env.attrs.name).toBe('block');
		expect(env.attrs.args).toBe('above: 1em, below: 0.5em, inset: (left: 2em, right: 1em), breakable: false, sticky: true');
		expect(saved(SPACED)).toBe(SPACED);
		expect(formatAt(SPACED, '一段')?.format).toEqual({
			align: null,
			justify: false,
			special: null,
			indent: null,
			leading: null,
			left: '2em',
			right: '1em',
			above: '1em',
			below: '0.5em',
			keepTogether: true,
			keepWithNext: true
		});
	});

	it('a quote is no container for them: inside one, the paragraph gets a container of its own', () => {
		const src = '#quote(blockquote: true)[\n  引文。\n]';
		expect(formatAt(src, '引文')).toBeNull();
		const out = edited(src, caretIn(src, '引文'), (state) => applyParaFormat(state, { align: 'center' }));
		expect(out).toContain('#set align(center)');
		expect(out.startsWith('#quote(blockquote: true)[')).toBe(true);
		expect(out.trimEnd().endsWith(']')).toBe(true);
		expect(saved(out)).toBe(out);
	});
});

describe('what a paragraph with no settings of its own is given', () => {
	it('a first-line indent is written so that it indents the paragraph it was set on, first after a heading or not', () => {
		const out = edited(PLAIN, caretIn(PLAIN, '第二段'), (state) => applyParaFormat(state, { special: 'first-line', indent: '2em' }));
		expect(out).toBe('第一段。\n\n#[\n  #set par(first-line-indent: (amount: 2em, all: true))\n\n  第二段。\n]\n\n第三段。');
		expect(saved(out)).toBe(out);
	});

	it('a hanging indent says that the first line has none, whatever the defaults say', () => {
		const out = edited(PLAIN, caretIn(PLAIN, '第二段'), (state) => applyParaFormat(state, { special: 'hanging', indent: '2em' }));
		expect(out).toContain('#[\n  #set par(first-line-indent: 0em, hanging-indent: 2em)\n\n  第二段。\n]');
	});

	it('no special indent is written out too, for a paragraph that is to have none where others have one', () => {
		const out = edited(PLAIN, caretIn(PLAIN, '第二段'), (state) => applyParaFormat(state, { special: 'none' }));
		expect(out).toContain('#set par(first-line-indent: 0em)');
	});

	it('a left and right indent, space before and after, and the two page rules go in a block around the paragraphs', () => {
		const patch: Partial<ParaFormat> = { left: '2em', right: '1em', above: '1em', below: '0.5em', keepTogether: true, keepWithNext: true };
		const out = edited(PLAIN, caretIn(PLAIN, '第二段'), (state) => applyParaFormat(state, patch));
		expect(out).toBe(
			'第一段。\n\n#block(above: 1em, below: 0.5em, inset: (left: 2em, right: 1em), breakable: false, sticky: true)[\n  第二段。\n]\n\n第三段。'
		);
		expect(saved(out)).toBe(out);
	});

	it('a setting added to a container makes it a block, and the last of them removed makes it a content block again', () => {
		const spaced = edited(CENTERED, caretIn(CENTERED, '居中'), (state) => applyParaFormat(state, { above: '1em' }));
		expect(spaced.startsWith('#block(above: 1em)[\n  #set align(center)\n  #set par(justify: false)\n  居中的一段。\n]')).toBe(true);
		expect(saved(spaced)).toBe(spaced);
		expect(edited(spaced, caretIn(spaced, '居中'), (state) => applyParaFormat(state, { above: null }))).toBe(CENTERED);
	});

	it('the gap a container had before it in the file is the gap it keeps', () => {
		const src = '= 标题\n紧随的一段。\n\n另一段。';
		const out = edited(src, caretIn(src, '紧随'), (state) => applyParaFormat(state, { align: 'center' }));
		expect(out).toBe('= 标题\n#[\n  #set align(center)\n  紧随的一段。\n]\n\n另一段。');
		expect(saved(out)).toBe(out);
	});

	it('a paragraph with nothing left to say is unwrapped, block and all', () => {
		expect(edited(SPACED, caretIn(SPACED, '一段'), (state) => applyParaFormat(state, CLEAR))).toBe('一段。');
	});

	it('a block whose paragraph has a first-line indent opens with a blank line: typst indents no paragraph that stands first in a block, and the blank line costs no room', () => {
		const patch: Partial<ParaFormat> = { above: '1em', special: 'first-line', indent: '2em' };
		const out = edited(PLAIN, caretIn(PLAIN, '第二段'), (state) => applyParaFormat(state, patch));
		expect(out).toBe(
			'第一段。\n\n#block(above: 1em)[\n\n  #set par(first-line-indent: (amount: 2em, all: true))\n\n  第二段。\n]\n\n第三段。'
		);
		expect(saved(out)).toBe(out);
		// and one the file wrote that way keeps its blank line through an edit
		const written = '#block(above: 1em)[\n\n  #set par(first-line-indent: 2em)\n  一段。\n]';
		expect(edited(written, caretIn(written, '一段'), (state) => applyParaFormat(state, { above: '2em' }))).toBe(
			'#block(above: 2em)[\n\n  #set par(first-line-indent: 2em)\n  一段。\n]'
		);
	});

	it('the indentation the file gave a container is the indentation it keeps', () => {
		const src = '- 列表项\n  #block(above: 1em)[\n    #set par(justify: false)\n    一段。\n  ]';
		const out = edited(src, caretIn(src, '一段'), (state) => applyParaFormat(state, { justify: true }));
		// a container the dialog rewrote is a new block to the serializer, which sets a new block off with a blank line
		expect(out).toBe('- 列表项\n\n  #block(above: 1em)[\n    #set par(justify: true)\n    一段。\n  ]');
		expect(saved(out)).toBe(out);
	});

	it('a paragraph set ragged reads as left-aligned, as it is in Word', () => {
		const ragged = '#[\n  #set par(justify: false)\n  一段。\n]';
		expect(formatAt(ragged, '一段')?.format).toMatchObject({ align: null, justify: false });
	});
});

describe('what the rules read back', () => {
	const read = (rule: string) => {
		const { special, indent } = formatAt(`#[\n  ${rule}\n  一段。\n]`, '一段')!.format;
		return { special, indent };
	};

	it('the two indents, and none written out', () => {
		expect(read('#set par(first-line-indent: 2em)')).toEqual({ special: 'first-line', indent: '2em' });
		expect(read('#set par(first-line-indent: (amount: 2em, all: true))')).toEqual({ special: 'first-line', indent: '2em' });
		expect(read('#set par(hanging-indent: 2em)')).toEqual({ special: 'hanging', indent: '2em' });
		expect(read('#set par(first-line-indent: 0em)')).toEqual({ special: 'none', indent: null });
	});

	it('a paragraph indented both ways reads as hanging, and keeps its first line as written', () => {
		const src = '#[\n  #set par(first-line-indent: 1em, hanging-indent: 2em)\n  一段。\n]';
		expect(formatAt(src, '一段')?.format).toMatchObject({ special: 'hanging', indent: '2em' });
		const out = edited(src, caretIn(src, '一段'), (state) => applyParaFormat(state, { indent: '3em' }));
		expect(out).toContain('#set par(first-line-indent: 1em, hanging-indent: 3em)');
	});

	it('a first-line indent that is already a dict keeps its form when its measure changes', () => {
		const src = '#[\n  #set par(first-line-indent: (amount: 2em, all: false))\n  一段。\n]';
		const out = edited(src, caretIn(src, '一段'), (state) => applyParaFormat(state, { indent: '3em' }));
		expect(out).toContain('#set par(first-line-indent: (amount: 3em, all: false))');
	});

	it('arguments of par the dialog has no field for stay as they were written', () => {
		const src = '#[\n  #set par(justify: false, spacing: 2em, line-numbering: "off")\n  一段。\n]';
		const out = edited(src, caretIn(src, '一段'), (state) => applyParaFormat(state, { justify: true }));
		expect(out).toContain('#set par(justify: true, spacing: 2em, line-numbering: "off")');
	});
});

describe('a block the dialog did not write', () => {
	it('keeps the arguments it does not know, and rewrites only its own', () => {
		const src = '#block(width: 80%, fill: red, above: 1em)[\n  #set par(justify: false)\n  一段。\n]';
		const out = edited(src, caretIn(src, '一段'), (state) => applyParaFormat(state, { above: '2em' }));
		expect(out).toBe('#block(above: 2em, width: 80%, fill: red)[\n  #set par(justify: false)\n  一段。\n]');
		expect(saved(out)).toBe(out);
	});

	it('an inset that is not a dictionary of sides is left alone', () => {
		const src = '#block(inset: 2em)[\n  #set par(justify: false)\n  一段。\n]';
		expect(formatAt(src, '一段')?.insetForeign).toBe(true);
		expect(edited(src, caretIn(src, '一段'), (state) => applyParaFormat(state, { left: '3em' }))).toBe(src);
	});

	it('the other sides of an inset stay beside the left and right', () => {
		const src = '#block(inset: (x: 1em, top: 2pt))[\n  #set par(justify: false)\n  一段。\n]';
		const out = edited(src, caretIn(src, '一段'), (state) => applyParaFormat(state, { left: '3em' }));
		expect(out).toContain('inset: (x: 1em, top: 2pt, left: 3em)');
	});
});

describe('what is drawn', () => {
	it('the rules that open a container are marks, standing in the first line’s indent', () => {
		const src = '#[\n  #set align(center)\n  #set par(justify: false, first-line-indent: 2em)\n  居中的一段。\n]';
		expect(on(src)).toEqual([
			{ node: 'typ_env', text: '', class: 'typ-par-holder typ-par-flow typ-par-marked', style: 'text-align: center', mark: '' },
			{ node: 'raw_latex', text: '#set align(cen', class: 'typ-par-rule', style: '', mark: 'first' },
			{ node: 'raw_latex', text: '#set par(justi', class: 'typ-par-rule', style: '', mark: 'more' },
			// an indent of two characters has room for the mark, and stays the indent it is
			{ node: 'paragraph', text: '居中的一段。', class: '', style: 'text-indent: 2em', mark: '' }
		]);
		// a smaller one, or none, and the first line makes room
		expect(on('#[\n  #set par(first-line-indent: 0.5em)\n  一段。\n]').at(-1)?.style).toBe('text-indent: calc(1.4em + 0.5em)');
		expect(on('#[\n  #set par(leading: 1em)\n  一段。\n]').at(-1)?.style).toBe('text-indent: 1.4em');
	});

	it('a content block with a paragraph in it is drawn as no box; one of rules alone keeps the box the environment has', () => {
		expect(on(CENTERED)[0]?.class).toContain('typ-par-flow');
		expect(on('#[\n  #set text(size: 12pt)\n  #set par(justify: false)\n]')[0]?.class).toBe('typ-par-holder');
	});

	it('a hanging indent moves every line but the first, and the first starts after the mark', () => {
		expect(on('#[\n  #set par(first-line-indent: 0em, hanging-indent: 2em)\n  一段。\n]').at(-1)?.style).toBe(
			'padding-left: 2em; text-indent: calc(1.4em - 2em)'
		);
	});

	it('a block lets its own view draw the room around its paragraphs, and styles the paragraphs alone', () => {
		const out = on(SPACED);
		expect(out[0]).toEqual({ node: 'typ_env', text: '', class: 'typ-par-holder typ-par-marked', style: '', mark: '' });
		// a block's own view paints the room around its paragraphs: nothing of it is styled here, only the paragraph's indent
		expect(out.at(-1)).toMatchObject({ node: 'paragraph', style: 'text-indent: 1.4em' });
	});

	it("a rule that isn't the paragraph's own, opening the container, keeps the look of code", () => {
		const src = '#[\n  #set text(size: 12pt)\n  #set par(justify: false)\n  一段。\n]';
		const out = on(src);
		expect(out.filter((entry) => entry.mark)).toEqual([]);
		expect(out[0]?.class).toBe('typ-par-holder typ-par-flow');
	});

	it('the container the caret is in is marked, and only that one', () => {
		const doc = docOf(`${CENTERED}\n\n另一段。\n\n#set par(leading: 1em)\n#[\n  #set align(right)\n  靠右的一段。\n]`);
		const inside = stateAt(doc, caretIn(serializeToTypst(doc), '靠右的'), [paraFormatLook]);
		const active = (state: EditorState) =>
			(paraFormatLook.getState(state) as DecorationSet).find().filter((deco) => deco.spec.class === 'typ-par-active');
		const plain = stateAt(doc, caretIn(serializeToTypst(doc), '另一段'), [paraFormatLook]);
		expect(active(plain)).toEqual([]);
		const marked = active(inside);
		expect(marked).toHaveLength(1);
		expect(doc.resolve(marked[0]!.from).nodeAfter?.attrs.name).toBe('');
		expect(marksOf(inside).filter((entry) => entry.class.includes('typ-par-active'))).toHaveLength(1);
	});
});
