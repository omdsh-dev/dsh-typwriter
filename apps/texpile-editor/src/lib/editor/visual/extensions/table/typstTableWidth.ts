// How wide a Typst table is, set from its settings. The one table edit that needs the screen: the
// columns' proportions are read off the rendered table, so this lives beside the code that measures it.
import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { columnCountOf, fitTracksTr, renderedColumns } from './captureColumnWidths';
import { parseTracks, toPercentTracks, type Track } from '$lib/languages/typst/visual/serialize/tracks';

function autoColspec(cols: number): string {
	return `(${new Array(cols).fill('auto').join(', ')})`;
}

/**
 * The table `ratio` of the text width wide (0.6 is three fifths of it), in the proportions it has
 * on screen; null makes it content-sized again. The columns are read off the screen, so a table in
 * a hidden pane keeps its width until it is laid out.
 */
export function tableWidthTr(view: EditorView, pos: number, table: PMNode, ratio: number | null): Transaction | null {
	const cols = columnCountOf(table);
	if (ratio == null) {
		const autos: Track[] = new Array(cols).fill({ kind: 'auto' });
		return fitTracksTr(view, pos, table, autos, autoColspec(cols));
	}
	const spec = toPercentTracks(renderedColumns(view, pos, cols)?.widths ?? [], ratio);
	const tracks = spec ? parseTracks(spec, cols) : null;
	return tracks ? fitTracksTr(view, pos, table, tracks, spec!) : null;
}
