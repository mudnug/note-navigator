import { Notice, Plugin, TFile, App, Editor, MarkdownView } from 'obsidian';

import { DeletionHelper } from './deletionHelper';
import { FileHelper } from './fileHelper';
import { scrollToEndAndBeyond } from './scrollHelper';
import { DEFAULT_SETTINGS, NoteNavigatorSettings, NoteNavigatorSettingTab } from './settings';

export default class NoteNavigator extends Plugin {
	settings: NoteNavigatorSettings;
	private deletionHelper: DeletionHelper;
	private fileHelper: FileHelper;

	async onload() {
		await this.loadSettings();

		this.fileHelper = new FileHelper(this.app);
		this.deletionHelper = new DeletionHelper(this.app, this.settings);

		this.registerCommands();
		this.addSettingTab(new NoteNavigatorSettingTab(this.app, this));
	}

	async loadSettings() {
		try {
			const data = await this.loadData();
			this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		} catch (error) {
			console.error('Error loading settings:', error);
		}
	}

	async saveSettings() {
		try {
			await this.saveData(this.settings);
		} catch (error) {
			console.error("Issue persisting save:", error);
		}
	}

	onunload() { }

	private registerCommands() {
		const commands = [
			{
				checkCallback: (checking: boolean) => {
					const activeFile = this.app.workspace.getActiveFile();
					if (activeFile) {
						if (!checking) this.NoteNavigator();
						return true;
					}
					return false;
				},
				id: 'delete-and-navigate',
				name: 'Delete current file and navigate to next note',
			},
			{
				checkCallback: (checking: boolean) => {
					const activeFile = this.app.workspace.getActiveFile();
					if (activeFile) {
						if (!checking) this.navigateFile("next");
						return true;
					}
					return false;
				},
				id: 'navigate-next-file',
				name: 'Navigate to next file',
			},
			{
				checkCallback: (checking: boolean) => {
					const activeFile = this.app.workspace.getActiveFile();
					if (activeFile) {
						if (!checking) this.navigateFile("prev");
						return true;
					}
					return false;
				},
				id: 'navigate-previous-file',
				name: 'Navigate to previous file',
			},
			{
				checkCallback: (checking: boolean) => {
					const activeFile = this.app.workspace.getActiveFile();
					if (activeFile && activeFile.parent) {
						if (!checking) this.outputDebugMessages();
						return true;
					}
					return false;
				},
				id: 'navigate-debug-sorting',
				name: 'Log debugging messages to console',
			},
			{
				editorCallback: (editor: Editor) => {
					scrollToEndAndBeyond(editor);
				},
				id: 'navigate-scroll-to-end-and-beyond',
				name: 'Scroll past end of note',
			},
			{
				checkCallback: (checking: boolean) => {
					const activeFile = this.app.workspace.getActiveFile();
					if (activeFile) {
						if (!checking) this.moveAndNavigate();
						return true;
					}
					return false;
				},
				id: 'move-and-navigate',
				name: 'Move current file and navigate to next note',
			},
			{
				checkCallback: (checking: boolean) => {
					const activeFile = this.app.workspace.getActiveFile();
					if (activeFile && activeFile.parent) {
						if (!checking) this.renameParentFolder();
						return true;
					}
					return false;
				},
				id: 'rename-parent-folder',
				name: 'Rename parent folder of current note',
			},
		];

		for (const cmd of commands) {
			this.addCommand(cmd);
		}
	}

