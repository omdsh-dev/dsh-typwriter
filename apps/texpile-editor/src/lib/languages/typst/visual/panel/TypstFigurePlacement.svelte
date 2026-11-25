<script lang="ts">
	// Where a figure sits: floating, as typst places it, or kept where it is written.
	import { Switch } from '@skeletonlabs/skeleton-svelte';
	import { Info } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import type { FigurePlacement } from '$lib/languages/typst/visual/serialize/figurePlacement';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		placement: FigurePlacement | null;
		set: (placement: 'auto' | 'fixed') => void;
	};
	let { placement, set }: Props = $props();
</script>

{#if placement}
	<!-- a placement the editor does not model is left alone: the switch shows what is modelled -->
	{#if placement !== 'other'}
		<div class="settings-row">
			<Switch
				checked={placement === 'fixed'}
				onCheckedChange={(e) => set(e.checked ? 'fixed' : 'auto')}
				class="flex items-center justify-between gap-3"
			>
				<Switch.Label class="flex items-center gap-2">
					{m.figplace_label()}
					<button type="button" class="inline-flex items-center" use:tip={m.figplace_hint()}>
						<Info class="text-muted h-3.5 w-3.5" />
					</button>
				</Switch.Label>
				<Switch.Control class="preset-filled-surface-200-800 data-[state=checked]:preset-filled-primary-500">
					<Switch.Thumb />
				</Switch.Control>
				<Switch.HiddenInput />
			</Switch>
		</div>
	{/if}
{/if}

<style>
	.settings-row {
		margin-bottom: calc(var(--spacing) * 3);
	}
</style>
