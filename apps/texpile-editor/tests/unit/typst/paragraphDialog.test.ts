// The paragraph dialog: what it shows for a paragraph, what each choice means in typst, and that
// OK writes only what was changed.
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { applyParaFormat, noFormat, paraFormatAt, type ParaFormat } from '$lib/languages/typst/visual/paragraphFormat';
import { documentDefaults } from '$lib/languages/typst/visual/paragraphDefaults';
import { changes, defaultChanges, effective, formOf, type ParagraphForm } from '$lib/languages/typst/visual/paragraphDialog';

const PLAIN = '第一段。\n\n第二段。\n\n第三段。';
const SET = '#[\n  #set align(right)\n  #set par(justify: false, first-line-indent: 2em, leading: 1.267em)\n  第二段。\n]';
const NONE: ParagraphForm = {
	align: 'default',
	left: '',
	right: '',
	special: 'none',
	indent: '',
	before: '',
	after: '',
	spacing: 'default',
	leading: '',
	exact: '',
	keepTogether: false,
	keepWithNext: false
};
const OWN: ParaFormat = { ...noFormat(), align: 'right', justify: false, special: 'first-line', indent: '2em', leading: '1.267em' };

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
/** what the dialog opens on, where the file's defaults are `defaults` and the paragraph holds `needle` */
const opensOn = (src: string, needle: string) => {
	const state = stateAt(src, needle);
	return formOf(effective({ ...noFormat(), ...documentDefaults(state).format }, paraFormatAt(state)?.format ?? null));
};

describe('what the dialog opens on', () => {
	it('nothing chosen, for a paragraph with no settings of its own', () => {
		expect(formOf(null)).toEqual(NONE);
	});

	it("a paragraph's settings, in the words Word uses for them", () => {
		expect(formOf(OWN)).toEqual({ ...NONE, align: 'right', special: 'first-line', indent: '2', spacing: 'one-and-a-half' });
	});

	it('a spacing that is none of the presets is custom, as it was written', () => {
		expect(formOf({ ...noFormat(), leading: '8pt' })).toEqual({ ...NONE, spacing: 'custom', leading: '8pt' });
	});

	it('a paragraph set ragged opens as left-aligned, as Word calls it', () => {
		expect(formOf({ ...noFormat(), justify: false }).align).toBe('left');
		expect(formOf({ ...noFormat(), justify: true }).align).toBe('justify');
		expect(formOf({ ...noFormat(), align: 'center', justify: true }).align).toBe('center');
	});

	it('shows what the file says at its top where the paragraph leaves a setting open', () => {
		const src = '#import "x"\n#set par(justify: true, first-line-indent: 2em)\n\n正文。\n\n#[\n  #set align(center)\n  居中的。\n]';
		expect(opensOn(src, '正文')).toEqual({ ...NONE, align: 'justify', special: 'first-line', indent: '2' });
		expect(opensOn(src, '居中的')).toEqual({ ...NONE, align: 'center', special: 'first-line', indent: '2' });
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
		expect(changes(NONE, { ...NONE, special: 'first-line', indent: '2' })).toEqual({ special: 'first-line', indent: '2em' });
		expect(changes(NONE, { ...NONE, left: '12pt', right: '1' })).toEqual({ left: '12pt', right: '1em' });
	});

	it('a special indent of another kind takes the measure that was on screen with it', () => {
		const first = { ...NONE, special: 'first-line' as const, indent: '2' };
		expect(changes(first, { ...first, special: 'hanging' })).toEqual({ special: 'hanging', indent: '2em' });
		expect(changes(first, { ...first, special: 'none' })).toEqual({ special: 'none', indent: null });
	});

	it('a line spacing as Word names it, in typst terms', () => {
		expect(changes(NONE, { ...NONE, spacing: 'single' })).toEqual({ leading: '0.617em' });
		expect(changes(NONE, { ...NONE, spacing: 'one-and-a-half' })).toEqual({ leading: '1.267em' });
		expect(changes(NONE, { ...NONE, spacing: 'double' })).toEqual({ leading: '1.917em' });
		expect(changes(NONE, { ...NONE, spacing: 'custom', leading: '8pt' })).toEqual({ leading: '8pt' });
	});

	it('a line of a fixed height is the height less the height typst gives the font itself', () => {
		expect(changes(NONE, { ...NONE, spacing: 'exact', exact: '20' })).toEqual({ leading: '20pt - 0.683em' });
		expect(changes(NONE, { ...NONE, spacing: 'exact', exact: '1.5em' })).toEqual({ leading: '1.5em - 0.683em' });
		expect(formOf({ ...noFormat(), leading: '20pt - 0.683em' })).toEqual({ ...NONE, spacing: 'exact', exact: '20' });
	});

	it('space before and after, and the two page rules', () => {
		expect(changes(NONE, { ...NONE, before: '0.5', after: '8pt', keepTogether: true })).toEqual({
			above: '0.5em',
			below: '8pt',
			keepTogether: true
		});
		expect(changes({ ...NONE, keepWithNext: true }, { ...NONE })).toEqual({ keepWithNext: false });
	});

	it('every setting put back to default comes off the paragraph', () => {
		expect(changes(formOf(OWN), NONE)).toEqual({ align: null, justify: null, special: 'none', indent: null, leading: null });
	});

	it('is refused when what was typed is no length', () => {
		expect(changes(NONE, { ...NONE, special: 'first-line', indent: 'two' })).toBe('invalid');
		expect(changes(NONE, { ...NONE, left: 'wide' })).toBe('invalid');
		expect(changes(NONE, { ...NONE, spacing: 'custom', leading: 'wide' })).toBe('invalid');
		expect(changes(NONE, { ...NONE, spacing: 'custom', leading: '' })).toBe('invalid');
		expect(changes(NONE, { ...NONE, spacing: 'exact', exact: '' })).toBe('invalid');
		expect(changes(NONE, { ...NONE, spacing: 'exact', exact: 'wide' })).toBe('invalid');
		expect(changes(NONE, { ...NONE, special: 'hanging' })).toBe('invalid');
	});

	it('leaves a setting the editor cannot read alone, when it was not touched', () => {
		const own = formOf({ ...noFormat(), leading: 'calc(20pt - 1em)' });
		expect(changes(own, { ...own, align: 'center' })).toEqual({ align: 'center', justify: false });
	});
});

