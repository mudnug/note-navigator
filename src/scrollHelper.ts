import { Notice, Editor } from 'obsidian';

export function scrollToEndAndBeyond(editor: Editor) {
    if (!editor) {
        new Notice('No active editor to scroll.');
        return;
    }

    // Scroll to end (like Ctrl+End)
    const lastLine = editor.lastLine();
    editor.setCursor({ ch: editor.getLine(lastLine).length, line: lastLine });

    // Try to scroll half a page further
    // For CodeMirror 5
    const cm = (editor as any).cm;
    if (cm && cm.getScrollerElement) {
        const scroller = cm.getScrollerElement();
        scroller.scrollTop = scroller.scrollHeight; // Scroll to bottom
        scroller.scrollTop += scroller.clientHeight / 2; // Scroll half page further
    } 
    // For CodeMirror 6
    else if ((editor as any).cm && (editor as any).cm.scrollDOM) {
        const cm6 = (editor as any).cm;
        cm6.scrollDOM.scrollTop = cm6.scrollDOM.scrollHeight;
        cm6.scrollDOM.scrollTop += cm6.scrollDOM.clientHeight / 2;
    }
}
