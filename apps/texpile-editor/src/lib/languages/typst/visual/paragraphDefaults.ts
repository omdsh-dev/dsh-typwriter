// The document's own defaults: the paragraph rules that stand at the top of the file, where every
// paragraph falls back on them.
//
//   #set align(left)
//   #set par(justify: true, first-line-indent: (amount: 2em, all: true))
//
// The dialog's "Default" button writes them, as Word's does for its Normal style. The decision for
// Typwriter was to keep them in the paper file itself, not in the template. They go after the file's
// other opening rules, the template's show rule among them, where they are what the text sees last.
import type { EditorState, Transaction } from 'prosemirror-state';
import { chipsOf, chipNode, isParagraphRuleChip, patchedRules, readRules, type RuleFields, type Rules } from './paragraphFormat';

/**
 * The rules every paragraph of the file falls back on: the settings' chips among the ones that
 * open the file. `after` is where new ones go, at the end of that opening run; `managed` is where
 * the ones there now stand, `texts` what they say.
 */
export function documentDefaults(state: EditorState): { format: RuleFields; after: number; managed: number[]; texts: string[] } {
	const managed: number[] = [];
	const texts: string[] = [];
	let pos = 0;
	for (let i = 0; i < state.doc.childCount; i++) {
		const child = state.doc.child(i);
		if (child.type.name !== 'raw_latex') break;
		if (isParagraphRuleChip(child.textContent)) {
			managed.push(pos);
			texts.push(child.textContent.trim());
		}
		pos += child.nodeSize;
	}
	const { align, justify, special, indent, leading } = readRules(texts);
	return { format: { align, justify, special, indent, leading }, after: pos, managed, texts };
}

/**
 * Make settings the document's defaults: the opening rules are rewritten to say them, or put at
 * the top of the file when there are none. A field set to null stops being a default. The rewrite
 * lands where the last of them stood, so that it keeps its place among the file's other opening
 * rules.
 */
export function applyDocumentDefaults(state: EditorState, patch: Partial<RuleFields>): Transaction {
	const found = documentDefaults(state);
	const rules: Rules = patchedRules(readRules(found.texts), patch);
	const chips = chipsOf(rules);
	const tr = state.tr;
	// written back to front, so that an earlier one's place does not move under a later one's
	[...found.managed].reverse().forEach((pos, index) => {
		const node = state.doc.nodeAt(pos);
		const end = pos + (node?.nodeSize ?? 0);
		const last = index === 0;
		if (last && chips.length)
			tr.replaceWith(
				pos,
				end,
				chips.map((text, at) => chipNode(state.schema, text, at, node?.attrs.typGap))
			);
		else tr.delete(pos, end);
	});
	if (!found.managed.length && chips.length)
		tr.insert(
			found.after,
			chips.map((text, at) => chipNode(state.schema, text, at))
		);
	return tr;
}