describe('the Default button', () => {
	it('makes what the dialog shows the document’s defaults, in the fields a rule can carry', () => {
		const form: ParagraphForm = { ...NONE, align: 'justify', special: 'first-line', indent: '2', spacing: 'one-and-a-half', before: '1' };
		expect(defaultChanges(form)).toEqual({ align: 'left', justify: true, special: 'first-line', indent: '2em', leading: '1.267em' });
		expect(defaultChanges(NONE)).toEqual({ align: null, justify: null, special: 'none', indent: null, leading: null });
		expect(defaultChanges({ ...NONE, special: 'hanging' })).toBe('invalid');
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
			changes(NONE, { ...NONE, align: 'justify', special: 'first-line', indent: '2', spacing: 'one-and-a-half' }) as Partial<ParaFormat>
		);
		expect(out).toContain('#set align(left)');
		expect(out).toContain('#set par(justify: true, first-line-indent: (amount: 2em, all: true), leading: 1.267em)');
	});

	it('a setting put back to default is taken off a paragraph that had it', () => {
		const now = { ...formOf(OWN), spacing: 'default' as const };
		const out = agreed(SET, '第二段', changes(formOf(OWN), now) as Partial<ParaFormat>);
		expect(out).toBe('#[\n  #set align(right)\n  #set par(justify: false, first-line-indent: 2em)\n  第二段。\n]');
	});

	it('a paragraph that showed the defaults gets only the difference from them', () => {
		const src = '#set par(justify: true, first-line-indent: 2em)\n\n正文。\n';
		const first = opensOn(src, '正文');
		const out = agreed(src, '正文', changes(first, { ...first, align: 'left' }) as Partial<ParaFormat>);
		expect(out).toBe(
			'#set par(justify: true, first-line-indent: 2em)\n\n#[\n  #set align(left)\n  #set par(justify: false)\n\n  正文。\n]'
		);
	});
});
