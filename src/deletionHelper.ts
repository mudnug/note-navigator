import { TAbstractFile, TFile, TFolder, App, Notice } from 'obsidian';

import { FileHelper } from './fileHelper';
import { LinkHelper } from './linkHelper';
import { NoteNavigatorSettings } from './settings';
import { ConfirmationDialog, ConfirmationSection } from './ui';

interface DeletedFileSnapshot {
	path: string;
	data: ArrayBuffer;
	ctime: number;
	mtime: number;
}

interface DeletedItemSnapshot {
	path: string;
	folders: string[];
	files: DeletedFileSnapshot[];
}

export class DeletionHelper {
	private fileHelper: FileHelper;
	private linkHelper: LinkHelper;

	constructor(private app: App, private settings: NoteNavigatorSettings) {
		this.fileHelper = new FileHelper(app, settings);
		this.linkHelper = new LinkHelper(app, settings);
	}

	isProtectedOrContainsProtected(folder: TFolder | null): boolean {
		return this.isProtectedFolder(folder) || this.containsProtectedDescendant(folder);
	}

	async prepareForDeletion(activeFile: TFile): Promise<[TFile[], Set<TFolder>]> {
		const attachmentFiles = await this.linkHelper.findSingularReferenceAttachments(activeFile);
		const orphanedFolders = new Set<TFolder>();

		if (this.settings.removeOrphanAttachments) {
			for (const attachment of attachmentFiles) {
				await this.checkOrphanedFolder(attachment.parent, attachmentFiles, orphanedFolders);
			}
		}

		await this.checkOrphanedFolder(activeFile.parent, [activeFile, ...attachmentFiles], orphanedFolders);
		return [attachmentFiles, orphanedFolders];
	}

	async handleAttachmentsAndFolders(attachments: TFile[], folders: Set<TFolder>) {
		const items: (TFile | TFolder)[] = [];
		if (this.settings.removeOrphanAttachments) {
			items.push(...attachments);
		}
		if (this.settings.removeEmptyFolders) {
			for (const folder of folders) {
				if (!this.isProtectedOrContainsProtected(folder)) items.push(folder);
			}
		}
		await this.deleteBatch(items);
	}

	async confirmDeletion(activeFile: TFile, attachments: TFile[], folders: Set<TFolder>): Promise<boolean> {
		const header = `Are you sure you want to delete "${activeFile.name}"?`;

		const sections = [];
		if (this.settings.removeOrphanAttachments && attachments.length > 0) {
			sections.push(new ConfirmationSection('The following attachments will also be deleted:', attachments.map(file => file.path)));
		}

		if (this.settings.removeEmptyFolders && folders.size > 0) {
			const deletableFolders = Array.from(folders).filter(folder => !this.isProtectedOrContainsProtected(folder));
			if (deletableFolders.length > 0) {
				sections.push(new ConfirmationSection('The following folders would become empty and will also be deleted:', deletableFolders.map(folder => folder.path)));
			}
		}

		return new ConfirmationDialog(this.app, header, sections).show();
	}

	async confirmDeletionForEmptyFolder(folder: TFolder): Promise<boolean> {
		const header = `The folder "${folder.name}" is now empty after moving its contents. Delete it?`;

		const sections = [
			new ConfirmationSection('This folder will be deleted:', [folder.path])
		];

		return new ConfirmationDialog(this.app, header, sections).show();
	}

	async safeDelete(fileOrFolder: TFile | TFolder, successMessage: string | null, delayMs: number): Promise<boolean> {
		try {
			if (fileOrFolder instanceof TFolder && this.isProtectedOrContainsProtected(fileOrFolder)) {
				return false;
			}
			if (delayMs > 0) {
				await new Promise(resolve => window.setTimeout(resolve, delayMs));
			}
			return (await this.deleteBatch([fileOrFolder], 0, successMessage !== null, successMessage ?? undefined)).length > 0;
		} catch (error) {
			console.error(`Error deleting ${fileOrFolder instanceof TFolder ? "folder" : "file"}:`, error);
			new Notice(`An error occurred while deleting ${fileOrFolder instanceof TFolder ? "folder" : "file"}.`);
			return false;
		}
	}

