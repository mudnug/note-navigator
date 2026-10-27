import { TFile, TFolder, App, Notice } from 'obsidian';

import { FileSorter } from './fileSorter';
import { NoteNavigatorSettings } from './settings';

export enum SortOrder {
	AZ,
	ZA,
	CreationDateOldest,
	CreationDateNewest,
	ModificationDateOldest,
	ModificationDateNewest
}

export type ObsidianSortOrder = 'alphabetical' | 'alphabeticalReverse' | 'byCreatedTime' | 'byCreatedTimeReverse' | 'byModifiedTime' | 'byModifiedTimeReverse';

export class FileHelper {
	private fileSorter: FileSorter;

	constructor(private app: App, private settings: NoteNavigatorSettings) {
		this.fileSorter = new FileSorter(app, settings);
	}

	isFolderEmptyAfterDeletion(folder: TFolder, filesToDelete: TFile[], foldersToDelete: Set<TFolder>, maxDepth?: number): boolean {
		if (!this.wouldFolderBeEmpty(folder, filesToDelete, foldersToDelete)) {
			return false;
		}

		if (maxDepth === undefined || maxDepth <= 0) {
			return true;
		}

		let currentFolder: TFolder | null = folder.parent;
		let currentDepth = 0;

		while (currentFolder && currentDepth < maxDepth) {
			// Temporarily add the child folder to check if parent would be empty
			foldersToDelete.add(folder);

			if (!this.wouldFolderBeEmpty(currentFolder, filesToDelete, foldersToDelete)) {
				// Parent would not be empty, so remove the folder we temporarily added
				foldersToDelete.delete(folder);
				return false;
			}

			currentFolder = currentFolder.parent;
			currentDepth++;
		}

		return true;
	}

	isFolderCurrentlyEmpty(folder: TFolder): boolean {
		const children = folder.children;

		const hasFiles = children.some(child => child instanceof TFile);
		if (hasFiles) {
			return false;
		}

		const hasFolders = children.some(child => child instanceof TFolder);
		if (hasFolders) {
			return false;
		}

		return true;
	}

	wouldFolderBeEmpty(folder: TFolder, filesToDelete: TFile[], foldersToDelete: Set<TFolder>): boolean {
		const children = folder.children;
		const folderFiles = children.filter(child => child instanceof TFile);

		const remainingFiles = folderFiles.filter(file => !filesToDelete.some(f => f.path === file.path));

		if (remainingFiles.length > 0) {
			return false;
		}

		const remainingFolders = children.filter(child =>
			child instanceof TFolder && !foldersToDelete.has(child)
		);

		if (remainingFolders.length > 0) {
			return false;
		}

		return true;
	}

	async navigateFile(direction: "next" | "prev", scope: 'entireVault' | 'activeFolder'): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('A file must be active to navigate.');
			return;
		}

		const nextFile = this.getAdjacentFile(activeFile, direction, scope);

		if (nextFile) {
			await this.app.workspace.getLeaf().openFile(nextFile);
		}
	}

	sortFiles(files: TFile[]): TFile[] {
		const { field, order } = this.fileSorter.getFileExplorerSortConfig();
		return this.fileSorter.customSort(files, field, order);
	}

	getAdjacentFile(currentFile: TFile, direction: "next" | "prev", scope: 'entireVault' | 'activeFolder'): TFile | null {
		const root = this.app.vault.getRoot();
		const folderFiles = (folder: TFolder): TFile[] => this.sortFiles(
			folder.children.filter((child): child is TFile => child instanceof TFile && child.extension === "md")
		);

		if (scope === 'activeFolder') {
			const parent = currentFile.parent;
			if (!parent) return null;
			const files = folderFiles(parent);
			const currentIndex = files.findIndex(file => file.path === currentFile.path);
			if (currentIndex === -1 || files.length === 0) return null;
			const offset = direction === "next" ? 1 : -1;
			return files[(currentIndex + offset + files.length) % files.length];
		}

		const files: TFile[] = [];
		const visitFolder = (folder: TFolder) => {
			files.push(...folderFiles(folder));
			const childFolders = folder.children
				.filter((child): child is TFolder => child instanceof TFolder)
				.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
			for (const childFolder of childFolders) visitFolder(childFolder);
		};
		visitFolder(root);

		const currentIndex = files.findIndex(file => file.path === currentFile.path);
		if (currentIndex === -1 || files.length === 0) return null;
		const offset = direction === "next" ? 1 : -1;
		return files[(currentIndex + offset + files.length) % files.length];
	}

}
