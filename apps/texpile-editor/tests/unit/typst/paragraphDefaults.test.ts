// The document's own paragraph defaults: the rules at the top of the paper file that every paragraph
// falls back on, and the dialog's Default button that writes them there.
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { applyDocumentDefaults, documentDefaults } from '$lib/languages/typst/visual/paragraphDefaults';
import type { RuleFields } from '$lib/languages/typst/visual/paragraphFormat';

const TOP = '#import "@preview/unithesis:0.1.0": *\n#show: unithesis.with(title: [题目])\n\n#set par(justify: true)\n\n= 绪论\n\n正文。\n';

function stateOf(src: string): EditorState {
	const doc = typstToProseMirror(src).doc;
	const state = EditorState.create({ schema: doc.type.schema, doc });
	return state.apply(state.tr.setSelection(TextSelection.near(doc.resolve(doc.content.size - 1))));
}
/** the file after the Default button said `patch`, as the editor writes it */
const defaulted = (src: string, patch: Partial<RuleFields>) => serializeToTypst(applyDocumentDefaults(stateOf(src), patch).doc).trimEnd();
const saved = (src: string) => {
	const parsed = parseTypstFile(src);
	return serializeTypstFile(parsed, parsed.doc).trimEnd();
};

describe('the rules at the top of the file', () => {
	it('are read off the chips that open the file, and nowhere else', () => {
		expect(documentDefaults(stateOf(TOP)).format).toEqual({ align: null, justify: true, special: null, indent: null, leading: null });
		expect(documentDefaults(stateOf('正文。\n\n#set par(justify: true)\n\n更多。')).format).toEqual({
			align: null,
			justify: null,
			special: null,
			indent: null,
			leading: null
		});
	});

	it('a file with none says nothing', () => {
		expect(documentDefaults(stateOf('正文。')).managed).toEqual([]);
	});
});

describe('the Default button', () => {
	it('rewrites the rules there, in place of the last of them', () => {
		expect(defaulted(TOP, { justify: true, special: 'first-line', indent: '2em' })).toBe(
			'#import "@preview/unithesis:0.1.0": *\n#show: unithesis.with(title: [题目])\n\n#set par(justify: true, first-line-indent: (amount: 2em, all: true))\n\n= 绪论\n\n正文。'
		);
	});

	it('puts them at the top of a file that has none, after its other opening rules', () => {
		const out = defaulted(TOP.replace('\n\n#set par(justify: true)', ''), { align: 'center', justify: false });
		expect(out).toBe(
			'#import "@preview/unithesis:0.1.0": *\n#show: unithesis.with(title: [题目])\n\n#set align(center)\n#set par(justify: false)\n\n= 绪论\n\n正文。'
		);
		expect(saved(out)).toBe(out);
	});

	it('two rules become one where one is enough, and a field put back to default comes off', () => {
		const src = '#set align(right)\n#set par(justify: false, leading: 1em)\n\n正文。';
		expect(defaulted(src, { align: null, leading: null, justify: true })).toBe('#set par(justify: true)\n\n正文。');
		expect(defaulted(src, { align: null, justify: null, leading: null })).toBe('正文。');
	});
});
