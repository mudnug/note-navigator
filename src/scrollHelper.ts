import { App, MarkdownView, Notice } from 'obsidian';

export function scrollToEndAndBeyond(app: App) {
	const view = this.app.workspace.getActiveViewOfType(MarkdownView);
	if (!(view?.getMode() === 'source' || view?.getMode() === 'live')) return;

	const editor = view.editor;

	if (!editor) {
		new Notice('No active editor to scroll.');
		return;
	}

	// Scroll to end (like Ctrl+End)
	const lastLine = editor.lastLine();
	editor.setCursor({ ch: editor.getLine(lastLine).length, line: lastLine });

	// Try to scroll half a page further
	const cm = editor.cm || editor.cm6;
	if (cm && cm.getScrollerElement) {
		const scroller = cm.getScrollerElement();
		scroller.scrollTop = scroller.scrollHeight; // Scroll to bottom
		scroller.scrollTop += scroller.clientHeight / 2; // Scroll half page further
	} else if (cm && cm.scrollDOM) {
		cm.scrollDOM.scrollTop = cm.scrollDOM.scrollHeight;
		cm.scrollDOM.scrollTop += cm.scrollDOM.clientHeight / 2;
	}
}
