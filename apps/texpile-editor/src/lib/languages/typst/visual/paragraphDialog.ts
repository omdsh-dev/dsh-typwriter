// The paragraph dialog, as Word lays its own out: what it shows for a paragraph, what each choice
// means in typst, and how it tells what was changed. Pure, so that a test can read it.
import { EXACT_LEADING, TYPST_LINE, type ParaFormat, type RuleFields, type Special } from './paragraphFormat';

export type AlignChoice = 'default' | 'left' | 'center' | 'right' | 'justify';
export type SpecialChoice = Special;
export type SpacingChoice = 'default' | 'single' | 'one-and-a-half' | 'double' | 'exact' | 'custom';
/** the choices that are a number of Word's lines */
type Multiple = 'single' | 'one-and-a-half' | 'double';

export type ParagraphForm = {
	align: AlignChoice;
	/** the left and right indent: a number of characters, or a typst length as written; '' is none */
	left: string;
	right: string;
	special: SpecialChoice;
	/** the measure of the special indent, written as the indents are */
	indent: string;
	/** space before and after: a number of characters, or a typst length as written (8pt); '' is none */
	before: string;
	after: string;
	spacing: SpacingChoice;
	/** the typst length of a custom spacing: typst's own leading */
	leading: string;
	/** a line of a fixed height, Word's own setting: a number of points, or a typst length as written */
	exact: string;
	keepTogether: boolean;
	keepWithNext: boolean;
};

/**
 * Word's line spacings in typst terms. A line is as tall as its font makes it, plus typst's `leading`.
 * Both were measured, for SimSun at 12pt: a single-spaced line in Word is 1.3 em (15.57pt), and the
 * line typst lays out before any leading is 0.683 em (8.2pt). So N lines of Word are (1.3 N - 0.683)
 * em of leading, and a line of a fixed height P is `P - 0.683em` of it. Another font has other
 * numbers; the ones here are the Chinese body text's.
 */
const WORD_SINGLE = 1.3;
const MULTIPLES: Record<Multiple, number> = { single: 1, 'one-and-a-half': 1.5, double: 2 };

function leadingOf(spacing: Multiple): string {
	return `${Number((WORD_SINGLE * MULTIPLES[spacing] - TYPST_LINE).toFixed(3))}em`;
}
/** a fixed height as typst is given it */
function exactLeading(text: string): string {
	return `${text.replace(/\s+/g, '')} - ${TYPST_LINE}em`;
}
/** a fixed height as the dialog's field holds it: points as a bare number, as Word shows them */
function pointsOf(length: string): string {
	return /^([0-9]*\.?[0-9]+)pt$/.exec(length)?.[1] ?? length;
}

/** a bare number is a count of characters, which in typst is that many em */
const CHARS = /^[0-9]*\.?[0-9]+$/;
const CHARS_EM = /^([0-9]*\.?[0-9]+)em$/;
/** a typst length as a person types it: a number and a unit */
const LENGTH = /^[0-9]*\.?[0-9]+\s*(em|pt|mm|cm|in)$/;

/** a length as the dialog's field holds it: a count of characters where it is one, else as written */
function charsOf(length: string | null | undefined): string {
	if (!length) return '';
	return CHARS_EM.exec(length)?.[1] ?? length;
}

/** a spacing as the dialog's fields hold it: the choice, and the text of the field that goes with it */
type SpacingForm = Pick<ParagraphForm, 'spacing' | 'leading' | 'exact'>;

function spacingOf(leading: string | null | undefined): SpacingForm {
	if (!leading) return { spacing: 'default', leading: '', exact: '' };
	for (const choice of Object.keys(MULTIPLES) as Multiple[]) {
		if (leading === leadingOf(choice)) return { spacing: choice, leading: '', exact: '' };
	}
	const exact = EXACT_LEADING.exec(leading);
	if (exact) return { spacing: 'exact', leading: '', exact: pointsOf(exact[1].replace(/\s+/g, '')) };
	return { spacing: 'custom', leading, exact: '' };
}

/** the alignment a choice means: justified text needs the start side, which is left here */
function alignmentOf(align: AlignChoice): Pick<ParaFormat, 'align' | 'justify'> {
	if (align === 'default') return { align: null, justify: null };
	if (align === 'justify') return { align: 'left', justify: true };
	return { align, justify: false };
}

/**
 * What the alignment choice of a paragraph's settings is, as the dialog shows it: a paragraph set
 * ragged is left-aligned, as it is in Word, and one set justified is justified whatever side it names.
 */
function alignChoiceOf(format: ParaFormat | null | undefined): AlignChoice {
	if (format?.align === 'center' || format?.align === 'right') return format.align;
	if (format?.justify === true) return 'justify';
	if (format?.justify === false || format?.align === 'left') return 'left';
	return 'default';
}

/**
 * What the dialog shows for a paragraph: what its own settings say, and for each field it leaves
 * open, what the document's defaults say for it.
 */
