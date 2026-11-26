// 可视化编辑页的「划选交给 AGENT」：把选区 span 换算成源码行范围，再复用圈选的 sendRegionEdit。
import { NodeSelection } from 'prosemirror-state';
import { selectedSpan, type SpanDeps } from './selectedSpan';
import { editorViewStore, sourceCmView } from '$lib/stores/editorStore';
import { sourceAnchorFor } from '$lib/editor/visual/extensions/pmComments';
import { sendRegionEdit, type RegionPayload } from '$lib/languages/typst/preview/agentCanvas/agentCanvasTurn';
import { agentEditService, agentEditCard, type AgentSelectionEditService, type PreparedAgentEdit } from '$lib/ai/agentSelectionEdit.svelte';
import { setAgentEditHighlight, clearAgentEditHighlight } from '$lib/editor/visual/extensions/agentEditHighlight';
import { setSourceAgentEditHighlight, clearSourceAgentEditHighlight } from '$lib/editor/source/extensions/agentEditHighlight';

type Wiring = SpanDeps & { guest: () => boolean };

function lineOf(text: string, offset: number): number {
	let line = 1;
	for (let i = 0; i < offset && i < text.length; i++) if (text[i] === '\n') line++;
	return line;
}

function regionOf(span: { text: string; from: number; to: number }, file: string): RegionPayload {
	const fromLine = lineOf(span.text, span.from);
	const toLine = lineOf(span.text, Math.max(span.from, span.to - 1));
	return {
		file,
		fromLine,
		toLine,
		via: 'visual-selection',
		fromChar: span.from,
		toChar: span.to,
		quote: span.text.slice(span.from, span.to)
	};
}

export function wireAgentSelectionEdit(d: Wiring): void {
	function available(): boolean {
		return !d.guest() && d.kind() === 'typ' && typeof (globalThis as { texpileSession?: unknown }).texpileSession !== 'undefined';
	}

	function regionFromSelection(): { region: RegionPayload; snippet: string } | null {
		const span = selectedSpan(d);
		const file = d.doc.path;
		if (span && file) return { region: regionOf(span, file), snippet: span.text.slice(span.from, span.to) };
		// 整个公式/块被 NodeSelection 选中时，selectedSpan 不收：用源码锚点再试一次
		const view = editorViewStore.current;
		const sel = view?.state.selection;
		const text = d.comments.activeText();
		if (!view || !sel || !(sel instanceof NodeSelection) || !file) return null;
		if (!['inline_math', 'block_math'].includes(sel.node.type.name)) return null;
		const anchor = sourceAnchorFor(view.state.doc, d.doc.sourceMap, text, sel.from, sel.to);
		if (!anchor || anchor.end <= anchor.start) return null;
		return { region: regionOf({ text, from: anchor.start, to: anchor.end }, file), snippet: text.slice(anchor.start, anchor.end) };
	}

	/** 当前选区换算好；null = 没有选区，或映射不到源码 */
	function selection(): PreparedAgentEdit | null {
		const got = regionFromSelection();
		const view = editorViewStore.current;
		const sel = view?.state.selection;
		if (!got || !view || !sel) return null;
		return { region: got.region, pmFrom: sel.from, pmTo: sel.to };
	}

	const service: AgentSelectionEditService = {
		available,
		visual: () => d.modes.mode === 'visual',
		prepare() {
			if (!available()) return null;
			// 只在可视化页上：源码页的选区高亮画在 PM 位置上，画不到
			return d.modes.mode === 'visual' ? selection() : null;
		},
		start(anchor) {
			if (!available()) return false;
			const ready = selection();
			if (!ready) return false;
			const view = editorViewStore.current;
			if (!view) return false;
			try {
				const a = view.coordsAtPos(ready.pmFrom);
				const b = view.coordsAtPos(ready.pmTo);
				const left = Math.min(a.left, b.left);
				const top = Math.min(a.top, b.top);
				const rect = {
					left,
					top,
					width: Math.max(a.right, b.right) - left,
					height: Math.max(a.bottom, b.bottom) - top
				};
				agentEditCard.current = { anchor, ...ready, snippet: ready.region.quote?.trim() ?? '', rect };
				return true;
			} catch {
				return false;
			}
		},
		run: (prepared, intent) => dispatch(prepared, intent),
		async send(prompt) {
			const card = agentEditCard.current;
			if (!card) return '没有可发送的选区';
			return dispatch(card, prompt);
		},
		busy: () => agentEditCard.current !== null
	};

	/** 把一段意图连同选区交给 AGENT，选区在两页上高亮到这一轮结束；失败返回错误文本 */
	async function dispatch(target: PreparedAgentEdit, prompt: string): Promise<string | null> {
		const from = target.region.fromChar;
		const to = target.region.toChar;
		const pmFrom = target.pmFrom;
		const pmTo = target.pmTo;
		function paint(): void {
			// 可视化页用 PM 位置（不能用源码 offset），源码页用字符 offset；split 时两边都画
			setAgentEditHighlight(editorViewStore.current, pmFrom, pmTo);
			if (from !== undefined && to !== undefined) setSourceAgentEditHighlight(sourceCmView.current, from, to);
		}
		function clear(): void {
			clearAgentEditHighlight(editorViewStore.current);
			clearSourceAgentEditHighlight(sourceCmView.current);
			window.removeEventListener('typwriter:agent-turn-end', clear);
		}
		paint();
		window.addEventListener('typwriter:agent-turn-end', clear, { once: true });
		try {
			await sendRegionEdit(target.region, prompt);
			return null;
		} catch (e) {
			clear();
			return e instanceof Error ? e.message : String(e);
		}
	}
	agentEditService.current = service;
	$effect(() => () => {
		if (agentEditService.current === service) agentEditService.current = null;
	});
}
