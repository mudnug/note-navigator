import { Notice, Editor } from 'obsidian';

// TypeScript interfaces for CodeMirror 6 internal types
interface CodeMirrorScrollDOM {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
     style: Pick<CSSStyleDeclaration, 'paddingBottom'>;
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

    const obsidianEditor = editor as ObsidianEditorWithCM;
    if (obsidianEditor.cm && obsidianEditor.cm.scrollDOM) {
        const scrollDOM = obsidianEditor.cm.scrollDOM;
        scrollDOM.style.paddingBottom = `${scrollDOM.clientHeight / 2}px`;
        scrollDOM.scrollTop = scrollDOM.scrollHeight;
    }
}
