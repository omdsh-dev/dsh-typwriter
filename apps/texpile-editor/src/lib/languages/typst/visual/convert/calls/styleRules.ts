import type { SyntaxNode } from '@lezer/common';
import { readTypstCall, type CallArg } from '../../core/reading/typstCall';
import { typstColorCss } from '../../extensions/css/typstColor';
import { children, childOf } from '../reading/syntaxUtils';

const STYLED = new Set(['text', 'par']);
const WRITTEN = new Set(['Str', 'Int', 'Float', 'Numeric', 'Bool', 'None', 'Auto', 'Ident']);

function written(arg: CallArg, source: string): boolean {
	return WRITTEN.has(arg.kind) || (arg.kind === 'FuncCall' && typstColorCss(arg.node, source) !== null);
}

export function isStyleRule(rule: SyntaxNode, src: string): boolean {
	const call = readTypstCall(`#${src.slice(rule.from, rule.to)}`);
	return (
		!!call &&
		call.form === 'set' &&
		STYLED.has(call.name) &&
		call.bodies.length === 0 &&
		call.args.every((arg) => written(arg, call.source))
	);
}

export function setsOnlyStyle(block: SyntaxNode, src: string): boolean {
	const markup = childOf(block, 'Markup');
	if (!markup) return false;
	let rules = 0;
	for (const kid of children(markup)) {
		if (kid.name === 'ShowRule') return false;
		if (kid.name !== 'SetRule') continue;
		if (!isStyleRule(kid, src)) return false;
		rules++;
	}
	return rules > 0;
}

/** a set rule of the three that shape a paragraph's own looks: par, align and text */
export function isParagraphRule(rule: SyntaxNode, src: string): boolean {
	const call = readTypstCall(`#${src.slice(rule.from, rule.to)}`);
	return (
		!!call &&
		call.form === 'set' &&
		['par', 'align', 'text'].includes(call.name) &&
		call.bodies.length === 0 &&
		call.args.every((arg) => written(arg, call.source))
	);
}

/**
 * A content block that opens with such rules and goes on to the text they shape,
 * `#[ #set par(justify: false) text ]`. The editor's paragraph settings are written there, so
 * it opens as a container with its text editable; a block that opens with anything else is not
 * one of these, and stays as it was.
 */
export function leadsWithParagraphRules(block: SyntaxNode, src: string): boolean {
	const markup = childOf(block, 'Markup');
	if (!markup) return false;
	const kids = children(markup);
	let rules = 0;
	for (let i = 0; i < kids.length; i++) {
		const kid = kids[i];
		if (['Space', 'LineComment', 'BlockComment', 'Parbreak'].includes(kid.name)) continue;
		const next = kids[i + 1];
		if (kid.name !== 'Hash' || !next || next.name !== 'SetRule' || !isParagraphRule(next, src)) return rules > 0;
		rules++;
		i++;
	}
	return rules > 0;
}
