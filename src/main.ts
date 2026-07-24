import { Notice, Plugin, TFile, App, Editor, TFolder, SuggestModal, TAbstractFile, Vault, EventRef } from 'obsidian';

export type WorkspaceWithConfigChange = App['workspace'] & {
	on(name: 'config-change', callback: () => void): EventRef;
};

import { DeletionHelper } from './deletionHelper';
import { FileHelper } from './fileHelper';
import { scrollToEndAndBeyond } from './scrollHelper';
import { DEFAULT_SETTINGS, NoteNavigatorSettings, NoteNavigatorSettingTab } from './settings';
import { StatisticsStorage, StatsKey } from './statisticsStorage';

export default class NoteNavigator extends Plugin {
	settings: NoteNavigatorSettings;
	statisticsStorage: StatisticsStorage;
	private deletionHelper: DeletionHelper;
	private fileHelper: FileHelper;
	private dialogObserver: MutationObserver | null = null;
	private renameTimeout: number | null = null;
	private dialogWaitTimeout: number | null = null;
	private configChangeListenerRegistered = false;
	private fadeObserver: MutationObserver | null = null;


	async onload() {
		await this.loadSettings();

		this.statisticsStorage = new StatisticsStorage(this, this.settings.statisticsStorageMode);
		this.fileHelper = new FileHelper(this.app, this.settings);
		this.deletionHelper = new DeletionHelper(this.app, this.settings);

		this.registerCommands();
		this.addSettingTab(new NoteNavigatorSettingTab(this.app, this));
		activeWindow.setTimeout(() => this.applyAttachmentFade(), 100);

		if (!this.configChangeListenerRegistered) {
			this.configChangeListenerRegistered = true;
			this.registerEvent((this.app.workspace as WorkspaceWithConfigChange).on('config-change', () => {
				this.updateAttachmentFolderFade();
			}));
		}
	}

	async loadSettings() {
		try {
			const data: unknown = await this.loadData();
			this.settings = Object.assign({}, DEFAULT_SETTINGS, data as Partial<NoteNavigatorSettings>);
			this.statisticsStorage?.setMode(this.settings.statisticsStorageMode, false);
		} catch {
			// "Note Navigator" is the proper name of the plugin and must retain its capitalization
			new Notice('Error loading Note Navigator plugin settings. Using defaults.');
		}
	}
	
	async saveSettings() {
		try {
			await this.saveData(this.settings);
		} catch {
			// "Note Navigator" is the proper name of the plugin and must retain its capitalization
			new Notice('Error saving Note Navigator plugin settings.');
		}
	}

	updateAttachmentFolderFade() {
		try {
			this.clearAttachmentFade();

			if (!this.settings.fadeAttachmentFolders) {
				return;
			}

			const attachmentPath = this.getAttachmentFolderPath();
			if (!attachmentPath || attachmentPath === "." || attachmentPath === "./") {
				return;
			}

			const pathSegments = attachmentPath.split('/');
			const folderName = pathSegments[pathSegments.length - 1];

			const titles = activeDocument.querySelectorAll(`.nav-folder-title[data-path$="${CSS.escape(folderName)}"]`);
			titles.forEach(title => {
				const folder = title.closest('.nav-folder');
				if (folder) folder.addClass('note-navigator-fade');
			});
		} catch (error) {
			console.error('[Note Navigator] Failed to update attachment folder fade:', error);
		}
	}

