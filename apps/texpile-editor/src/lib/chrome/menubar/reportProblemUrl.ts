// a new issue on the bug report form, with the version and OS boxes filled in (the form's field ids)
import { isMac, isWindows } from '$lib/platform';
import { PROJECT_ISSUES_URL } from '$lib/projectLinks';

export function reportProblemUrl(version: string): string {
	const os = isWindows ? 'Windows' : isMac ? 'macOS' : 'Linux';
	const query = new URLSearchParams({ template: 'bug_report.yml', version, os });
	return `${PROJECT_ISSUES_URL}?${query}`;
}
