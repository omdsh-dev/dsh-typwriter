// The one paragraph dialog, mounted in the window of the editor it is asked of: by the context
// menu's item, or by a press on the mark of a paragraph's own settings.
import { mount, unmount } from 'svelte';
import type { EditorView } from 'prosemirror-view';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import ParagraphDialog from './panel/ParagraphDialog.svelte';

let mounted: { doc: Document; app: ReturnType<typeof mount> } | null = null;

/** the paragraph settings of the paragraphs at the caret of `view` */
export function openParagraphDialog(view: EditorView): void {
	closeParagraphDialog();
	const doc = view.dom.ownerDocument;
	// asked of one of a container's rule chips: the caret goes to where the container's paragraphs are
	const { selection } = view.state;
	if (selection instanceof NodeSelection)
		view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(selection.to), 1)));
	mounted = { doc, app: mount(ParagraphDialog, { target: doc.body, props: { view, onClose: closeParagraphDialog } }) };
}

export function closeParagraphDialog(): void {
	if (!mounted) return;
	const app = mounted.app;
	mounted = null;
	try {
		void unmount(app);
	} catch {
		/* its window has gone */
	}
}