	async deleteWithNotice(fileOrFolder: TFile | TFolder, customMessage?: string) {
		await this.deleteBatch([fileOrFolder], 0, true, customMessage);
	}

	async deleteWithoutNotice(fileOrFolder: TFile | TFolder) {
		await this.deleteBatch([fileOrFolder], 0, false);
	}

	async deleteBatch(items: (TFile | TFolder)[], delayMs = 0, showNotice = true, customMessage?: string): Promise<(TFile | TFolder)[]> {
		const deletedItems: (TFile | TFolder)[] = [];
		const snapshots: DeletedItemSnapshot[] = [];

		for (const item of items) {
			if (item instanceof TFolder && this.isProtectedOrContainsProtected(item)) {
				continue;
			}
			if (delayMs > 0 && deletedItems.length === 0) {
				await new Promise(resolve => window.setTimeout(resolve, delayMs));
			}
			try {
				const snapshot = await this.captureSnapshot(item);
				await this.app.fileManager.trashFile(item);
				deletedItems.push(item);
				snapshots.push(snapshot);
			} catch (error) {
				console.error(`Error deleting ${item instanceof TFolder ? "folder" : "file"}:`, error);
				new Notice(`An error occurred while deleting ${item instanceof TFolder ? "folder" : "file"}.`);
			}
		}

		if (showNotice && this.settings.showDeleteNotice && snapshots.length > 0) {
			this.showUndoNotice(snapshots, deletedItems, customMessage);
		}
		return deletedItems;
	}

	private async captureSnapshot(item: TFile | TFolder): Promise<DeletedItemSnapshot> {
		const folders: string[] = [];
		const files: DeletedFileSnapshot[] = [];
		const collect = async (entry: TAbstractFile): Promise<void> => {
			if (entry instanceof TFolder) {
				folders.push(entry.path);
				for (const child of entry.children) {
					await collect(child);
				}
				return;
			}
			if (!(entry instanceof TFile)) return;
			files.push({
				ctime: entry.stat.ctime,
				data: await this.app.vault.readBinary(entry),
				mtime: entry.stat.mtime,
				path: entry.path
			});
		};
		await collect(item);
		return { files, folders, path: item.path };
	}

	private showUndoNotice(snapshots: DeletedItemSnapshot[], items: (TFile | TFolder)[], customMessage?: string): void {
		const filesCount = items.filter(item => item instanceof TFile).length;
		const foldersCount = items.length - filesCount;
		let message = customMessage ?? `Deleted ${items.length} item${items.length === 1 ? '' : 's'}`;
		if (!customMessage && filesCount > 0 && foldersCount > 0) {
			message += ` (${filesCount} file${filesCount === 1 ? '' : 's'}, ${foldersCount} folder${foldersCount === 1 ? '' : 's'})`;
		} else if (!customMessage && filesCount > 0 && items.length > 1) {
			message += ` (${filesCount} files)`;
		} else if (!customMessage && foldersCount > 0 && items.length > 1) {
			message += ` (${foldersCount} folders)`;
		}
		const deletedPaths = new Set<string>();
		for (const snapshot of snapshots) {
			for (const path of snapshot.folders) deletedPaths.add(path);
			for (const file of snapshot.files) deletedPaths.add(file.path);
		}
		const fragment = new DocumentFragment();
		const noticeContent = fragment.createDiv({ cls: 'note-navigator-delete-notice' });
		const noticeActions = noticeContent.createDiv({ cls: 'note-navigator-delete-notice-actions' });
		const undoButton = noticeActions.createEl('button', { cls: 'note-navigator-undo-button', text: 'Undo' });
		const closeHint = noticeActions.createSpan({ cls: 'note-navigator-close-hint', text: 'Tap to close' });
		closeHint.hidden = true;
		noticeContent.createDiv({ text: message });
		const pathList = noticeContent.createEl('ul', { cls: 'note-navigator-delete-notice-list' });
		pathList.tabIndex = 0;
		for (const path of deletedPaths) {
			pathList.createEl('li', { text: path });
		}
		const notice = new Notice(fragment, 0);
		let interacted = false;
		const duration = Math.min(5000 + deletedPaths.size * 200, 10000);
		const dismissTimeout = window.setTimeout(() => notice.hide(), duration);
		const keepOpen = (event: Event) => {
			if (interacted || !event.isTrusted) return;
			interacted = true;
			window.clearTimeout(dismissTimeout);
			closeHint.hidden = false;
		};
		for (const eventName of ['wheel', 'pointerdown', 'touchstart', 'keydown']) {
			noticeContent.addEventListener(eventName, keepOpen);
		}
		undoButton.addEventListener('click', () => {
			undoButton.disabled = true;
			void this.restoreSnapshots(snapshots);
		});
	}

