// What a paragraph container says, drawn on it. The rules it opens with are typst's own: which
// side the text hugs, whether it is justified, how far the first line is indented, how far apart
// the lines are. The editor shows them, so that what is on screen is what the page will print.
import { Plugin } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { readTypstCall, typstLengthCss } from '$lib/languages/typst/visual/core';
import { paraFormatOf, paraStyle } from '../../paragraphFormat';

/** a typst length as the browser draws it, where the length came written as text */
export function lengthCss(text: string): string | null {
	const call = readTypstCall(`#set par(leading: ${text.trim()})`);
	const arg = call ? call.args[0] : null;
	return call && arg ? typstLengthCss(arg.node, call.source) : null;
}

/** a node decoration whose attributes are also its spec, which is where a decoration read back off the set exposes them */
function marked(from: number, to: number, attrs: { style: string }): Decoration {
	return Decoration.node(from, to, attrs, attrs);
}

/** one decoration for the container, one for each of its paragraphs that starts indented */
export function paraFormatDecorations(doc: PMNode): DecorationSet {
	const out: Decoration[] = [];
	doc.descendants((node, pos) => {
		const format = paraFormatOf(node);
		if (!format) return true;
		const style = paraStyle(format, lengthCss);
		if (style.box) out.push(marked(pos, pos + node.nodeSize, { style: style.box }));
		if (!style.indent) return false;
		let at = pos + 1;
		node.forEach((child) => {
			if (child.type.name === 'paragraph') out.push(marked(at, at + child.nodeSize, { style: `text-indent: ${style.indent}` }));
			at += child.nodeSize;
		});
		return false;
	});
	return DecorationSet.create(doc, out);
}

export const paraFormatLook: Plugin = new Plugin({
	state: {
		init: (_config, state) => paraFormatDecorations(state.doc),
		apply(tr, prev) {
			return tr.docChanged ? paraFormatDecorations(tr.doc) : prev;
		}
	},
	props: {
		decorations: (state) => paraFormatLook.getState(state)
	}
});