	private applyAttachmentFade() {
		if (!this.settings.fadeAttachmentFolders) {
			return;
		}

		this.clearAttachmentFade();

		const attachmentPath = this.getAttachmentFolderPath();
		if (!attachmentPath || attachmentPath === "." || attachmentPath === "./") {
			return;
		}

		const pathSegments = attachmentPath.split('/');
		const folderName = pathSegments[pathSegments.length - 1];
		const selector = `.nav-folder-title[data-path$="${CSS.escape(folderName)}"]`;

		if (activeDocument.querySelector(selector)) {
			this.updateAttachmentFolderFade();
			return;
		}

		this.fadeObserver = new MutationObserver(() => {
			if (activeDocument.querySelector(selector)) {
				this.updateAttachmentFolderFade();
				this.fadeObserver?.disconnect();
				this.fadeObserver = null;
			}
		});

		this.fadeObserver.observe(activeDocument.body, { childList: true, subtree: true });

		activeWindow.setTimeout(() => {
			this.fadeObserver?.disconnect();
			this.fadeObserver = null;
		}, 5000);
	}

	onunload() {
		if (this.dialogObserver) {
			this.dialogObserver.disconnect();
		}

		if (this.renameTimeout) {
			activeWindow.clearTimeout(this.renameTimeout);
		}

		if (this.dialogWaitTimeout) {
			activeWindow.clearTimeout(this.dialogWaitTimeout);
		}

		try {
			this.clearAttachmentFade();
			this.fadeObserver?.disconnect();
			this.fadeObserver = null;
		} catch (error) {
			console.error('[Note Navigator] Failed to cleanup attachment folder fade:', error);
		}
	}

	private getVaultConfig(key: string): unknown {
		return (this.app.vault as Vault & { getConfig: (key: string) => unknown }).getConfig(key);
	}

	private getAttachmentFolderPath(): string {
		const configValue = this.getVaultConfig("attachmentFolderPath");
		return typeof configValue === "string" ? configValue : "";
	}

	private clearAttachmentFade(): void {
		activeDocument.querySelectorAll('.nav-folder.note-navigator-fade').forEach(el => {
			el.removeClass('note-navigator-fade');
		});
	}

	private registerCommands() {
		const commands = [
			{
				checkCallback: (checking: boolean) => {
					const activeFile = this.app.workspace.getActiveFile();
					if (activeFile) {
						if (!checking) void this.deleteCurrentFileAndNavigate();
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
						if (!checking) {
							void this.navigateFile("next").catch(error => {
								const msg = error instanceof Error ? error.message : String(error);
								new Notice(`Error navigating to next file: ${msg}`);
							});
						}
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
						if (!checking) {
							void this.navigateFile("prev").catch(error => {
								const msg = error instanceof Error ? error.message : String(error);
								new Notice(`Error navigating to previous file: ${msg}`);
							});
						}
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
				id: 'log-debugging-messages',
				name: 'Log messages to console (debug)',
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
						if (!checking) void this.moveAndNavigate();
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
						if (!checking) void this.renameParentFolder();
						return true;
					}
					return false;
				},
				id: 'rename-parent-folder',
				name: 'Rename parent folder of current note',
			},
			{
				checkCallback: (checking: boolean) => {
					const activeFile = this.app.workspace.getActiveFile();
					if (activeFile && activeFile.parent) {
						if (!checking) void this.moveParentFolderAndNavigate();
						return true;
					}
					return false;
				},
				id: 'move-parent-folder-and-navigate',
				name: 'Move parent folder and navigate to next note',
			},
		];

		for (const cmd of commands) {
			this.addCommand(cmd);
		}
	}

	private async deleteCurrentFileAndNavigate() {
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
				try {
					await this.navigateFile("next");
				} catch (error) {
					const msg = error instanceof Error ? error.message : String(error);
					new Notice(`Error navigating after deletion: ${msg}`);
				}
			}

