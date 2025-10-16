import { Notice, Editor } from 'obsidian';

// TypeScript interfaces for CodeMirror 6 internal types
interface CodeMirrorScrollDOM {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
}

interface CodeMirrorInstance {
    scrollDOM: CodeMirrorScrollDOM;
}

interface ObsidianEditorWithCM extends Editor {
    cm?: CodeMirrorInstance;
}

export function scrollToEndAndBeyond(editor: Editor) {
    if (!editor) {
        new Notice('No active editor to scroll.');
        return;
    }

    // Scroll to end (like Ctrl+End)
    const lastLine = editor.lastLine();
    editor.setCursor({ ch: editor.getLine(lastLine).length, line: lastLine });

    // Try to scroll half a page further
    const obsidianEditor = editor as ObsidianEditorWithCM;
    if (obsidianEditor.cm && obsidianEditor.cm.scrollDOM) {
        const cm6 = obsidianEditor.cm;
        cm6.scrollDOM.scrollTop = cm6.scrollDOM.scrollHeight;
        cm6.scrollDOM.scrollTop += cm6.scrollDOM.clientHeight / 2;
    }
}