export function effective(defaults: ParaFormat, own: ParaFormat | null): ParaFormat {
	const shown: Record<string, unknown> = { ...defaults };
	for (const [field, value] of Object.entries(own ?? {})) if (value !== null) shown[field] = value;
	return shown as ParaFormat;
}

/** the form the dialog opens on for a paragraph with these settings (null: none of its own) */
export function formOf(format: ParaFormat | null): ParagraphForm {
	return {
		align: alignChoiceOf(format),
		left: charsOf(format?.left),
		right: charsOf(format?.right),
		special: format?.special ?? 'none',
		indent: charsOf(format?.indent),
		before: charsOf(format?.above),
		after: charsOf(format?.below),
		...spacingOf(format?.leading),
		keepTogether: format?.keepTogether === true,
		keepWithNext: format?.keepWithNext === true
	};
}

/** a field as the file would hold it; 'invalid' for what was typed and is no length */
type Length = string | null | 'invalid';
type Read = {
	align: AlignChoice;
	left: Length;
	right: Length;
	special: SpecialChoice;
	indent: Length;
	above: Length;
	below: Length;
	leading: Length;
	keepTogether: boolean;
	keepWithNext: boolean;
};

function asLength(text: string): Length {
	return LENGTH.test(text) ? text : 'invalid';
}

/** a field's text as a length: nothing typed is none, a bare number is characters */
function lengthOf(text: string): Length {
	const typed = text.trim();
	if (!typed) return null;
	return asLength(CHARS.test(typed) ? `${typed}em` : typed);
}

function read(form: ParagraphForm): Read {
	return {
		align: form.align,
		left: lengthOf(form.left),
		right: lengthOf(form.right),
		special: form.special,
		indent: form.special === 'none' ? null : form.indent.trim() ? lengthOf(form.indent) : 'invalid',
		above: lengthOf(form.before),
		below: lengthOf(form.after),
		leading: spacingLength(form),
		keepTogether: form.keepTogether,
		keepWithNext: form.keepWithNext
	};
}

/** the length a line-spacing choice means: none for the default, what was typed for a fixed height or a custom one */
function spacingLength(form: ParagraphForm): Length {
	if (form.spacing === 'default') return null;
	if (form.spacing === 'custom') return form.leading.trim() ? lengthOf(form.leading) : 'invalid';
	if (form.spacing === 'exact') {
		const typed = form.exact.trim();
		if (!typed) return 'invalid';
		// a bare number is points here, as it is in Word's own field, not characters
		const length = CHARS.test(typed) ? `${typed}pt` : typed;
		return LENGTH.test(length) ? exactLeading(length) : 'invalid';
	}
	return leadingOf(form.spacing);
}

/** the fields of the form a changed pair of reads names, each only where it differs */
function diff(before: Read, after: Read): Partial<ParaFormat> | 'invalid' {
	const lengths: [keyof ParaFormat, Length, Length][] = [
		['left', before.left, after.left],
		['right', before.right, after.right],
		['indent', before.indent, after.indent],
		['above', before.above, after.above],
		['below', before.below, after.below],
		['leading', before.leading, after.leading]
	];
	const patch: Partial<ParaFormat> = {};
	for (const [field, was, now] of lengths) {
		if (was === now) continue;
		if (now === 'invalid') return 'invalid';
		(patch as Record<string, unknown>)[field] = now;
	}
	if (before.align !== after.align) Object.assign(patch, alignmentOf(after.align));
	if (before.special !== after.special) {
		patch.special = after.special;
		// a special indent that is new or of another kind takes its measure with it, where the
		// paragraph had none of its own and showed the document's
		if (after.special !== 'none') {
			if (after.indent === 'invalid') return 'invalid';
			patch.indent = after.indent;
		}
	}
	if (before.keepTogether !== after.keepTogether) patch.keepTogether = after.keepTogether;
	if (before.keepWithNext !== after.keepWithNext) patch.keepWithNext = after.keepWithNext;
	return patch;
}

/**
 * Only what was changed between the form the dialog opened on and the form on OK: a paragraph
 * that had no settings of its own gets only the ones touched, not the document's values written
 * back over it. 'invalid' when something changed to a value that is no length; null when nothing
 * changed.
 */
export function changes(first: ParagraphForm, now: ParagraphForm): Partial<ParaFormat> | 'invalid' | null {
	const patch = diff(read(first), read(now));
	if (patch === 'invalid') return 'invalid';
	return Object.keys(patch).length ? patch : null;
}

/**
 * What the dialog holds, as the document's defaults: the fields a set rule can carry, each with
 * the value on screen, a missing one taken off the defaults. What goes around single paragraphs
 * (space before and after, an inset, staying on a page) is not a document default.
 */
export function defaultChanges(form: ParagraphForm): Partial<RuleFields> | 'invalid' {
	const after = read(form);
	if (after.indent === 'invalid' || after.leading === 'invalid') return 'invalid';
	return {
		...alignmentOf(after.align),
		special: after.special,
		indent: after.indent,
		leading: after.leading
	};
}
