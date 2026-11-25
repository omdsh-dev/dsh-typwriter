<script lang="ts">
	// One row per column of a Typst table: its alignment (the table's align:) and its width (its
	// track in columns:). A spec too exotic to be a plain list is left to the raw input above.
	import type { EditorView } from 'prosemirror-view';
	import type { Node } from 'prosemirror-model';
	import { AlignLeft, AlignCenter, AlignRight } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { columnCountOf, fitTracksTr } from '$lib/editor/visual/extensions/table/captureColumnWidths';
	import { parseTracks } from '$lib/languages/typst/visual/serialize/tracks';
	import { columnAlignTr, columnAligns, trackTexts, withTrack, type Side } from '$lib/languages/typst/visual/serialize/tableFormatting';
	import { editTable, tableAt } from './typstTablePanel';
	import { m } from '$lib/paraglide/messages';

	type Props = { view: EditorView; tablePos: () => number | null; node: Node };
	let { view, tablePos, node }: Props = $props();

	// `node` is read for its identity: every edit replaces the table, and that is the re-render
	const at = $derived.by(() => {
		void node;
		return tableAt(view, tablePos);
	});
	const cols = $derived(at ? columnCountOf(at.node) : 0);
	const tracks = $derived(at ? trackTexts(at.node.attrs.colspec, cols) : null);
	const aligns = $derived(at ? columnAligns(at.node, cols) : []);

	const SIDES: { side: Side; icon: typeof AlignLeft; label: string }[] = [
		{ side: 'left', icon: AlignLeft, label: m.tablewrap_align_left() },
		{ side: 'center', icon: AlignCenter, label: m.tablewrap_align_center() },
		{ side: 'right', icon: AlignRight, label: m.tablewrap_align_right() }
	];

	// the alignment of the column the caret is not what is toggled: a second press takes it off
	function setAlign(column: number, side: Side | null) {
		editTable(view, tablePos, (tr, a) => columnAlignTr(tr, a.pos, a.node, cols, column, side));
	}

	function setWidth(column: number, text: string) {
		const track = text.trim() || 'auto';
		editTable(view, tablePos, (tr, a) => {
			const spec = withTrack(a.node.attrs.colspec, cols, column, track);
			const parsed = spec ? parseTracks(spec, cols) : null;
			return spec && parsed ? fitTracksTr(view, a.pos, a.node, parsed, spec) : null;
		});
	}
</script>

{#if at && tracks}
	<div class="settings-row">
		<div class="text-muted mb-1.5 text-xs font-semibold">{m.tablewrap_columns_heading()}</div>
		{#each tracks as track, i (i)}
			<div class="mb-1 flex items-center gap-2">
				<span class="text-faint w-4 text-right text-xs">{i + 1}</span>
				<div class="border-surface-300-700 rounded-container flex overflow-hidden border">
					{#each SIDES as opt (opt.side)}
						<button
							type="button"
							use:tip={opt.label}
							aria-label={opt.label}
							class="hover:preset-tonal p-1 {aligns[i] === opt.side ? 'preset-filled-primary-500' : ''}"
							onclick={() => setAlign(i, aligns[i] === opt.side ? null : opt.side)}
						>
							<opt.icon class="size-3.5" />
						</button>
					{/each}
				</div>
				<input
					class="input w-24 px-1.5 py-0.5 text-xs"
					value={track}
					placeholder={m.ttable_column_width_placeholder()}
					aria-label={m.tablewrap_column_width_aria({ index: i + 1 })}
					onchange={(e) => setWidth(i, (e.currentTarget as HTMLInputElement).value)}
				/>
			</div>
		{/each}
		<hr class="border-surface-200-800 mt-3" />
	</div>
{/if}

<style>
	.settings-row {
		margin-bottom: calc(var(--spacing) * 3);
	}
</style>