	private async NoteNavigator() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('A file must be open in the active editor.');
			return;
		}

		try {
			const [attachments, orphanedFolders] = await this.deletionHelper.prepareForDeletion(activeFile);

			if (this.settings.showConfirmationPrompt) {
				const confirmed = await this.deletionHelper.confirmDeletion(activeFile, attachments, orphanedFolders);
				if (!confirmed) return;
			}

			if (this.settings.navigateOnDelete) {
				this.navigateFile("next");
			}

			// apply a delay before deleting the file to avoid 'tab is busy' notification
			await this.deletionHelper.safeDelete(activeFile, `File deleted`, 200);
			this.settings.numberOfDeletedFiles++;
			await this.deletionHelper.handleAttachmentsAndFolders(attachments, orphanedFolders);
			this.settings.numberOfDeletedAttachments += attachments.length;
			this.settings.numberOfDeletedFolders += orphanedFolders.size;
			await this.saveSettings();
		} catch (error) {
			console.error('Error while navigating or deleting:', error);
			new Notice('An error occurred while navigating or deleting the file.');
		}
	}

	private async navigateFile(direction: "next" | "prev") {
		this.settings.numberOfFilesNavigated++;
		await this.saveSettings();
		this.fileHelper.navigateFile(direction, this.settings.navigationScope);
	}

	private async moveAndNavigate() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('A file must be open in the active editor.');
			return;
		}

		const nextFile = this.fileHelper.getAdjacentFile(activeFile, "next", this.settings.navigationScope);
		const nextFilePath = nextFile ? nextFile.path : null;
		if (!nextFilePath) return;

		// Listen for the file rename (move) event
		const onRename = async (file: TFile, oldPath: string) => {
			if (file instanceof TFile && file.name === activeFile.name && oldPath.endsWith(activeFile.name)) {
				this.app.vault.off('rename', onRename);
				if (dialogObserver) dialogObserver.disconnect();
				const fileToOpen = this.app.vault.getAbstractFileByPath(nextFilePath);
				if (fileToOpen && fileToOpen instanceof TFile) {
					await this.app.workspace.getLeaf().openFile(fileToOpen);
					this.settings.numberOfFilesNavigated++;
					await this.saveSettings();
				}
			}
		};
		this.app.vault.on('rename', onRename);

		// Set up a MutationObserver to detect dialog close/cancel and clean up the event handler
		let dialogObserver: MutationObserver | null = null;
		const waitForDialog = () => {
			let dialog = document.querySelector('.modal.mod-rename-file');
			if (!dialog) {
				dialog = Array.from(document.querySelectorAll('.modal')).find(modal => {
					const header = modal.querySelector('.modal-header .modal-title');
					return header && /move/i.test(header.textContent || '');
				}) || null;
			}
			if (dialog && dialog.parentElement) {
				dialogObserver = new MutationObserver(() => {
					if (!dialog || !dialog.parentElement || !dialog.parentElement.contains(dialog)) {
						this.app.vault.off('rename', onRename);
						if (dialogObserver) dialogObserver.disconnect();
					}
				});
				dialogObserver.observe(dialog.parentElement, { childList: true });
			} else {
				setTimeout(waitForDialog, 50);
			}
		};
		waitForDialog();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(this.app as App & { commands?: any }).commands?.executeCommandById?.("file-explorer:move-file");
	}

	private outputDebugMessages() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || !activeFile.parent) {
			new Notice('No active file or folder to debug sorting.');
			return;
		}

		// Output current sort order
		const fileExplorerLeaf = this.app.workspace.getLeavesOfType("file-explorer")[0];
		let sortOrder = "alphabetical"; // Default sort order
		if (fileExplorerLeaf) {
			const state = fileExplorerLeaf.view.getState();
			sortOrder = typeof state.sortOrder === 'string' ? state.sortOrder : "alphabetical";
		}
		console.log(`Current sort order: ${sortOrder}`);

		// Output current file deletion method
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const deletionMethod = (this.app.vault as any).getConfig("trashOption") as "local" | "system" | "none";
		const friendlyDeletionMethod = {
			"local": "Move to obsidian trash (.trash folder)",
			"none": "Permanently delete",
			"system": "Move to system trash",
		}[deletionMethod] || "Unknown";
		console.log(`Current file deletion method: ${friendlyDeletionMethod}`);

		// Log sorted files in the current folder
		const folderFiles = activeFile.parent.children.filter((child): child is TFile => child instanceof TFile);
		const sortedFiles = this.fileHelper.sortFiles(folderFiles);
		console.log('Sorted files in the current folder:');
		sortedFiles.forEach(file => console.log(file.path));
	}

	private async renameParentFolder() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || !activeFile.parent) {
			new Notice('No active file or parent folder found.');
			return;
		}
		const parentFolder = activeFile.parent;

		// Reveal the parent folder in the file explorer before showing the rename prompt
		const fileExplorerLeaf = this.app.workspace.getLeavesOfType("file-explorer")[0];
		if (fileExplorerLeaf && fileExplorerLeaf.view) {
			// @ts-ignore
			fileExplorerLeaf.view.revealInFolder(parentFolder);
		}

		// @ts-ignore
		if (typeof this.app.fileManager?.promptForFileRename === "function") {
			// @ts-ignore
			this.app.fileManager.promptForFileRename(parentFolder);
			setTimeout(() => {
				const textarea: HTMLTextAreaElement | null =
					document.querySelector('.rename-textarea');
				if (textarea) {
					if (textarea.value === "undefined") {
						textarea.value = parentFolder.name;
					} 
					textarea.focus();
					textarea.select();
				}
				const header: HTMLElement | null = document.querySelector('.modal.mod-file-rename .modal-header .modal-title');
				if (header && header.textContent?.trim() === "File name") {
					header.textContent = "Rename Folder";
				}
			}, 100);
		} else {
			new Notice('promptForFileRename is not available in this version of Obsidian.');
		}
	}
}

