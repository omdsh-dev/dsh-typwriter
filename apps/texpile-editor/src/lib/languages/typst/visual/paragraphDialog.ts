// The paragraph dialog, as Word lays its own out: what it shows for a paragraph, what each choice
// means in typst, and how it tells what was changed. Pure, so that a test can read it.
import type { ParaFormat } from './paragraphFormat';

export type AlignChoice = 'default' | 'left' | 'center' | 'right' | 'justify';
export type SpacingChoice = 'default' | 'single' | 'one-and-a-half' | 'double' | 'custom';

export type ParagraphForm = {
	align: AlignChoice;
	/** first-line indent: a number of characters, or a typst length as written; '' is the default */
	indent: string;
	spacing: SpacingChoice;
	/** the typst length of a custom spacing */
	leading: string;
};

/** Word's line spacings in typst's terms: multiples of typst's own leading, which is 0.65em */
const SINGLE = 0.65;
const MULTIPLES: Record<Exclude<SpacingChoice, 'default' | 'custom'>, number> = { single: 1, 'one-and-a-half': 1.5, double: 2 };

function leadingOf(spacing: Exclude<SpacingChoice, 'default' | 'custom'>): string {
	return `${Number((SINGLE * MULTIPLES[spacing]).toFixed(3))}em`;
}

/** a bare number is a count of characters, which in typst is that many em */
const CHARS = /^[0-9]*\.?[0-9]+$/;
const CHARS_EM = /^([0-9]*\.?[0-9]+)em$/;
/** a typst length as a person types it: a number and a unit */
const LENGTH = /^[0-9]*\.?[0-9]+\s*(em|pt|mm|cm|in)$/;

function spacingOf(leading: string): { spacing: SpacingChoice; leading: string } {
	for (const choice of Object.keys(MULTIPLES) as (keyof typeof MULTIPLES)[]) {
		if (leading === leadingOf(choice)) return { spacing: choice, leading: '' };
	}
	return { spacing: 'custom', leading };
}

/** the form the dialog opens on for a paragraph with these settings (null: none of its own) */
export function formOf(format: ParaFormat | null): ParagraphForm {
	const align: AlignChoice = format?.justify === true ? 'justify' : (format?.align ?? 'default');
	const indent = format?.indent ? (CHARS_EM.exec(format.indent)?.[1] ?? format.indent) : '';
	const spacing = format?.leading ? spacingOf(format.leading) : { spacing: 'default' as const, leading: '' };
	return { align, indent, ...spacing };
}

/** a field as the file would hold it; 'invalid' for what was typed and is no length */
type Read = { align: AlignChoice; indent: string | null | 'invalid'; leading: string | null | 'invalid' };

/** a value as the file would hold it; 'invalid' for what was typed and is no length */
function asLength(text: string): string | 'invalid' {
	return LENGTH.test(text) ? text : 'invalid';
}

function read(form: ParagraphForm): Read {
	const indent = form.indent.trim();
	const custom = form.leading.trim();
	return {
		align: form.align,
		indent: indent ? asLength(CHARS.test(indent) ? `${indent}em` : indent) : null,
		leading:
			form.spacing === 'default' ? null : form.spacing === 'custom' ? (custom ? asLength(custom) : 'invalid') : leadingOf(form.spacing)
	};
}

/** the alignment a choice means: justified text needs the start side, which is left here */
function alignmentOf(align: AlignChoice): Pick<ParaFormat, 'align' | 'justify'> {
	if (align === 'default') return { align: null, justify: null };
	if (align === 'justify') return { align: 'left', justify: true };
	return { align, justify: false };
}

/**
 * Only what was changed between the form the dialog opened on and the form on OK: a paragraph
 * that had no settings of its own gets only the ones touched, not the template's values written
 * back over it. 'invalid' when something changed to a value that is no length; null when nothing
 * changed.
 */
export function changes(first: ParagraphForm, now: ParagraphForm): Partial<ParaFormat> | 'invalid' | null {
	const before = read(first);
	const after = read(now);
	if (before.indent !== after.indent && after.indent === 'invalid') return 'invalid';
	if (before.leading !== after.leading && after.leading === 'invalid') return 'invalid';
	const patch: Partial<ParaFormat> = {};
	if (before.align !== after.align) Object.assign(patch, alignmentOf(after.align));
	// a changed field that reads 'invalid' returned above; this only satisfies the types
	if (before.indent !== after.indent) patch.indent = after.indent === 'invalid' ? null : after.indent;
	if (before.leading !== after.leading) patch.leading = after.leading === 'invalid' ? null : after.leading;
	return Object.keys(patch).length ? patch : null;
}
