<script lang="ts">
	// The paragraph settings as Word lays them out, reached from the editor's context menu:
	// alignment, indent and spacing. Nothing is written until OK, and then only what was changed.
	import type { EditorView } from 'prosemirror-view';
	import { PilcrowLeft } from '@lucide/svelte';
	import Modal from '$lib/modals/Modal.svelte';
	import ModalActions from '$lib/modals/ModalActions.svelte';
	import type { DialogButton } from '$lib/modals/dialogButtons';
	import { toaster } from '$lib/modals/toaster-svelte';
	import { applyParaFormat, paraFormatAt } from '../paragraphFormat';
	import { changes, formOf, type ParagraphForm } from '../paragraphDialog';
	import { m } from '$lib/paraglide/messages';

	let { view, onClose }: { view: EditorView | null; onClose: () => void } = $props();

	// the settings of the paragraphs at the caret, read once as the dialog opens on them: the view
	// behind a dialog that is already open is not something to follow
	// svelte-ignore state_referenced_locally
	const first: ParagraphForm = formOf(view ? (paraFormatAt(view.state)?.format ?? null) : null);
	let form = $state<ParagraphForm>({ ...first });

	function ok() {
		const patch = changes(first, form);
		if (patch === 'invalid') {
			toaster.info({ title: m.parfmt_not_a_length(), duration: 3000 });
			return;
		}
		if (patch && view) {
			const tr = applyParaFormat(view.state, patch);
			if (tr) view.dispatch(tr);
			else toaster.info({ title: m.parfmt_cannot(), duration: 3000 });
		}
		onClose();
	}

	const buttons: DialogButton[] = [
		{ label: m.parfmt_ok(), role: 'primary', onclick: ok },
		{ label: m.parfmt_cancel(), role: 'cancel', onclick: () => onClose() }
	];
</script>

<Modal title={m.parfmt_dialog_title()} icon={PilcrowLeft} card="max-h-full max-w-sm overflow-y-auto p-5" onEnter={ok} {onClose}>
	<section class="mb-4">
		<h3 class="mb-2 text-sm font-semibold">{m.parfmt_section_general()}</h3>
		<label class="label">
			<span class="text-sm">{m.parfmt_alignment()}</span>
			<select class="select text-sm" bind:value={form.align}>
				<option value="default">{m.parfmt_default()}</option>
				<option value="left">{m.parfmt_align_left()}</option>
				<option value="center">{m.parfmt_align_center()}</option>
				<option value="right">{m.parfmt_align_right()}</option>
				<option value="justify">{m.parfmt_align_justify()}</option>
			</select>
		</label>
	</section>

	<section class="mb-4">
		<h3 class="mb-2 text-sm font-semibold">{m.parfmt_section_indent()}</h3>
		<label class="label">
			<span class="text-sm">{m.parfmt_indent()}</span>
			<!-- a number is a count of characters; a typst length (12pt) goes as written -->
			<div class="flex items-center gap-2">
				<input class="input text-sm" bind:value={form.indent} placeholder={m.parfmt_default()} />
				<span class="text-muted text-sm">{m.parfmt_chars()}</span>
			</div>
		</label>
	</section>

	<section class="mb-4">
		<h3 class="mb-2 text-sm font-semibold">{m.parfmt_section_spacing()}</h3>
		<label class="label">
			<span class="text-sm">{m.parfmt_leading()}</span>
			<select class="select text-sm" bind:value={form.spacing}>
				<option value="default">{m.parfmt_default()}</option>
				<option value="single">{m.parfmt_spacing_single()}</option>
				<option value="one-and-a-half">{m.parfmt_spacing_one_and_a_half()}</option>
				<option value="double">{m.parfmt_spacing_double()}</option>
				<option value="custom">{m.parfmt_spacing_custom()}</option>
			</select>
		</label>
		{#if form.spacing === 'custom'}
			<label class="label">
				<span class="text-sm">{m.parfmt_spacing_custom()}</span>
				<input class="input text-sm" bind:value={form.leading} placeholder={m.parfmt_spacing_placeholder()} />
			</label>
		{/if}
	</section>

	<p class="text-muted mb-4 text-xs">{m.parfmt_hint()}</p>
	<ModalActions size="xs" {buttons} />
</Modal>
