<script lang="ts">
	// The paragraph settings that are lengths: how far the first line is indented, how far apart
	// the lines are. They hold the typst as it is written (2em, 0.65em), so what is typed is what
	// the file will say. Empty is typst's own value.
	import { IndentIncrease, RotateCcw } from '@lucide/svelte';
	import { Popover, Portal } from '@skeletonlabs/skeleton-svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { inEditorPane } from '$lib/editor/visual/editorPanePositioning';
	import { editorViewStore } from '$lib/stores/editorStore';
	import { toaster } from '$lib/modals/toaster-svelte';
	import { applyParaFormat, paraFormatAt, type ParaFormat } from '../paragraphFormat';
	import { m } from '$lib/paraglide/messages';

	/** a typst length as a person types it: a number and a unit */
	const LENGTH = /^[0-9]*\.?[0-9]+\s*(em|pt|mm|cm|in)$/;

	let open = $state(false);
	// the fields follow the caret while nobody is typing in them
	let editing = $state(false);
	let current = $state<ParaFormat | null>(null);
	$effect(() => {
		const view = editorViewStore.current;
		if (!editing) current = view ? (paraFormatAt(view.state)?.format ?? null) : null;
	});

	function apply(patch: Partial<ParaFormat>): boolean {
		const view = editorViewStore.current;
		if (!view) return false;
		const tr = applyParaFormat(view.state, patch);
		if (!tr) toaster.info({ title: m.parfmt_cannot(), duration: 3000 });
		else view.dispatch(tr);
		view.focus();
		return !!tr;
	}

	function typed(field: 'indent' | 'leading', event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const text = input.value.trim();
		// a length typst cannot read is not applied, and the field goes back to what the file says
		if (text && !LENGTH.test(text)) {
			input.value = current?.[field] ?? '';
			toaster.info({ title: m.parfmt_not_a_length(), duration: 3000 });
			return;
		}
		apply({ [field]: text || null });
	}

	function reset() {
		apply({ align: null, justify: null, indent: null, leading: null });
		open = false;
	}
</script>

<Popover
	{open}
	onOpenChange={(e) => (open = e.open)}
	positioning={inEditorPane({ placement: 'bottom-start', offset: { mainAxis: 0 } })}
	autoFocus={false}
>
	<div class="toolbarButton">
		<Popover.Trigger>
			<button
				type="button"
				class="hover:preset-tonal flex items-center gap-1 p-1"
				class:preset-tonal-primary={open}
				aria-label={m.parfmt_button()}
				use:tip={m.parfmt_button()}
				onmousedown={(e) => e.preventDefault()}
			>
				<IndentIncrease class="h-5 w-5" />
			</button>
		</Popover.Trigger>
	</div>

	<Portal>
		<Popover.Positioner class="z-floating-ui">
			<Popover.Content class="card bg-surface-50-950 border-surface-300-700 w-72 border p-3 shadow-lg">
				<!-- the editor keeps its caret: clicks in the panel take no focus of their own -->
				<div class="space-y-2" role="presentation" onmousedown={(e) => e.preventDefault()}>
					<label class="label">
						<span class="text-sm">{m.parfmt_indent()}</span>
						<input
							class="input text-sm"
							value={current?.indent ?? ''}
							placeholder={m.parfmt_indent_placeholder()}
							onfocus={() => (editing = true)}
							onblur={() => (editing = false)}
							onchange={(e) => typed('indent', e)}
						/>
					</label>
					<label class="label">
						<span class="text-sm">{m.parfmt_leading()}</span>
						<input
							class="input text-sm"
							value={current?.leading ?? ''}
							placeholder={m.parfmt_leading_placeholder()}
							onfocus={() => (editing = true)}
							onblur={() => (editing = false)}
							onchange={(e) => typed('leading', e)}
						/>
					</label>
					<p class="text-muted text-xs">{m.parfmt_leading_hint()}</p>
					<p class="text-muted text-xs">{m.parfmt_hint()}</p>
					<div class="flex justify-end">
						<button type="button" class="btn btn-xs preset-tonal inline-flex items-center gap-1" onclick={reset} disabled={!current}>
							<RotateCcw class="size-3.5" />
							{m.parfmt_reset()}
						</button>
					</div>
				</div>
			</Popover.Content>
		</Popover.Positioner>
	</Portal>
</Popover>

<style lang="postcss">
	@reference "../../../../../app.css";

	.toolbarButton {
		@apply rounded-base transition-all ease-in-out;
	}
</style>
