// 「保存 PDF」的唯一入口：PDF 查看器持有字节，菜单栏持有菜单项，两者没有父子关系。
// 所以这里放一个模块级槽位——查看器挂载时登记自己的 savePdf，卸载时撤掉；
// 菜单栏按 available 决定项要不要灰。
type SaveHandler = (filenameOverride?: string) => Promise<void>;

let handler: SaveHandler | null = null;
/** 有 PDF 可存（查看器在场且拿到了源） */
let available = $state(false);

export const pdfSave = {
	get available(): boolean {
		return available;
	},
	/** 登记一个保存动作；返回撤销函数，供 $effect 的清理用 */
	register(fn: SaveHandler): () => void {
		handler = fn;
		available = true;
		return () => {
			if (handler === fn) {
				handler = null;
				available = false;
			}
		};
	},
	run(): Promise<void> {
		return handler ? handler() : Promise.resolve();
	}
};
