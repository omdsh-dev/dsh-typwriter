import { Columns2, Images } from '@lucide/svelte';
import { typGridNode, typSubfiguresNode, type BlockInsertItem } from '$lib/languages/typst/visual/core';
import { m } from '$lib/paraglide/messages';

export function gridInserts(): BlockInsertItem[] {
	return [
		{
			id: 'grid',
			label: m.typ_layout_title_grid(),
			icon: Columns2,
			category: 'common',
			shape: 'block',
			style: false,
			select: 'in',
			make: (s) => typGridNode(s)
		},
		{
			id: 'subfigures',
			label: m.blockmenu_subfigures(),
			icon: Images,
			category: 'common',
			shape: 'block',
			style: false,
			// the caret lands in the first cell, where the first image goes
			select: 'in',
			make: (s) => typSubfiguresNode(s)
		}
	];
}
