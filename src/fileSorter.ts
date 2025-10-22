import { App, TFile } from "obsidian";

import { ObsidianSortOrder } from "./fileHelper";
import { NoteNavigatorSettings } from "./settings";

export class FileSorter {
    private collator: Intl.Collator;

    constructor(private app: App, private settings: NoteNavigatorSettings) {
        this.collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base", usage: "sort" });
    }

    public customSort(files: TFile[], sortField: 'name' | 'modified' | 'created', sortOrder: 'ascending' | 'descending'): TFile[] {
        const direction = sortOrder === 'ascending' ? 1 : -1;

        const sortFunctions: Record<typeof sortField, (a: TFile, b: TFile) => number> = {
            created: (a, b) => a.stat.ctime - b.stat.ctime,
            modified: (a, b) => a.stat.mtime - b.stat.mtime,
            name: (a, b) => this.collator.compare(a.basename, b.basename),
            
        };

        const sortFunction = sortFunctions[sortField];
        return sortFunction ? files.sort((a, b) => direction * sortFunction(a, b)) : files;
    }

    public getFileExplorerSortConfig(): { field: 'name' | 'modified' | 'created'; order: 'ascending' | 'descending'; } {
        const fileExplorerLeaf = this.app.workspace.getLeavesOfType("file-explorer")[0];
        const rawSortOrder = fileExplorerLeaf?.view
            ? (typeof fileExplorerLeaf.view.getState().sortOrder === 'string' ? fileExplorerLeaf.view.getState().sortOrder : "alphabetical")
            : "alphabetical";
        const sortOrder: ObsidianSortOrder = rawSortOrder as ObsidianSortOrder;

        const validSortOrders: ObsidianSortOrder[] = [
            'alphabetical', 'alphabeticalReverse', 'byCreatedTime',
            'byCreatedTimeReverse', 'byModifiedTime', 'byModifiedTimeReverse'
        ];

        const finalSortOrder = validSortOrders.includes(sortOrder as ObsidianSortOrder) ? sortOrder : "alphabetical";

        if (finalSortOrder !== sortOrder && this.settings.enableDebugLogging) {
            console.warn("Invalid sort order found. Using default alphabetical sort.");
        }

        const sortMapping: Record<ObsidianSortOrder, { field: 'name' | 'modified' | 'created'; order: 'ascending' | 'descending'; }> = {
            alphabetical: { field: 'name', order: 'ascending' },
            alphabeticalReverse: { field: 'name', order: 'descending' },
            byCreatedTime: { field: 'created', order: 'descending' },
            byCreatedTimeReverse: { field: 'created', order: 'ascending' },
            byModifiedTime: { field: 'modified', order: 'descending' },
            byModifiedTimeReverse: { field: 'modified', order: 'ascending' },
        };

        return sortMapping[finalSortOrder];
    }
}