			// apply a delay before deleting the file to avoid 'tab is busy' notification
			await this.deletionHelper.safeDelete(activeFile, `File deleted`, 200);
			this.statisticsStorage.increment(StatsKey.DeletedFiles);
			await this.deletionHelper.handleAttachmentsAndFolders(attachments, orphanedFolders);
			this.statisticsStorage.increment(StatsKey.DeletedAttachments, attachments.length);
			this.statisticsStorage.increment(StatsKey.DeletedFolders, orphanedFolders.size);
			await this.saveSettings();
		} catch {
			new Notice('An error occurred while navigating or deleting the file.');
		}
	}

	private async navigateFile(direction: "next" | "prev") {
		try {
			this.statisticsStorage.increment(StatsKey.FilesNavigated);
			await this.saveSettings();
			await this.fileHelper.navigateFile(direction, this.settings.navigationScope);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			new Notice(`Error navigating to ${direction} file: ${msg}`);
		}
	}

	private async moveAndNavigate() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('A file must be open in the active editor.');
			return;
		}
		this.handleMoveAndNavigate({
			getNextFilePath: () => {
				const nextFile = this.fileHelper.getAdjacentFile(activeFile, "next", this.settings.navigationScope);
				return nextFile ? nextFile.path : null;
			},
			getTarget: () => activeFile,
			moveCommandId: "file-explorer:move-file"
		});
	}

	private handleMoveAndNavigate({
		getNextFilePath,
		getTarget,
		moveCommandId
	}: {
		getTarget: () => unknown,
		getNextFilePath: () => string | null,
		moveCommandId: string
	}) {

		const target = getTarget();
		const nextFilePath = getNextFilePath();
		if (!target || !nextFilePath) return;
		const originalParentFolder = target instanceof TFile ? target.parent : null;

		const onRename = async (file: TAbstractFile, oldPath: string) => {
			if (file === target) {
				this.app.vault.off('rename', onRename);
				if (this.dialogObserver) this.dialogObserver.disconnect();

				if (originalParentFolder) {
					await this.checkAndCleanupEmptyParentFolder(originalParentFolder);
				}

				const fileToOpen = this.app.vault.getAbstractFileByPath(nextFilePath);
				if (fileToOpen && fileToOpen instanceof TFile) {
					await this.app.workspace.getLeaf().openFile(fileToOpen);
					this.statisticsStorage.increment(StatsKey.FilesNavigated);
					await this.saveSettings();
				}
			}
		};
		this.registerEvent(this.app.vault.on('rename', onRename));

		const waitForDialog = () => {
			let dialog = activeDocument.querySelector('.modal.mod-rename-file');
			if (!dialog) {
				dialog = Array.from(activeDocument.querySelectorAll('.modal')).find(modal => {
					const header = modal.querySelector('.modal-header .modal-title');
					return header && /move/i.test(header.textContent || '');
				}) || null;
			}
			if (dialog && dialog.parentElement) {
				// Disconnect any existing observer before creating a new one
				if (this.dialogObserver) {
					this.dialogObserver.disconnect();
				}
				this.dialogObserver = new MutationObserver(() => {
					if (!dialog || !dialog.parentElement || !dialog.parentElement.contains(dialog)) {
						this.app.vault.off('rename', onRename);
						if (this.dialogObserver) this.dialogObserver.disconnect();
					}
				});
				this.dialogObserver.observe(dialog.parentElement, { childList: true });
			} else {
				// Clear any existing timeout before setting a new one
				if (this.dialogWaitTimeout) {
					activeWindow.clearTimeout(this.dialogWaitTimeout);
				}
				this.dialogWaitTimeout = activeWindow.setTimeout(waitForDialog, 50);
			}
		};
		waitForDialog();

		 
		(this.app as App & { commands?: { executeCommandById?: (id: string) => void } }).commands?.executeCommandById?.(moveCommandId);
	}

	/* The following console log messages are specifically requested by the user here */
	private outputDebugMessages() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || !activeFile.parent) {
			new Notice('No active file or folder to debug sorting.');
			return;
		}

		if (!this.settings.enableDebugLogging) {
			new Notice('Debug logging is disabled. Enable it in settings to see more debug information.');
			return;
		}

		// Debug logging - intentional console output for debugging
		// This code only runs when enableDebugLogging setting is true
		console.group('Note Navigator Debug Information');
		console.log(`Current file: ${activeFile.path}`);
		console.log(`Current folder: ${activeFile.parent.path}`);
		console.log(`Settings - removeEmptyFolders: ${this.settings.removeEmptyFolders}`);
		console.log(`Settings - parentDirectoryDepth: ${this.settings.maxDirectoryDeleteTraversal}`);

		// Output current sort order
		const fileExplorerLeaf = this.app.workspace.getLeavesOfType("file-explorer")[0];
		let sortOrder = "alphabetical"; // Default sort order
		if (fileExplorerLeaf && fileExplorerLeaf.view) {
			const state = fileExplorerLeaf.view.getState();
			sortOrder = typeof state.sortOrder === 'string' ? state.sortOrder : "alphabetical";
		}
		console.log(`Current sort order: ${sortOrder}`);

		// Output current file deletion method
		const deletionMethod = this.getVaultConfig("trashOption");
		const friendlyDeletionMethod: Record<string, string> = {
			"local": "Move to obsidian trash (.trash folder)",
			"none": "Permanently delete",
			"system": "Move to system trash",
		};
		const methodLabel = friendlyDeletionMethod[deletionMethod as string] || "Unknown";
		console.log(`Current file deletion method: ${methodLabel}`);

		// Log sorted files in the current folder
		const folderFiles = activeFile.parent.children.filter((child): child is TFile => child instanceof TFile);
		const sortedFiles = this.fileHelper.sortFiles(folderFiles);
		console.log('Sorted files in the current folder:');
		sortedFiles.forEach(file => console.log(`  - ${file.path}`));

		console.groupEnd();

		new Notice('Debug information logged to console. Check the developer console for details.');
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
			(fileExplorerLeaf.view as unknown as { revealInFolder: (f: TFolder) => void }).revealInFolder(parentFolder);
		}

		if (typeof (this.app as unknown as { fileManager: { promptForFileRename: (f: TFolder) => void } }).fileManager?.promptForFileRename === "function") {
			(this.app as unknown as { fileManager: { promptForFileRename: (f: TFolder) => void } }).fileManager.promptForFileRename(parentFolder);
			// Clear any existing timeout before setting a new one
			if (this.renameTimeout) {
				activeWindow.clearTimeout(this.renameTimeout);
			}
			this.renameTimeout = activeWindow.setTimeout(() => {
				const textarea: HTMLTextAreaElement | null =
					activeDocument.querySelector('.rename-textarea');
				if (textarea) {
					if (textarea.value === "undefined") {
						textarea.value = parentFolder.name;
					}
					textarea.focus();
					textarea.select();
				}
				const header: HTMLElement | null = activeDocument.querySelector('.modal.mod-file-rename .modal-header .modal-title');
				if (header && header.textContent?.trim() === "File name") {
					header.textContent = "Rename folder";
				}
			}, 100);
		}
	}

	private async checkAndCleanupEmptyParentFolder(parentFolder: TFolder): Promise<void> {
		if (this.settings.removeEmptyFolders && this.fileHelper.isFolderCurrentlyEmpty(parentFolder)) {
			if (this.settings.showConfirmationPrompt) {
				const confirmed = await this.deletionHelper.confirmDeletionForEmptyFolder(parentFolder);
				if (!confirmed) return;
			}

			await this.deletionHelper.safeDelete(parentFolder, `Empty folder deleted after move`, 0);
			this.statisticsStorage.increment(StatsKey.DeletedFolders);
			await this.saveSettings();
		}
	}

	private async moveParentFolderAndNavigate() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || !activeFile.parent) {
			new Notice('No active file or parent folder found.');
			return;
		}
		const parentFolder = activeFile.parent;

		// Helper function to check if a folder is a descendant of the parent folder
		const isDescendant = (folder: TFolder, parent: TFolder): boolean => {
			let current: TFolder | null = folder.parent;
			while (current) {
				if (current === parent) {
					return true;
				}
				current = current.parent;
			}
			return false;
		};

		const getFoldersWithinDepth = (currentFolder: TFolder, maxDepth?: number): TFolder[] => {
			const folders: TFolder[] = [];

			// Add all child folders of current folder (but not the current folder itself)
			if (currentFolder.children) {
				for (const child of currentFolder.children) {
					if (child instanceof TFolder && child !== currentFolder) {
						// Don't add if it's a descendant of the parent folder (to avoid moving into itself)
						if (!isDescendant(child, parentFolder)) {
							folders.push(child);
						}
					}
				}
			}

			// Also add the parent folder if we're not at root level and within depth limit
			if (currentFolder.parent && currentFolder.parent !== currentFolder && (maxDepth === undefined || 1 <= maxDepth)) {
				folders.push(currentFolder.parent);
			}

			return folders;
		};

		const allFolders = getFoldersWithinDepth(parentFolder, this.settings.maxDirectoryDeleteTraversal).filter(f =>
			f !== parentFolder && !isDescendant(f, parentFolder)
		);

		const modal = new FolderSuggester(this.app, allFolders);
		modal.onSelect = async (destination: TFolder) => {
			// Get the files in the folder before moving, so we can identify the next file
			const folderFiles = parentFolder.children.filter((child): child is TFile => child instanceof TFile);
			const sortedFiles = this.fileHelper.sortFiles(folderFiles);
			let nextFile: TFile | null = null;
			if (sortedFiles.length > 0) {
				const boundaryFile = sortedFiles[sortedFiles.length - 1];
				nextFile = this.fileHelper.getAdjacentFile(boundaryFile, "next", this.settings.navigationScope);
			}

			const newPath = destination.path + '/' + parentFolder.name;
			try {
				await this.app.fileManager.renameFile(parentFolder, newPath);
				new Notice(`Successfully moved ${parentFolder.name} to ${destination.name}`, 2800);

				// Check if the old parent folder is now empty and clean it up if needed
				if (parentFolder.parent instanceof TFolder) {
					await this.checkAndCleanupEmptyParentFolder(parentFolder.parent);
				}

				// Reveal and select the moved folder
				const fileExplorerLeaf = this.app.workspace.getLeavesOfType("file-explorer")[0];
				if (fileExplorerLeaf && fileExplorerLeaf.view) {
					(fileExplorerLeaf.view as unknown as { revealInFolder: (f: TFolder) => void }).revealInFolder(parentFolder);
					if (typeof (fileExplorerLeaf.view as unknown as { selectFile?: (f: TFolder) => void }).selectFile === "function") {
						(fileExplorerLeaf.view as unknown as { selectFile: (f: TFolder) => void }).selectFile(parentFolder);
					}
				}

				// Now open the previously calculated next file
				if (nextFile) {
					await this.app.workspace.getLeaf().openFile(nextFile);
					this.statisticsStorage.increment(StatsKey.FilesNavigated);
					await this.saveSettings();
				}
			} catch (e) {
				const msg = e instanceof Error ? e.toString() : String(e);
				new Notice(`Error: ${msg}`);
			}
		};
		modal.open();
	}
}

class FolderSuggester extends SuggestModal<TFolder> {
	folders: TFolder[];

	constructor(app: App, folders: TFolder[]) {
		super(app);
		this.folders = folders;
	}

	getSuggestions(query: string): TFolder[] {
		return this.folders.filter(f => f.path.toLowerCase().includes(query.toLowerCase()));
	}

	renderSuggestion(folder: TFolder, el: HTMLElement) {
		el.setText(folder.path);
	}

	onChooseSuggestion(folder: TFolder, evt: MouseEvent | KeyboardEvent) {
		void this.onSelect(folder);
	}

	onSelect: (folder: TFolder) => Promise<void> = async () => { };
}

