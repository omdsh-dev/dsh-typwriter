// @vitest-environment jsdom
// The paragraph settings as a person reaches them: the editor's context menu, its "Paragraph…" item
// where Word has its own, the dialog the item opens, and what OK, Cancel and Default write.
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { editorViewStore } from '$lib/stores/editorStore';
import { m } from '$lib/paraglide/messages';
import ContextMenu from '$lib/editor/visual/contextMenu/ContextMenu.svelte';
import ContextMenuHost from '$lib/menus/ContextMenuHost.svelte';
import { closeContextMenu } from '$lib/menus/contextMenu.svelte';
import { closeParagraphDialog } from '$lib/languages/typst/visual/openParagraphDialog.svelte';
import { typstChipKind } from '$lib/languages/typst/visual/extensions/typstChipKind';

// jsdom has no layout; coordsAtPos only needs rects that exist
if (!Range.prototype.getClientRects) {
	Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
	Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const PLAIN = '第一段。\n\n第二段。\n\n第三段。';
let view: EditorView | null = null;
let menu: ReturnType<typeof mount> | null = null;
let host: ReturnType<typeof mount> | null = null;

/** an editor on the page as the app has one, the context menu listening, the caret in the paragraph holding `needle` */
function open(src: string, needle: string): EditorView {
	const doc = typstToProseMirror(src).doc;
	let at = -1;
	doc.descendants((node, pos) => {
		if (at < 0 && node.isText && node.text?.includes(needle)) at = pos + 1;
		return at < 0;
	});
	if (at < 0) throw new Error(`no "${needle}" in the document`);
	const state = EditorState.create({ doc, selection: TextSelection.near(doc.resolve(at)) });
	const page = document.body.appendChild(document.createElement('div'));
	page.className = 'texpile-main-editor';
	view = new EditorView(page, { state });
	// jsdom lays nothing out: the pointer is taken to be where the caret is
	view.posAtCoords = () => ({ pos: at, inside: 1 });
	editorViewStore.current = view;
	host = mount(ContextMenuHost, { target: document.body });
	menu = mount(ContextMenu, { target: page, props: { dialect: 'typst' } });
	// its listener for the context menu is registered as it mounts
	flushSync();
	return view;
}

/** the right-click a person makes in the text */
async function rightClick(): Promise<void> {
	view!.dom.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
	await tick();
	flushSync();
}

/** the item of the menu that is drawn, by its label */
function menuItem(label: string): HTMLButtonElement {
	const button = [...document.querySelectorAll<HTMLButtonElement>('[role=menu] button')].find((el) => el.textContent?.trim() === label);
	if (!button) throw new Error(`no menu item "${label}"`);
	return button;
}

/** a button of the dialog, by its label */
function button(label: string): HTMLButtonElement {
	const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find((el) => el.textContent?.trim() === label);
	if (!found) throw new Error(`no button "${label}"`);
	return found;
}

function setSelect(select: HTMLSelectElement, value: string): void {
	select.value = value;
	select.dispatchEvent(new Event('input', { bubbles: true }));
	select.dispatchEvent(new Event('change', { bubbles: true }));
	flushSync();
}

function setInput(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}

/** the dialog's three choices: alignment, special indent, line spacing */
const selects = () =>
	[...document.querySelectorAll<HTMLSelectElement>('select')] as [HTMLSelectElement, HTMLSelectElement, HTMLSelectElement];
/** the dialog's text fields, in its order: left, right, the measure, before, after, then the one a spacing choice adds */
const inputs = () => [...document.querySelectorAll<HTMLInputElement>('input.input')];

afterEach(() => {
	closeContextMenu();
	closeParagraphDialog();
	for (const mounted of [menu, host]) if (mounted) void unmount(mounted);
	menu = host = null;
	view?.destroy();
	view = null;
	editorViewStore.current = null;
	document.body.innerHTML = '';
});

describe('the paragraph settings, as a person reaches them', () => {
	it('are an item of the editor’s context menu, where Word has its own', async () => {
		open(PLAIN, '第二段');
		await rightClick();
		const labels = [...document.querySelectorAll('[role=menu] button')].map((el) => el.textContent?.trim() ?? '');
		const at = labels.indexOf(m.parctx_paragraph());
		expect(at).toBeGreaterThan(0);
		// after the clipboard's items
		expect(labels.slice(0, at).some((label) => /paste/i.test(label))).toBe(true);
	});

	it('Paragraph… opens the dialog on the paragraph at the caret, and OK writes only what was changed', async () => {
		const editor = open(PLAIN, '第二段');
		await rightClick();
		menuItem(m.parctx_paragraph()).click();
		flushSync();
		const [alignment, special, spacing] = selects();
		expect([alignment.value, special.value, spacing.value]).toEqual(['default', 'none', 'default']);
		expect(inputs().map((field) => field.value)).toEqual(['', '', '', '', '']);
		setSelect(alignment, 'center');
		button(m.parfmt_ok()).click();
		flushSync();
		expect(serializeToTypst(editor.state.doc)).toBe(
			'第一段。\n\n#[\n  #set align(center)\n  #set par(justify: false)\n\n  第二段。\n]\n\n第三段。'
		);
		// and the dialog is gone
		expect(document.querySelector('select')).toBeNull();
	});

	it('Cancel writes nothing', async () => {
		const editor = open(PLAIN, '第二段');
		await rightClick();
		menuItem(m.parctx_paragraph()).click();
		flushSync();
		setSelect(selects()[2], 'double');
		button(m.parfmt_cancel()).click();
		flushSync();
		expect(serializeToTypst(editor.state.doc)).toBe(PLAIN);
		expect(document.querySelector('select')).toBeNull();
	});

	it('every field of the dialog reaches the file: indents, room, spacing, the two page rules', async () => {
		const editor = open(PLAIN, '第二段');
		await rightClick();
		menuItem(m.parctx_paragraph()).click();
		flushSync();
		const [alignment, special, spacing] = selects();
		setSelect(alignment, 'justify');
		setSelect(special, 'hanging');
		setSelect(spacing, 'exact');
		const [left, right, measure, before, after, exact] = inputs();
		setInput(left, '2');
		setInput(right, '1');
		setInput(measure, '2');
		setInput(before, '0.5');
		setInput(after, '8pt');
		setInput(exact, '20');
		for (const checkbox of document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) checkbox.click();
		flushSync();
		button(m.parfmt_ok()).click();
		flushSync();
		// a hanging indent needs no blank line to open the block: its first line starts where the block does
		expect(serializeToTypst(editor.state.doc)).toBe(
			'第一段。\n\n#block(above: 0.5em, below: 8pt, inset: (left: 2em, right: 1em), breakable: false, sticky: true)[\n  #set align(left)\n  #set par(justify: true, first-line-indent: 0em, hanging-indent: 2em, leading: 20pt - 0.683em)\n\n  第二段。\n]\n\n第三段。'
		);
	});

	it('Default writes what the dialog shows at the top of the file, after its other opening rules', async () => {
		const editor = open('#import "x"\n\n正文。\n', '正文');
		await rightClick();
		menuItem(m.parctx_paragraph()).click();
		flushSync();
		const [, special, spacing] = selects();
		setSelect(special, 'first-line');
		setInput(inputs()[2], '2');
		setSelect(spacing, 'exact');
		setInput(inputs().at(-1)!, '20');
		button(m.parfmt_set_default()).click();
		flushSync();
		expect(serializeToTypst(editor.state.doc)).toBe(
			'#import "x"\n\n#set par(first-line-indent: (amount: 2em, all: true), leading: 20pt - 0.683em)\n\n正文。'
		);
		expect(document.querySelector('select')).toBeNull();
	});

	it('a press on the mark of a paragraph’s rules opens the dialog on that paragraph', async () => {
		const editor = open('#[\n  #set par(justify: false)\n  一段。\n]\n\n另一段。', '一段');
		// the mark is the chip that opens the paragraph's container, taken whole as a press on it does
		editor.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 1)));
		const chip = editor.state.doc.firstChild!.firstChild!;
		expect(typstChipKind(true).markPress!(chip.textContent, editor, 1)).toBe(true);
		flushSync();
		setSelect(selects()[0], 'right');
		button(m.parfmt_ok()).click();
		flushSync();
		expect(serializeToTypst(editor.state.doc)).toBe('#[\n  #set align(right)\n  #set par(justify: false)\n  一段。\n]\n\n另一段。');
	});
});
