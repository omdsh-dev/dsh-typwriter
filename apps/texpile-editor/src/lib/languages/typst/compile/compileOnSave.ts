// Ctrl+S 出片：手动保存之后，让宿主把磁盘上的 PDF 重新生成一次。
//
// 实时预览是 tinymist 的内存流，不写文件。自动保存只写源码（防止掉线丢稿，不出片）；
// 只有明确的保存动作（保存命令、Ctrl+S）才出片——和 Word 里「保存」是同一个层级。
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import { nativeBridge } from '$lib/workspace/fileSystem';
import { agentHost } from '$lib/ai/agentPanel/agentHost.svelte';

/** what the host reports for one build of the Typst project's PDF; `detail` is the compiler's own words */
type TypstCompileResult =
	| { ok: true; pdf: string; rel?: string; main: string; ms: number }
	| { ok: false; error: 'no-main' | 'no-workspace' | 'unsupported' | 'compile-failed' | string; detail?: string; ms?: number };

/** the one bridge member Typwriter's host adds for this; TexpileNative is upstream's and stays as it is */
type CompileBridge = { compileProject?: () => Promise<TypstCompileResult> };

async function compileProject(): Promise<TypstCompileResult | undefined> {
	return (nativeBridge() as CompileBridge | undefined)?.compileProject?.();
}

// 写作台 iframe 常驻后，面板被切走时页面不卸载、只是被隐藏；隐藏的页面里定时器会被浏览器
// 节流。宿主在隐藏前通知一声：先把待写的缓冲落盘，别让最后一次改动等着。
if (typeof window !== 'undefined') {
	window.addEventListener('message', (event) => {
		if (event.source !== window.parent) return;
		const notice = event.data as { type?: string } | null;
		if (notice?.type === 'typwriter:host-hidden') void agentHost.current?.flushPendingSave();
	});
}

/** 「全部保存」会连着写几个文件：只出片一次 */
const DEBOUNCE_MS = 150;

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let again = false;

/** 写盘钩子：用户手动保存了一个文件（自动保存不经过这里） */
export function noteExplicitSave(path: string): void {
	if (!/\.typ$/i.test(path)) return;
	if (timer) clearTimeout(timer);
	timer = setTimeout(() => {
		timer = null;
		void compileNow();
	}, DEBOUNCE_MS);
}

/** 出片并把结果告诉用户。出片进行中又来了保存，等这一趟跑完再出一趟。 */
export async function compileNow(): Promise<void> {
	if (running) {
		again = true;
		return;
	}
	running = true;
	try {
		do {
			again = false;
			await runOnce();
		} while (again);
	} finally {
		running = false;
	}
}

async function runOnce(): Promise<void> {
	let result: TypstCompileResult | undefined;
	try {
		result = await compileProject();
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		// a host from before this channel: it rebuilds the PDF by itself after every write, and the
		// bridge has already said on screen that DSH needs a restart — an error here would be untrue
		if (message.includes('未实现的通道')) return;
		toaster.error({ title: m.typst_compile_failed(), description: message });
		return;
	}
	// 没有这个通道，或者当前工作区不是 Typst 项目：没有 PDF 可出，安静跳过
	if (!result || (!result.ok && result.error === 'no-main')) return;
	if (result.ok) {
		toaster.success({
			title: m.typst_compile_done(),
			description: `${result.rel ?? result.pdf} · ${result.ms} ms`
		});
		return;
	}
	toaster.error({ title: m.typst_compile_failed(), description: result.detail || result.error });
}
