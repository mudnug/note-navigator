import { TFile, TFolder, App, Notice } from 'obsidian';

import { FileHelper } from './fileHelper';
import { LinkHelper } from './linkHelper';
import { NoteNavigatorSettings } from './settings';
import { ConfirmationDialog, ConfirmationSection } from './ui';

export class DeletionHelper {
	private fileHelper: FileHelper;
	private linkHelper: LinkHelper;

	constructor(private app: App, private settings: NoteNavigatorSettings) {
		this.fileHelper = new FileHelper(app, settings);
		this.linkHelper = new LinkHelper(app, settings);
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
		const deletedItems: string[] = [];

		if (this.settings.removeOrphanAttachments) {
			for (const attachment of attachments) {
				await this.deleteWithoutNotice(attachment);
				deletedItems.push(`File: ${attachment.name}`);
			}
		}

		if (this.settings.removeEmptyFolders) {
			for (const folder of folders) {
				await this.deleteWithoutNotice(folder);
				deletedItems.push(`Folder: ${folder.name}`);
			}
		}

		// Show grouped notification if items were deleted
		if (deletedItems.length > 0) {
			this.showGroupedDeletionNotice(deletedItems);
		}
	}

	async confirmDeletion(activeFile: TFile, attachments: TFile[], folders: Set<TFolder>): Promise<boolean> {
		const header = `Are you sure you want to delete "${activeFile.name}"?`;

		const sections = [];
		if (this.settings.removeOrphanAttachments && attachments.length > 0) {
			sections.push(new ConfirmationSection('The following attachments will also be deleted:', attachments.map(file => file.path)));
		}

		if (this.settings.removeEmptyFolders && folders.size > 0) {
			sections.push(new ConfirmationSection('The following folders would become empty and will also be deleted:', Array.from(folders).map(folder => folder.path)));
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

	async safeDelete(fileOrFolder: TFile | TFolder, successMessage: string | null, delayMs: number) {
		try {
			if (delayMs > 0) {
				await new Promise(resolve => setTimeout(resolve, delayMs)); // Awaitable delay
			}
			await this.performDelete(fileOrFolder, successMessage === null);
		} catch (error) {
			console.error(`Error deleting ${fileOrFolder instanceof TFolder ? "folder" : "file"}:`, error);
			new Notice(`An error occurred while deleting ${fileOrFolder instanceof TFolder ? "folder" : "file"}.`);
		}
	}

	async deleteWithNotice(fileOrFolder: TFile | TFolder, customMessage?: string) {
		await this.performDelete(fileOrFolder, false, customMessage);
	}

	async deleteWithoutNotice(fileOrFolder: TFile | TFolder) {
		await this.performDelete(fileOrFolder, true);
	}

	private async performDelete(fileOrFolder: TFile | TFolder, skipNotice: boolean, customMessage?: string) {
		await this.app.fileManager.trashFile(fileOrFolder);

		if (this.settings.showDeleteNotice && !skipNotice) {
			const message = customMessage || `Deleted ${fileOrFolder instanceof TFolder ? 'folder: ' : ': '}${fileOrFolder.name}`;
			new Notice(message);
		}
	}

	private showGroupedDeletionNotice(deletedItems: string[]) {
		if (!this.settings.showDeleteNotice) {
			return;
		}

		const totalItems = deletedItems.length;
		const filesCount = deletedItems.filter(item => item.startsWith('File:')).length;
		const foldersCount = deletedItems.filter(item => item.startsWith('Folder:')).length;

		let noticeMessage = `Deleted ${totalItems} item${totalItems > 1 ? 's' : ''}`;

		if (filesCount > 0 && foldersCount > 0) {
			noticeMessage += ` (${filesCount} file${filesCount > 1 ? 's' : ''}, ${foldersCount} folder${foldersCount > 1 ? 's' : ''})`;
		} else if (filesCount > 0) {
			noticeMessage += ` (${filesCount} file${filesCount > 1 ? 's' : ''})`;
		} else if (foldersCount > 0) {
			noticeMessage += ` (${foldersCount} folder${foldersCount > 1 ? 's' : ''})`;
		}

		const displayTimeMs = Math.min(3000 + (totalItems * 200), 10000); // Max 10 seconds

		// Combine summary and detailed information into one notice
		const combinedMessage = `${noticeMessage}\n${deletedItems.map(item => `• ${item}`).join('\n')}`;

		new Notice(combinedMessage, displayTimeMs);
	}

	private async checkOrphanedFolder(folder: TFolder | null, filesToDelete: TFile[], orphanedFolders: Set<TFolder>) {
		if (!folder) {
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

		if (this.fileHelper.wouldFolderBeEmpty(folder, filesToDelete, orphanedFolders)) {
			orphanedFolders.add(folder);

			await this.checkOrphanedFolderWithDepth(folder.parent, filesToDelete, orphanedFolders, remainingDepth - 1);
		}
	}
}
