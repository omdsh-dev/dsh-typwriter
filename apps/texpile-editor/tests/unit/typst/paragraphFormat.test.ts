// The paragraph settings: where they are written, how they read back, and what they draw.
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { applyParaFormat, paraFormatAt, toggled } from '$lib/languages/typst/visual/paragraphFormat';
import { paraFormatDecorations } from '$lib/languages/typst/visual/extensions/paragraphFormat/paraFormatLook';

const PLAIN = '第一段。\n\n第二段。\n\n第三段。';
const CENTERED = '#[\n  #set align(center)\n  #set par(justify: false)\n  居中的一段。\n]';

function docOf(src: string): Node {
	return typstToProseMirror(src).doc;
}
function stateOf(doc: Node): EditorState {
	return EditorState.create({ schema: doc.type.schema, doc });
}
/** the source after an edit made with the caret at `at`, as the editor writes the file back */
function edited(src: string, at: number, edit: (state: EditorState) => ReturnType<typeof applyParaFormat>): string {
	const state = stateOf(docOf(src));
	const sel = TextSelection.near(state.doc.resolve(at));
	const tr = edit(state.apply(state.tr.setSelection(sel)));
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
/** the style decorations of the first container in the document, in reading order */
function stylesOf(src: string): string[] {
	const doc = docOf(src);
	const decos = paraFormatDecorations(doc);
	const out: string[] = [];
	doc.descendants((node, pos) => {
		for (const deco of decos.find(pos, pos + node.nodeSize)) {
			if (deco.from === pos && typeof deco.spec.style === 'string') out.push(deco.spec.style);
		}
		return true;
	});
	return out;
}

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

	it('a block that opens with any other rule is not one of these', () => {
		const other = '#[\n  #set page(margin: 1cm)\n  不是段落规则。\n]';
		expect(docOf(other).firstChild!.type.name).toBe('raw_latex');
		expect(saved(other)).toBe(other);
	});

	it('reads back what the rules say', () => {
		const state = stateOf(docOf(CENTERED));
		const format = paraFormatAt(
			state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(caretIn(CENTERED, '居中')))))
		)?.format;
		expect(format).toEqual({ align: 'center', justify: false, indent: null, leading: null });
	});
});

describe('the paragraph settings', () => {
	it('wrap the paragraph at the caret in a new block', () => {
		const out = edited(PLAIN, caretIn(PLAIN, '第二段'), (state) => applyParaFormat(state, { align: 'center', justify: false }));
		expect(out).toBe('第一段。\n\n#[\n  #set align(center)\n  #set par(justify: false)\n\n  第二段。\n]\n\n第三段。');
		expect(saved(out)).toBe(out);
	});

	it('reach every paragraph the selection touches', () => {
		const out = edited(PLAIN, caretIn(PLAIN, '第一段'), (state) => {
			const doc = state.doc;
			const from = caretIn(PLAIN, '第一段');
			const to = caretIn(PLAIN, '第三段');
			const both = state.apply(state.tr.setSelection(TextSelection.create(doc, from, to)));
			return applyParaFormat(both, { justify: true });
		});
		expect(out).toContain('#set par(justify: true)');
		expect(out.startsWith('#[\n  #set par(justify: true)\n\n  第一段。')).toBe(true);
		expect(out.endsWith('第三段。\n]')).toBe(true);
	});

	it('rewrite the chips of the block the caret is in', () => {
		const out = edited(CENTERED, caretIn(CENTERED, '居中'), (state) =>
			applyParaFormat(state, { align: 'right', indent: '2em', leading: '1em' })
		);
		expect(out).toBe('#[\n  #set align(right)\n  #set par(justify: false, first-line-indent: 2em, leading: 1em)\n  居中的一段。\n]');
		expect(saved(out)).toBe(out);
	});

	it('are taken away one by one, and the block with the last of them', () => {
		const indented = edited(PLAIN, caretIn(PLAIN, '第二段'), (state) => applyParaFormat(state, { indent: '2em' }));
		expect(indented).toContain('#set par(first-line-indent: 2em)');
		expect(edited(indented, caretIn(indented, '第二段'), (state) => applyParaFormat(state, { indent: null }))).toBe(PLAIN);
	});

	it('keep what else the rules said', () => {
		const own = '#[\n  #set text(size: 9pt)\n  #set par(spacing: 1.2em)\n  小字。\n]';
		const out = edited(own, caretIn(own, '小字'), (state) => applyParaFormat(state, { align: 'center' }));
		expect(out).toContain('#set align(center)');
		expect(out).toContain('#set text(size: 9pt)');
		expect(out).toContain('#set par(spacing: 1.2em)');
		expect(saved(out)).toBe(out);
	});

	it('goes into a list item too, as the content of that item', () => {
		const list = '- 第一项\n- 第二项';
		const out = edited(list, caretIn(list, '第一'), (state) => applyParaFormat(state, { align: 'center' }));
		expect(out).toContain('#set align(center)');
		expect(out).toContain('第一项');
		expect(out.endsWith('- 第二项')).toBe(true);
		expect(saved(out)).toBe(out);
	});
});

describe('the alignment buttons', () => {
	it('press the side the paragraphs are already on, and the setting comes off', () => {
		expect(toggled(null, 'center')).toEqual({ align: 'center', justify: false });
		expect(toggled({ align: 'center', justify: false, indent: null, leading: null }, 'center')).toEqual({ align: null, justify: null });
		expect(toggled({ align: 'center', justify: false, indent: null, leading: null }, 'left')).toEqual({ align: 'left', justify: false });
	});

	it('justified is its own state, on the start side', () => {
		expect(toggled({ align: 'left', justify: true, indent: null, leading: null }, 'left', true)).toEqual({ align: null, justify: null });
		expect(toggled({ align: 'left', justify: false, indent: null, leading: null }, 'left', true)).toEqual({ align: 'left', justify: true });
	});
});

describe('what the editor draws of it', () => {
	it("the side the text hugs, the first line's indent, the space between lines", () => {
		const src = '#[\n  #set align(center)\n  #set par(first-line-indent: 2em, leading: 1em)\n  居中的一段。\n]';
		expect(stylesOf(src)).toEqual(['text-align: center; line-height: calc(1em + 1em)', 'text-indent: 2em']);
	});

	it('justified text is justified', () => {
		const src = '#[\n  #set par(justify: true)\n  两端对齐。\n]';
		expect(stylesOf(src)).toEqual(['text-align: justify']);
	});
});
