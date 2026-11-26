// The paragraph dialog: what it shows for a paragraph, what each choice means in typst, and that
// OK writes only what was changed.
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { applyParaFormat, paraFormatAt, type ParaFormat } from '$lib/languages/typst/visual/paragraphFormat';
import { changes, formOf, type ParagraphForm } from '$lib/languages/typst/visual/paragraphDialog';

const PLAIN = '第一段。\n\n第二段。\n\n第三段。';
const SET = '#[\n  #set align(right)\n  #set par(justify: false, first-line-indent: 2em, leading: 0.975em)\n  第二段。\n]';
const NONE: ParagraphForm = { align: 'default', indent: '', spacing: 'default', leading: '' };
const OWN: ParaFormat = { align: 'right', justify: false, indent: '2em', leading: '0.975em' };

function docOf(src: string): Node {
	return typstToProseMirror(src).doc;
}
function caretIn(doc: Node, needle: string): number {
	let at = -1;
	doc.descendants((node, pos) => {
		if (at < 0 && node.isText && node.text?.includes(needle)) at = pos + 1;
		return at < 0;
	});
	if (at < 0) throw new Error(`no "${needle}" in the document`);
	return at;
}
function stateAt(src: string, needle: string): EditorState {
	const doc = docOf(src);
	const state = EditorState.create({ schema: doc.type.schema, doc });
	return state.apply(state.tr.setSelection(TextSelection.near(doc.resolve(caretIn(doc, needle)))));
}
/** the source after the dialog's OK on `patch`, made with the caret in the paragraph holding `needle` */
function agreed(src: string, needle: string, patch: Partial<ParaFormat>): string {
	const state = stateAt(src, needle);
	return serializeToTypst(applyParaFormat(state, patch)!.doc).trimEnd();
}

describe('what the dialog opens on', () => {
	it('nothing chosen, for a paragraph with no settings of its own', () => {
		expect(formOf(null)).toEqual(NONE);
	});

	it("a paragraph's settings, in the words Word uses for them", () => {
		expect(formOf(OWN)).toEqual({ align: 'right', indent: '2', spacing: 'one-and-a-half', leading: '' });
	});

	it('a spacing that is none of the presets is custom, as it was written', () => {
		expect(formOf({ align: null, justify: null, indent: null, leading: '8pt' })).toEqual({ ...NONE, spacing: 'custom', leading: '8pt' });
	});

	it('reads the paragraphs at the caret', () => {
		expect(formOf(paraFormatAt(stateAt(SET, '第二段'))?.format ?? null)).toEqual({
			align: 'right',
			indent: '2',
			spacing: 'one-and-a-half',
			leading: ''
		});
		expect(formOf(paraFormatAt(stateAt(PLAIN, '第一段'))?.format ?? null)).toEqual(NONE);
	});
});

describe('what OK writes', () => {
	it('nothing, when nothing was changed', () => {
		expect(changes(NONE, NONE)).toBeNull();
		expect(changes(formOf(OWN), formOf(OWN))).toBeNull();
	});

	it('only the alignment that was chosen', () => {
		expect(changes(NONE, { ...NONE, align: 'center' })).toEqual({ align: 'center', justify: false });
		expect(changes(NONE, { ...NONE, align: 'justify' })).toEqual({ align: 'left', justify: true });
	});

	it('an indent in characters, as a typst length; a length goes as written', () => {
		expect(changes(NONE, { ...NONE, indent: '2' })).toEqual({ indent: '2em' });
		expect(changes(NONE, { ...NONE, indent: '12pt' })).toEqual({ indent: '12pt' });
	});

	it('a line spacing as Word names it, in typst terms', () => {
		expect(changes(NONE, { ...NONE, spacing: 'single' })).toEqual({ leading: '0.65em' });
		expect(changes(NONE, { ...NONE, spacing: 'one-and-a-half' })).toEqual({ leading: '0.975em' });
		expect(changes(NONE, { ...NONE, spacing: 'double' })).toEqual({ leading: '1.3em' });
		expect(changes(NONE, { ...NONE, spacing: 'custom', leading: '8pt' })).toEqual({ leading: '8pt' });
	});

	it('every setting put back to default comes off the paragraph', () => {
		expect(changes(formOf(OWN), NONE)).toEqual({ align: null, justify: null, indent: null, leading: null });
	});

	it('is refused when what was typed is no length', () => {
		expect(changes(NONE, { ...NONE, indent: 'two' })).toBe('invalid');
		expect(changes(NONE, { ...NONE, spacing: 'custom', leading: 'wide' })).toBe('invalid');
		expect(changes(NONE, { ...NONE, spacing: 'custom', leading: '' })).toBe('invalid');
	});

	it('leaves a setting the editor cannot read alone, when it was not touched', () => {
		const own = formOf({ align: null, justify: null, indent: null, leading: 'calc(20pt - 1em)' });
		expect(changes(own, { ...own, align: 'center' })).toEqual({ align: 'center', justify: false });
	});
});

describe('from the dialog to the file', () => {
	it('a paragraph with no settings of its own gets only the one chosen', () => {
		const out = agreed(PLAIN, '第二段', changes(NONE, { ...NONE, align: 'center' }) as Partial<ParaFormat>);
		expect(out).toContain('#set align(center)');
		expect(out).toContain('#set par(justify: false)');
		expect(out).not.toContain('first-line-indent');
		expect(out).not.toContain('leading');
	});

	it('every setting changed at once', () => {
		const out = agreed(
			PLAIN,
			'第二段',
			changes(NONE, { ...NONE, align: 'justify', indent: '2', spacing: 'one-and-a-half' }) as Partial<ParaFormat>
		);
		expect(out).toContain('#set align(left)');
		expect(out).toContain('#set par(justify: true, first-line-indent: 2em, leading: 0.975em)');
	});

	it('a setting put back to default is taken off a paragraph that had it', () => {
		const now = { ...formOf(OWN), spacing: 'default' as const };
		const out = agreed(SET, '第二段', changes(formOf(OWN), now) as Partial<ParaFormat>);
		expect(out).toBe('#[\n  #set align(right)\n  #set par(justify: false, first-line-indent: 2em)\n  第二段。\n]');
	});
});
