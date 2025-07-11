import { TFile, TFolder, App, Notice } from 'obsidian';

import { FileHelper } from './fileHelper';
import { LinkHelper } from './linkHelper';
import { NoteNavigatorSettings } from './settings';
import { ConfirmationDialog, ConfirmationSection } from './ui';

export class DeletionHelper {
	private fileHelper: FileHelper;
	private linkHelper: LinkHelper;

	constructor(private app: App, private settings: NoteNavigatorSettings) {
		this.fileHelper = new FileHelper(app);
		this.linkHelper = new LinkHelper(app);
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
		if (this.settings.removeOrphanAttachments) {
			for (const attachment of attachments) {
				await this.safeDelete(attachment, `Attachment deleted`, 0);
			}
		}

		if (this.settings.removeEmptyFolders) {
			for (const folder of folders) {
				await this.safeDelete(folder, `Empty folder deleted`, 0);
			}
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

	async safeDelete(fileOrFolder: TFile | TFolder, successMessage: string, delayMs: number) {
		try {
			if (delayMs > 0) {
				await new Promise(resolve => setTimeout(resolve, delayMs)); // Awaitable delay
			}
			await this.deletePerSetting(fileOrFolder);
		} catch (error) {
			console.error(`Error deleting ${fileOrFolder instanceof TFolder ? "folder" : "file"}:`, error);
			new Notice(`An error occurred while deleting ${fileOrFolder instanceof TFolder ? "folder" : "file"}. Check the console for details.`);
		}
	}

	private async deletePerSetting(fileOrFolder: TFile | TFolder) {
		if (fileOrFolder instanceof TFile) {
			// Use the new fileManager.trashFile for files
			await this.app.fileManager.trashFile(fileOrFolder);
		} else if (fileOrFolder instanceof TFolder) {
			// Keep the original logic for folders
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const deletionMethod = (this.app.vault as any).getConfig("trashOption") as "local" | "system" | "none";

			switch (deletionMethod) {
				case 'local': // obsidian trash folder
					await this.app.vault.trash(fileOrFolder, false);
					break;
				case 'system':
					await this.app.vault.trash(fileOrFolder, true);
					break;
				case 'none':
					await this.app.vault.delete(fileOrFolder);
					break;
			}
		}

		if (this.settings.showDeleteNotice) {
			new Notice(`Deleted: ${fileOrFolder.name}`);
		}
	}

	private async checkOrphanedFolder(folder: TFolder | null, filesToDelete: TFile[], orphanedFolders: Set<TFolder>) {
		if (folder && await this.fileHelper.isFolderEmptyAfterDeletion(folder, filesToDelete, orphanedFolders)) {
			orphanedFolders.add(folder);
		}
	}
}