	private async restoreSnapshots(snapshots: DeletedItemSnapshot[]): Promise<void> {
		let restoredFiles = 0;
		let restoredFolders = 0;
		const failedPaths: string[] = [];
		const folders = new Set<string>();
		const files: DeletedFileSnapshot[] = [];
		for (const snapshot of snapshots) {
			for (const path of snapshot.folders) folders.add(path);
			for (const file of snapshot.files) files.push(file);
		}
		for (const path of Array.from(folders).sort((a, b) => a.split('/').length - b.split('/').length)) {
			if (this.app.vault.getAbstractFileByPath(path)) {
				continue;
			}
			try {
				await this.app.vault.createFolder(path);
				restoredFolders++;
			} catch {
				failedPaths.push(path);
			}
		}

		for (const file of files) {
			if (this.app.vault.getAbstractFileByPath(file.path)) {
				failedPaths.push(file.path);
				continue;
			}
			try {
				await this.app.vault.createBinary(file.path, file.data, { ctime: file.ctime, mtime: file.mtime });
				restoredFiles++;
			} catch {
				failedPaths.push(file.path);
			}
		}

		const restored = restoredFiles + restoredFolders;
		const result = failedPaths.length > 0
			? `Restored ${restored} item${restored === 1 ? '' : 's'}; could not restore ${failedPaths.length}.`
			: `Restored ${restored} item${restored === 1 ? '' : 's'}.`;
		new Notice(result);
		if (failedPaths.length > 0) {
			console.error('[Note Navigator] Could not restore deleted items:', failedPaths);
		}
	}

	private async checkOrphanedFolder(folder: TFolder | null, filesToDelete: TFile[], orphanedFolders: Set<TFolder>) {
		if (!folder) {
			return;
		}

		if (this.isProtectedFolder(folder) || this.containsProtectedDescendant(folder)) {
			return;
		}
		if (this.fileHelper.wouldFolderBeEmpty(folder, filesToDelete, orphanedFolders)) {
			orphanedFolders.add(folder);

			await this.checkOrphanedFolderWithDepth(folder.parent, filesToDelete, orphanedFolders, this.settings.maxDirectoryDeleteTraversal - 1);
		}
	}

	private async checkOrphanedFolderWithDepth(folder: TFolder | null, filesToDelete: TFile[], orphanedFolders: Set<TFolder>, remainingDepth: number) {
		if (!folder || remainingDepth <= 0) {
			return;
		}

		if (this.isProtectedFolder(folder) || this.containsProtectedDescendant(folder)) {
			return;
		}
		if (this.fileHelper.wouldFolderBeEmpty(folder, filesToDelete, orphanedFolders)) {
			orphanedFolders.add(folder);

			await this.checkOrphanedFolderWithDepth(folder.parent, filesToDelete, orphanedFolders, remainingDepth - 1);
		}
	}

	private isProtectedFolder(folder: TFolder | null): boolean {
		if (!folder) return false;
		return this.settings.protectedFolders.some(entry => {
			if (entry.path === folder.path) return true;
			if (entry.recursive) {
				if (entry.path === '') return folder.path !== '';
				return folder.path.startsWith(entry.path + '/');
			}
			return false;
		});
	}

	private containsProtectedDescendant(folder: TFolder | null): boolean {
		if (!folder) return false;
		return this.settings.protectedFolders.some(entry => {
			const protectedPath = entry.path;
			if (protectedPath === folder.path) return false;
			if (folder.path === '') return protectedPath !== '';
			return protectedPath.startsWith(folder.path + '/');
		});
	}
}
