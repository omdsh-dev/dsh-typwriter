// no published types for linebreak; breakOpportunities uses its one class
declare module 'linebreak' {
	export class LineBreaker {
		constructor(text: string);
		/** the next place a line may end, or null once the text is spent */
		nextBreak(): { position: number; required: boolean } | null;
	}
}
