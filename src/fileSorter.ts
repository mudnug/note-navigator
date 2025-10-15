import { App, TFile } from 'obsidian';

import { SortOrder, ObsidianSortOrder } from './fileHelper';
import { NoteNavigatorSettings } from './settings';

interface SortKey {
   baseName: string;
   extension: string;
   numericPart: number;
   typePriority: number;
}

export class FileSorter {
	constructor(private app: App, private settings: NoteNavigatorSettings) { }


	customSort(files: TFile[], sortField: 'name' | 'modified' | 'created', sortOrder: 'ascending' | 'descending'): TFile[] {
		const direction = sortOrder === 'ascending' ? 1 : -1;

		switch (sortField) {
			case 'name':
				return this.customNaturalSort(files, sortOrder === 'ascending' ? SortOrder.AZ : SortOrder.ZA);
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

		if (fileExplorerLeaf && fileExplorerLeaf.view) {
			const state = fileExplorerLeaf.view.getState();
			const rawSortOrder = typeof state.sortOrder === 'string' ? state.sortOrder : "alphabetical";

			if (this.isValidSortOrder(rawSortOrder)) {
				sortOrder = rawSortOrder;
			}
		} else {
			if (this.settings.enableDebugLogging) {
				console.warn("File explorer leaf or view not found. Using default sort order.");
			}
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

	/**
 * Sorts an array of files using a custom natural sorting algorithm.
 * The sorting is multi-layered, prioritizing file names starting with
 * symbols, then numbers, then letters.
 *
 * @param {Array<TFile>} files - The array of file objects to sort. Each object must have a 'name' property.
 * @param {string} sortOrder - The sort order, e.g., 'SortOrder.AZ' for ascending.
 * @returns {Array<Object>} The sorted array of files.
 */

private customNaturalSort(files: TFile[], sortOrder: SortOrder = SortOrder.AZ) {
    // Determine the sort direction multiplier. 1 for ascending (A-Z), -1 for descending (Z-A).
	const direction = sortOrder === SortOrder.AZ ? 1 : -1;

    // Create a collator for "natural" sorting of strings that contain numbers (e.g., "item 2" vs "item 10").
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

    /**
     * Generates a structured sort key from a filename. This key is used to
     * compare and sort files based on a set of prioritized rules.
     * @param {string} name - The file name to process.
     * @returns {Object} An object containing parts of the filename for sorting.
     */
    const generateSortKey = (name: string): SortKey => {
        // --- 1. Determine Type Priority ---
        const firstChar = name.trim().charAt(0);
        let typePriority = 2; // Default priority for letters

        if (/^[^a-zA-Z0-9]/.test(firstChar)) {
            typePriority = 0; // Highest priority for symbols
        } else if (/^\d/.test(firstChar)) {
            typePriority = 1; // Second priority for numbers
        }

        // --- 2. Parse the Filename with Regex ---
        // This regex breaks the name into three parts:
        // 1. An optional number at the start (^(\d+)?)
        // 2. The base name (.*?)
        // 3. The file extension (\.[^.]+)
        const match = name.match(/^(\d+)?(.*?)(\.[^.]+)?$/);

        // Fallback for names that don't match the regex pattern.
        if (!match) {
            return {
                baseName: name.toLowerCase(),
                extension: "",
                numericPart: 0,
                typePriority: typePriority
            };
        }

        const [, numericPartStr, baseNameStr, extensionStr] = match;

        // --- 3. Clean and Structure the Parts ---
        const cleanBaseName = baseNameStr.trim().toLowerCase();
        const numericValue = numericPartStr ? parseInt(numericPartStr, 10) : 0;
        const cleanExtension = extensionStr || "";

        return {
            baseName: cleanBaseName,
            extension: cleanExtension,
            numericPart: numericValue,
            typePriority: typePriority
        };
    };

    // Sort the files array in place.
    return files.sort((a, b) => {
        const keyA = generateSortKey(a.name);
        const keyB = generateSortKey(b.name);

        // --- Multi-level Comparison Logic ---

        // 1. Compare by type priority (symbols < numbers < letters)
        if (keyA.typePriority !== keyB.typePriority) {
            return direction * (keyA.typePriority - keyB.typePriority);
        }

        // 2. If types are the same, compare by the numeric part
        if (keyA.numericPart !== keyB.numericPart) {
            return direction * (keyA.numericPart - keyB.numericPart);
        }

        // 3. If numeric parts are the same, compare by base name
        const baseNameComparison = collator.compare(keyA.baseName, keyB.baseName);
        if (baseNameComparison !== 0) {
            return direction * baseNameComparison;
        }

        // 4. If base names are the same, compare by extension
        const extensionComparison = collator.compare(keyA.extension, keyB.extension);
        if (extensionComparison !== 0) {
            return direction * extensionComparison;
        }

        // 5. As a final tie-breaker, compare by original name length
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
