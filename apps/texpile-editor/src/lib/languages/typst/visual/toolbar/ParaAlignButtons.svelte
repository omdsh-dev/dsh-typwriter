<script lang="ts">
	// The four ways a paragraph can sit on its line, for the paragraphs at the caret. A press on
	// the side they are already on takes the setting away again.
	import { AlignLeft, AlignCenter, AlignRight, AlignJustify } from '@lucide/svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { editorViewStore } from '$lib/stores/editorStore';
	import { toaster } from '$lib/modals/toaster-svelte';
	import { applyParaFormat, paraFormatAt, toggled, type Align, type ParaFormat } from '../paragraphFormat';
	import { m } from '$lib/paraglide/messages';

	type Button = { align: Align; justified: boolean; icon: typeof AlignLeft; label: string };
	const BUTTONS: Button[] = [
		{ align: 'left', justified: false, icon: AlignLeft, label: m.parfmt_align_left() },
		{ align: 'center', justified: false, icon: AlignCenter, label: m.parfmt_align_center() },
		{ align: 'right', justified: false, icon: AlignRight, label: m.parfmt_align_right() },
		{ align: 'left', justified: true, icon: AlignJustify, label: m.parfmt_align_justify() }
	];

	// what the paragraphs at the caret are set to; the store re-announces the view on every edit
	let current = $state<ParaFormat | null>(null);
	$effect(() => {
		const view = editorViewStore.current;
		current = view ? (paraFormatAt(view.state)?.format ?? null) : null;
	});

	function isOn(button: Button): boolean {
		if (button.justified) return current?.justify === true && (current.align == null || current.align === 'left');
		return current?.align === button.align && current?.justify !== true;
	}

	function press(button: Button, event: MouseEvent) {
		// the caret stays in the editor: the toolbar takes no focus of its own
		event.preventDefault();
		const view = editorViewStore.current;
		if (!view) return;
		const tr = applyParaFormat(view.state, toggled(current, button.align, button.justified));
		if (!tr) toaster.info({ title: m.parfmt_cannot(), duration: 3000 });
		else view.dispatch(tr);
		view.focus();
	}
</script>

<div class="flex" data-keep-caret role="presentation">
	{#each BUTTONS as button (button.label)}
		<div class="toolbarButton {isOn(button) ? 'preset-tonal-primary' : 'hover:preset-tonal'}">
			<button
				type="button"
				class="flex items-center p-1"
				aria-label={button.label}
				aria-pressed={isOn(button)}
				use:tip={button.label}
				onmousedown={(e) => e.preventDefault()}
				onclick={(e) => press(button, e)}
			>
				<button.icon class="h-5 w-5" />
			</button>
		</div>
	{/each}
</div>

<style lang="postcss">
	@reference "../../../../../app.css";

	.toolbarButton {
		@apply rounded-base transition-all ease-in-out;
	}
</style>
