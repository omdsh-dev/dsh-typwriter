<script lang="ts">
	// The height of every row of a Typst table, as the file wrote it (a table.row's height:) or empty.
	import type { EditorView } from 'prosemirror-view';
	import type { Node } from 'prosemirror-model';
	import { rowHeightTr } from '$lib/languages/typst/visual/serialize/tableFormatting';
	import { editTable, tableAt } from './typstTablePanel';
	import { m } from '$lib/paraglide/messages';

	type Props = { view: EditorView; tablePos: () => number | null; node: Node };
	let { view, tablePos, node }: Props = $props();

	// one entry per row: its height, and where the row stands in the document
	const rows = $derived.by(() => {
		void node;
		const at = tableAt(view, tablePos);
		if (!at) return [];
		const out: { pos: number; height: string }[] = [];
		let pos = at.pos + 1;
		at.node.forEach((row) => {
			out.push({ pos, height: typeof row.attrs.typRowHeight === 'string' ? row.attrs.typRowHeight : '' });
			pos += row.nodeSize;
		});
		return out;
	});

	function setHeight(pos: number, text: string) {
		editTable(view, tablePos, (tr) => {
			const row = tr.doc.nodeAt(pos);
			return row ? rowHeightTr(tr, pos, row, text) : null;
		});
	}
</script>

<div class="settings-row">
	<div class="text-muted mb-1.5 text-xs font-semibold">{m.ttable_row_heights()}</div>
	<div class="max-h-40 space-y-1 overflow-y-auto">
		{#each rows as row, i (row.pos)}
			<div class="flex items-center gap-2">
				<span class="text-muted w-12 shrink-0 text-xs">{m.ttable_row_label({ index: i + 1 })}</span>
				<input
					class="input w-24 px-1.5 py-0.5 text-xs"
					value={row.height}
					placeholder={m.ttable_row_height_placeholder()}
					aria-label={m.ttable_row_height_aria({ index: i + 1 })}
					onchange={(e) => setHeight(row.pos, (e.currentTarget as HTMLInputElement).value)}
				/>
			</div>
		{/each}
	</div>
</div>

<style>
	.settings-row {
		margin-bottom: calc(var(--spacing) * 3);
	}
</style>
