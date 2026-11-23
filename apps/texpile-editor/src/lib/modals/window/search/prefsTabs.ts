import { m } from '$lib/paraglide/messages';
import type { PrefsSectionId } from './prefsRows';

export type PrefsTab =
	| 'appearance'
	| 'editor'
	| 'latex'
	| 'typst'
	| 'snippets'
	| 'proofing'
	| 'vcs'
	| 'collaboration'
	| 'toolchain'
	| 'integrations'
	| 'startup'
	| 'ai';

type TabDef = { id: PrefsTab; label: () => string; desktopOnly?: true; sections?: PrefsSectionId[] };

/**
 * Tabs Typwriter does not offer. Spelling and grammar check English prose; the dictionaries and the
 * grammar engine are cut from the Typwriter package (scripts/prune-app.mjs), which serves Chinese
 * academic writing. The tab's menu, page and search rows are all retired from this one list — the
 * code stays, so restoring one is deleting its id here.
 */
export const RETIRED_TABS: readonly PrefsTab[] = ['proofing'];

export const PREFS_TABS: TabDef[] = [
	{ id: 'appearance', label: () => m.prefs_appearance() },
	{ id: 'editor', label: () => m.prefs_group_editor(), sections: ['source', 'visual'] },
	{ id: 'latex', label: () => m.prefs_group_latex(), sections: ['completion', 'checks', 'folderChecks'] },
	{ id: 'typst', label: () => m.prefs_group_typst() },
	{ id: 'snippets', label: () => m.prefs_group_snippets() },
	// named as the Spelling menu, which leads here
	{ id: 'proofing', label: () => m.prefs_group_proofing(), sections: ['spellFolder', 'spellAll'] },
	{ id: 'vcs', label: () => m.prefs_group_history(), desktopOnly: true, sections: ['git', 'localHistory'] },
	{ id: 'collaboration', label: () => m.prefs_group_collaboration() },
	{ id: 'toolchain', label: () => m.prefs_group_toolchain(), desktopOnly: true },
	{ id: 'integrations', label: () => m.prefs_group_integrations(), desktopOnly: true },
	{ id: 'startup', label: () => m.prefs_group_startup(), desktopOnly: true },
	{ id: 'ai', label: () => m.prefs_group_ai(), desktopOnly: true }
];

/** a tab Typwriter has retired, or one the browser guest has no toolchain, Zotero, MCP server, folder or versions for */
export function tabUnavailable(tab: TabDef): boolean {
	return RETIRED_TABS.includes(tab.id) || (__WEB__ && tab.desktopOnly === true);
}

export function tabLabel(id: PrefsTab): string {
	return PREFS_TABS.find((t) => t.id === id)!.label();
}
