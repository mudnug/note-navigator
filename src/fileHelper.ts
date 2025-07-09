import { TFile, TFolder, App, Notice } from 'obsidian';

import { FileSorter } from './fileSorter';

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

	constructor(private app: App) {
		this.fileSorter = new FileSorter(app);
	}

	isFolderEmptyAfterDeletion(folder: TFolder, filesToDelete: TFile[], foldersToDelete: Set<TFolder>): boolean {
		const children = folder.children;
		const folderFiles = children.filter(child => child instanceof TFile) as TFile[];

		const remainingFiles = folderFiles.filter(file => !filesToDelete.some(f => f.path === file.path));
		const hasNoSubfolders = children.every(child => !(child instanceof TFolder) || foldersToDelete.has(child as TFolder));

		return remainingFiles.length === 0 && hasNoSubfolders;
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
		const originalFolder = currentFile.parent;
		if (!originalFolder) {
			console.warn("No parent folder found for the current file.");
			return null;
		}

		// Attempt to find an adjacent file in the current folder
		const adjacentFileInCurrentFolder = this.getAdjacentFileInFolder(originalFolder, currentFile, direction, false);
		if (adjacentFileInCurrentFolder) {
			return adjacentFileInCurrentFolder;
		}

		// If scope is limited to the active folder, stop searching
		if (scope === 'activeFolder') {
			return null;
		}

		let targetFolders = this.getTargetFolders(originalFolder, direction);
		let currentFolder: TFolder | null = originalFolder;

		while (targetFolders && targetFolders.length > 0) {
			// Sort target folders alphabetically
			const sortedFolders = targetFolders.sort((a, b) =>
				a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
			);

			const currentIndex = sortedFolders.findIndex(f => f.name === currentFolder?.name);
			let targetFolder: TFolder | null = null;

			// Determine the next or previous folder based on the direction
			if (direction === "next" && currentIndex < sortedFolders.length - 1) {
				targetFolder = sortedFolders[currentIndex + 1];
			} else if (direction === "prev") {
				if (currentIndex > 0) {
					targetFolder = sortedFolders[currentIndex - 1];
				} else if (currentIndex === 0) {
					targetFolder = sortedFolders[0].parent || null;
				} else {
					targetFolder = sortedFolders[sortedFolders.length - 1];
				}
			}

			// For "next", traverse into the deepest child folder
			if (direction === "next") {
				while (targetFolder) {
					const childFolders = targetFolder.children.filter((child): child is TFolder => child instanceof TFolder) as TFolder[];
					if (childFolders.length === 0) break;

					targetFolder = childFolders.sort((a, b) =>
						a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
					)[0]; // Select the first child folder
				}
			}

			// Handle edge cases for "next" and "prev" directions
			if (!targetFolder && direction === "next" && currentFolder) {
				targetFolder = currentFolder.parent;
			}

			if (direction === "prev" && currentFolder && targetFolder === currentFolder.parent) {
				const grandParent = currentFolder.parent?.parent;
				if (grandParent) {
					targetFolders = this.getTargetFolders(grandParent, direction);
					if (targetFolders) {
						currentFolder = currentFolder.parent;
						continue;
					}
				}
			}

			// Attempt to find an adjacent file in the target folder
			if (targetFolder) {
				const adjacentFileInTargetFolder = this.getAdjacentFileInFolder(targetFolder, currentFile, direction, true);
				if (adjacentFileInTargetFolder) {
					return adjacentFileInTargetFolder;
				}
			}

			currentFolder = targetFolder;
			targetFolders = targetFolder ? this.getTargetFolders(targetFolder, direction) : null;
		}

		return null;
	}

	private getAdjacentFileInFolder(folder: TFolder, currentFile: TFile, direction: "next" | "prev", isOpeningNewFolder: boolean): TFile | null {
		const folderFiles = this.sortFiles(
			folder.children.filter((child): child is TFile => child instanceof TFile && child.extension === "md") as TFile[]
		);

		if (isOpeningNewFolder) {
			if (folderFiles.length > 0) {
				const result =
					direction === "next"
						? folderFiles[0] // First file for "next"
						: folderFiles[folderFiles.length - 1]; // Last file for "prev"
				return result;
			}
		}

		const currentIndex = folderFiles.findIndex(f => f.path === currentFile.path);

		if (currentIndex !== -1) {
			if (direction === "next" && currentIndex < folderFiles.length - 1) {
				return folderFiles[currentIndex + 1];
			}
			if (direction === "prev" && currentIndex > 0) {
				return folderFiles[currentIndex - 1];
			}
		}

		return null;
	}

	private getTargetFolders(currentFolder: TFolder, direction: "next" | "prev"): TFolder[] | null {
		const getChildFolders = (folder: TFolder): TFolder[] =>
			folder.children.filter((child): child is TFolder => child instanceof TFolder) as TFolder[];

		if (direction === "prev") {
			const parent = currentFolder.parent;

			// If no parent folder exists, return subfolders of the root folder
			if (!parent) return getChildFolders(currentFolder);

			const childFolders = getChildFolders(currentFolder);

			// If no children exist, check parent siblings or move up another level
			if (childFolders.length === 0) {
				const siblings = getChildFolders(parent);

				if (siblings[0] === currentFolder) {
					if (parent.parent) {
						const parentSiblings = getChildFolders(parent.parent).sort((a, b) =>
							a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
						);
						const parentIndex = parentSiblings.findIndex(f => f.name === parent.name);

						if (parentIndex > 0) {
							// Return the folder above the current folder's parent in the sort order
							return [parentSiblings[parentIndex - 1]];
						}
					}
				}

				return siblings;
			}

			// Sort children alphabetically and check hierarchy
			const sortedChildren = childFolders.sort((a, b) =>
				a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
			);

			if (sortedChildren[0] === currentFolder) {
				return parent.parent ? this.getTargetFolders(parent.parent, direction) : null;
			}

			return childFolders;
		}

		// Handle "next" direction by returning siblings of the current folder
		return currentFolder.parent ? getChildFolders(currentFolder.parent) : null;
	}
}
