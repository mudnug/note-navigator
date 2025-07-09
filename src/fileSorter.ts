import { App, TFile } from 'obsidian';

import { SortOrder, ObsidianSortOrder } from './fileHelper';

export class FileSorter {
	constructor(private app: App) { }


	customSort(files: TFile[], sortField: 'name' | 'modified' | 'created', sortOrder: 'ascending' | 'descending'): TFile[] {
		const direction = sortOrder === 'ascending' ? 1 : -1;

		switch (sortField) {
			case 'name':
				return this.naturalSort(files, sortOrder === 'ascending' ? SortOrder.AZ : SortOrder.ZA);
			case 'created':
				return files.sort((a, b) => direction * (a.stat.ctime - b.stat.ctime));
			case 'modified':
				return files.sort((a, b) => direction * (a.stat.mtime - b.stat.mtime));
			default:
				return files;
		}
	}

	getFileExplorerSortConfig(): { field: 'name' | 'modified' | 'created'; order: 'ascending' | 'descending'; } {
		const fileExplorerLeaf = this.app.workspace.getLeavesOfType("file-explorer")[0];
		let sortOrder: ObsidianSortOrder = "alphabetical"; // Default sort order incase a future Obsidian update breaks this code.

		if (fileExplorerLeaf) {
			const state = fileExplorerLeaf.view.getState();
			const rawSortOrder = typeof state.sortOrder === 'string' ? state.sortOrder : "alphabetical";

			if (this.isValidSortOrder(rawSortOrder)) {
				sortOrder = rawSortOrder;
			}
		} else {
			console.warn("File explorer leaf not found. Using default sort order.");
		}

		// Map Obsidian sort order to our sort configuration
		const sortMapping: Record<ObsidianSortOrder, { field: 'name' | 'modified' | 'created'; order: 'ascending' | 'descending'; }> = {
			"alphabetical": { field: 'name', order: 'ascending' },
			"alphabeticalReverse": { field: 'name', order: 'descending' },
			"byCreatedTime": { field: 'created', order: 'descending' },
			"byCreatedTimeReverse": { field: 'created', order: 'ascending' },
			"byModifiedTime": { field: 'modified', order: 'descending' },
			"byModifiedTimeReverse": { field: 'modified', order: 'ascending' },
		};

		return sortMapping[sortOrder];
	}

	private naturalSort(files: TFile[], sortOrder: SortOrder = SortOrder.AZ): TFile[] {
		const direction = sortOrder === SortOrder.AZ ? 1 : -1;
		const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

		return files.sort((a, b) => {
			const generateSortKey = (name: string) => {
				// Determine the type of the first character: symbol, number, or alphabet
				const firstChar = name.trim().charAt(0);
				let typePriority = 2; // Default to alphabet
				if (/^[^a-zA-Z0-9]/.test(firstChar)) typePriority = 0; // Symbols
				else if (/^\d/.test(firstChar)) typePriority = 1; // Numbers


				// Extract numeric parts and other components for sorting
				const match = name.match(/^(\d+)?(.*?)(\.[^.]+)?$/);
				if (!match) return { baseName: name.toLowerCase(), extension: "", numericPart: 0, typePriority };

				const [, numericPart, baseName, extension] = match;
				const cleanBaseName = baseName.trim().toLowerCase();
				const numericValue = numericPart ? parseInt(numericPart, 10) : 0;
				const cleanExtension = extension || "";

				return { baseName: cleanBaseName, extension: cleanExtension, numericPart: numericValue, typePriority };
			};

			const keyA = generateSortKey(a.name);
			const keyB = generateSortKey(b.name);

			// Compare by type priority (symbols < numbers < alphabet)
			if (keyA.typePriority !== keyB.typePriority) {
				return direction * (keyA.typePriority - keyB.typePriority);
			}

			// Compare by numeric part if both are numbers
			if (keyA.numericPart !== keyB.numericPart) {
				return direction * (keyA.numericPart - keyB.numericPart);
			}

			// Compare by base name
			const comparison = collator.compare(keyA.baseName, keyB.baseName);
			if (comparison !== 0) return direction * comparison;

			// Compare by extension as a fallback
			const extensionComparison = collator.compare(keyA.extension, keyB.extension);
			if (extensionComparison !== 0) return direction * extensionComparison;

			// Compare by original name length as a final fallback
			return direction * (a.name.length - b.name.length);
		});
	}

	private isValidSortOrder(sortOrder: string): sortOrder is ObsidianSortOrder {
		const validSortOrders: ObsidianSortOrder[] = [
			'alphabetical',
			'alphabeticalReverse',
			'byCreatedTime',
			'byCreatedTimeReverse',
			'byModifiedTime',
			'byModifiedTimeReverse'
		];
		return validSortOrders.includes(sortOrder as ObsidianSortOrder);
	}
}
