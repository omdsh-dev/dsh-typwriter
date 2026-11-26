<script lang="ts">
	// The paragraph settings as Word lays them out, reached from the editor's context menu. Nothing
	// is written until OK, and then only what was changed. A paragraph with settings of its own
	// shows them; one without shows what the file's defaults say for every paragraph.
	import type { EditorView } from 'prosemirror-view';
	import { PilcrowLeft } from '@lucide/svelte';
	import Modal from '$lib/modals/Modal.svelte';
	import ModalActions from '$lib/modals/ModalActions.svelte';
	import type { DialogButton } from '$lib/modals/dialogButtons';
	import { toaster } from '$lib/modals/toaster-svelte';
	import { tip } from '$lib/components/tooltip.svelte';
	import { applyParaFormat, noFormat, paraFormatAt } from '../paragraphFormat';
	import { applyDocumentDefaults, documentDefaults } from '../paragraphDefaults';
	import { changes, defaultChanges, effective, formOf, type ParagraphForm } from '../paragraphDialog';
	import { m } from '$lib/paraglide/messages';

	let { view, onClose }: { view: EditorView | null; onClose: () => void } = $props();

	// svelte-ignore state_referenced_locally
	const at = view ? paraFormatAt(view.state) : null;
	// what the dialog opens on: what the document's defaults say, and what the paragraph's own settings
	// say over them. Read once, as the dialog opens: the view behind a dialog that is already open is
	// not something to follow
	// svelte-ignore state_referenced_locally
	const defaults = view ? { ...noFormat(), ...documentDefaults(view.state).format } : null;
	// svelte-ignore state_referenced_locally
	const first: ParagraphForm = formOf(view && defaults ? effective(defaults, at?.format ?? null) : null);
	// an inset written by hand (a single length, a variable) is left alone, and so are the fields for it
	const insetForeign = at?.insetForeign ?? false;
	let form = $state<ParagraphForm>({ ...first });

	function refuseLength() {
		toaster.info({ title: m.parfmt_not_a_length(), duration: 3000 });
	}

	function ok() {
		const patch = changes(first, form);
		if (patch === 'invalid') {
			refuseLength();
			return;
		}
		if (patch && view) {
			const tr = applyParaFormat(view.state, patch);
			if (tr) view.dispatch(tr);
			else toaster.info({ title: m.parfmt_cannot(), duration: 3000 });
		}
		onClose();
	}

	// Word's Default button: what the dialog shows becomes what every paragraph falls back on. For
	// Typwriter those defaults are written at the top of the paper file.
	function setDefault() {
		const patch = defaultChanges(form);
		if (!view) return onClose();
		if (patch === 'invalid') {
			refuseLength();
			return;
		}
		view.dispatch(applyDocumentDefaults(view.state, patch));
		toaster.info({ title: m.parfmt_default_done(), duration: 3000 });
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
		<div class="grid grid-cols-2 gap-3">
			<label class="label">
				<span class="text-sm">{m.parfmt_left_indent()}</span>
				<!-- a number is a count of characters; a typst length (12pt) goes as written -->
				<input class="input text-sm" bind:value={form.left} placeholder={m.parfmt_default()} disabled={insetForeign} />
			</label>
			<label class="label">
				<span class="text-sm">{m.parfmt_right_indent()}</span>
				<input class="input text-sm" bind:value={form.right} placeholder={m.parfmt_default()} disabled={insetForeign} />
			</label>
		</div>
		{#if insetForeign}
			<p class="text-muted text-xs">{m.parfmt_inset_foreign()}</p>
		{/if}
		<div class="mt-3 grid grid-cols-2 gap-3">
			<label class="label">
				<span class="text-sm">{m.parfmt_special()}</span>
				<select class="select text-sm" bind:value={form.special}>
					<option value="none">{m.parfmt_special_none()}</option>
					<option value="first-line">{m.parfmt_special_first_line()}</option>
					<option value="hanging">{m.parfmt_special_hanging()}</option>
				</select>
			</label>
			<label class="label">
				<span class="text-sm">{m.parfmt_measure()}</span>
				<input class="input text-sm" bind:value={form.indent} placeholder="2" disabled={form.special === 'none'} />
			</label>
		</div>
	</section>

	<section class="mb-4">
		<h3 class="mb-2 text-sm font-semibold">{m.parfmt_section_spacing()}</h3>
		<div class="grid grid-cols-2 gap-3">
			<label class="label">
				<span class="text-sm">{m.parfmt_before()}</span>
				<input class="input text-sm" bind:value={form.before} placeholder={m.parfmt_default()} />
			</label>
			<label class="label">
				<span class="text-sm">{m.parfmt_after()}</span>
				<input class="input text-sm" bind:value={form.after} placeholder={m.parfmt_default()} />
			</label>
		</div>
		<div class="mt-3 grid grid-cols-2 gap-3">
			<label class="label">
				<span class="text-sm">{m.parfmt_leading()}</span>
				<select class="select text-sm" bind:value={form.spacing}>
					<option value="default">{m.parfmt_default()}</option>
					<option value="single">{m.parfmt_spacing_single()}</option>
					<option value="one-and-a-half">{m.parfmt_spacing_one_and_a_half()}</option>
					<option value="double">{m.parfmt_spacing_double()}</option>
					<option value="exact">{m.parfmt_spacing_exact()}</option>
					<option value="custom">{m.parfmt_spacing_custom()}</option>
				</select>
			</label>
			{#if form.spacing === 'exact'}
				<label class="label">
					<span class="text-sm">{m.parfmt_spacing_value()}</span>
					<!-- a bare number is points, as in Word's own field; a typst length (1.5em) goes as written -->
					<input class="input text-sm" bind:value={form.exact} placeholder={m.parfmt_exact_placeholder()} />
				</label>
			{:else if form.spacing === 'custom'}
				<label class="label">
					<span class="text-sm">{m.parfmt_spacing_value()}</span>
					<input class="input text-sm" bind:value={form.leading} placeholder={m.parfmt_spacing_placeholder()} />
				</label>
			{/if}
		</div>
	</section>

	<section class="mb-4">
		<h3 class="mb-2 text-sm font-semibold">{m.parfmt_section_pagination()}</h3>
		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" class="checkbox" bind:checked={form.keepTogether} />
			<span>{m.parfmt_keep_together()}</span>
		</label>
		<label class="mt-2 flex items-center gap-2 text-sm">
			<input type="checkbox" class="checkbox" bind:checked={form.keepWithNext} />
			<span>{m.parfmt_keep_with_next()}</span>
		</label>
	</section>

	<p class="text-muted mb-4 text-xs">{m.parfmt_hint()}</p>
	<div class="flex items-center justify-between gap-3">
		<button type="button" class="btn btn-xs preset-tonal" use:tip={m.parfmt_default_hint()} onclick={setDefault}>
			{m.parfmt_set_default()}
		</button>
		<ModalActions size="xs" {buttons} />
	</div>
</Modal>
