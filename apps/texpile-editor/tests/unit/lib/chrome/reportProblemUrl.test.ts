// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { reportProblemUrl } from '$lib/chrome/menubar/reportProblemUrl';

it('opens a new issue on this project, on the bug report form, with the version and OS filled in', () => {
	const url = new URL(reportProblemUrl('1.7.6'));
	expect(url.origin + url.pathname).toBe('https://github.com/omdsh-dev/dsh-typwriter/issues/new');
	expect(url.searchParams.get('template')).toBe('bug_report.yml');
	expect(url.searchParams.get('version')).toBe('1.7.6');
	expect(['Windows', 'macOS', 'Linux']).toContain(url.searchParams.get('os'));
});
