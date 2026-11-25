<script lang="ts">
	// The settings of a Typst table that the editor could not offer before: how wide it is, its
	// lines, its cell padding, and (under Advanced) the height of each row. LaTeX has its own
	// vocabulary for all of this one level up; typst writes arguments of the table itself.
	import type { EditorView } from 'prosemirror-view';
	import type { Node } from 'prosemirror-model';
	import { ChevronDown } from '@lucide/svelte';
	import TypstTableColumns from './TypstTableColumns.svelte';
	import TypstTableRowHeights from './TypstTableRowHeights.svelte';
	import { parseTracks, pctOnlyRatio } from '$lib/languages/typst/visual/serialize/tracks';
	import { columnCountOf } from '$lib/editor/visual/extensions/table/captureColumnWidths';
	import { tableWidthTr } from '$lib/editor/visual/extensions/table/typstTableWidth';
	import { allLinesTr, argText, noBorderTr, tableArgTr, threeLineTr } from '$lib/languages/typst/visual/serialize/tableFormatting';
	import { editTable, tableAt } from './typstTablePanel';
	import { m } from '$lib/paraglide/messages';

	type Props = { view: EditorView; tablePos: () => number | null; node: Node };
	let { view, tablePos, node }: Props = $props();

	// `node` is read for its identity: every edit replaces the table, and that is the re-render
	const at = $derived.by(() => {
		void node;
		return tableAt(view, tablePos);
	});
	const args = $derived(at ? at.node.attrs.typArgs : []);
	const tracks = $derived(at ? parseTracks(at.node.attrs.colspec, columnCountOf(at.node)) : null);

	// the share of the text width the table takes, as a whole number of percent: auto is content
	const isAuto = $derived(!!tracks && tracks.every((t) => t.kind === 'auto'));
	const percent = $derived.by(() => {
		if (!tracks || isAuto) return null;
		const ratio = pctOnlyRatio(tracks);
		return ratio == null ? 100 : Math.round(ratio * 100); // fr fills the line
	});

	const WIDTHS = [100, 75, 50];

	function setWidth(ratio: number | null) {
		editTable(view, tablePos, (tr, a) => tableWidthTr(view, a.pos, a.node, ratio));
	}

	// a typed width: anything outside 5 to 100 is not a table anyone meant
	function setCustomWidth(text: string) {
		const value = Number.parseFloat(text);
		if (!Number.isFinite(value)) return;
		setWidth(Math.min(100, Math.max(5, value)) / 100);
	}

	// an argument typed as typst text; an empty field takes the argument away
	function setArg(name: string, text: string) {
		editTable(view, tablePos, (tr, a) => tableArgTr(tr, a.pos, a.node, name, text.trim() || null));
	}

	let showHeights = $state(false);
</script>

{#if at}
	<TypstTableColumns {view} {tablePos} {node} />

	<div class="settings-row">
		<div class="text-muted mb-1.5 text-xs font-semibold">{m.ttable_width()}</div>
		<div class="flex flex-wrap items-center gap-1">
			<button
				type="button"
				class="btn btn-xs {isAuto ? 'preset-filled-primary-500' : 'preset-outlined-surface-200-800'}"
				onclick={() => setWidth(null)}
			>
				{m.ttable_width_auto()}
			</button>
			{#each WIDTHS as value (value)}
				<button
					type="button"
					class="btn btn-xs {!isAuto && percent === value ? 'preset-filled-primary-500' : 'preset-outlined-surface-200-800'}"
					onclick={() => setWidth(value / 100)}
				>
					{m.ttable_width_ratio({ value })}
				</button>
			{/each}
			<input
				type="number"
				min="5"
				max="100"
				class="input w-14 px-1.5 py-0.5 text-xs"
				value={percent != null && !WIDTHS.includes(percent) ? percent : ''}
				placeholder="%"
				aria-label={m.ttable_width_custom()}
				onchange={(e) => setCustomWidth((e.currentTarget as HTMLInputElement).value)}
			/>
		</div>
		<p class="text-faint mt-1 text-xs">{m.ttable_width_hint()}</p>
	</div>

	<div class="settings-row">
		<div class="text-muted mb-1.5 text-xs font-semibold">{m.ttable_lines()}</div>
		<div class="flex flex-wrap gap-1">
			<button
				type="button"
				class="btn btn-xs preset-outlined-surface-200-800"
				onclick={() => editTable(view, tablePos, (tr, a) => threeLineTr(tr, a.pos, a.node))}
			>
				{m.ttable_three_line()}
			</button>
			<button
				type="button"
				class="btn btn-xs preset-outlined-surface-200-800"
				onclick={() => editTable(view, tablePos, (tr, a) => allLinesTr(tr, a.pos, a.node))}
			>
				{m.ttable_all_lines()}
			</button>
			<button
				type="button"
				class="btn btn-xs preset-outlined-surface-200-800"
				onclick={() => editTable(view, tablePos, (tr, a) => noBorderTr(tr, a.pos, a.node))}
			>
				{m.ttable_no_lines()}
			</button>
		</div>
		<label class="label mt-2">
			<span class="text-sm">{m.ttable_stroke()}</span>
			<input
				class="input text-sm"
				value={argText(args, 'stroke') ?? ''}
				placeholder={m.ttable_stroke_placeholder()}
				onchange={(e) => setArg('stroke', (e.currentTarget as HTMLInputElement).value)}
			/>
		</label>
	</div>

	<div class="settings-row">
		<label class="label">
			<span class="text-sm">{m.ttable_inset()}</span>
			<input
				class="input text-sm"
				value={argText(args, 'inset') ?? ''}
				placeholder={m.ttable_inset_placeholder()}
				onchange={(e) => setArg('inset', (e.currentTarget as HTMLInputElement).value)}
			/>
		</label>
	</div>

	<button
		type="button"
		class="text-muted hover:text-surface-900-100 my-3 flex w-full items-center gap-2 text-sm transition-colors"
		onclick={() => (showHeights = !showHeights)}
	>
		<ChevronDown class="h-4 w-4 transition-transform {showHeights ? 'rotate-180' : ''}" />
		<span>{m.ttable_row_heights()}</span>
	</button>
	{#if showHeights}
		<TypstTableRowHeights {view} {tablePos} {node} />
	{/if}
{/if}

<style>
	.settings-row {
		margin-bottom: calc(var(--spacing) * 3);
	}
</style>
