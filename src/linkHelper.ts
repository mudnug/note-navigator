import { TFile, App } from 'obsidian';

export class LinkHelper {
	constructor(private app: App) { }

	collectLinksFromFile(file: TFile): Set<string> {
		const { metadataCache } = this.app;
		const fileCache = metadataCache.getFileCache(file);

		if (!fileCache) {
			return new Set<string>();
		}

		const standardLinks = fileCache.links || [];
		const embeddedLinks = fileCache.embeds || [];

		const decodedLinks = new Set<string>([
			...standardLinks.map(link => this.decodePath(this.app.metadataCache.getFirstLinkpathDest(link.link, file.path)?.path || link.link)),
			...embeddedLinks.map(embed => this.decodePath(this.app.metadataCache.getFirstLinkpathDest(embed.link, file.path)?.path || embed.link)),
		]);

		return decodedLinks;
	}

	decodePath(encodedPath: string | undefined | null): string {
		if (!encodedPath) {
			return '';
		}
		try {
			// Validate if the path is a valid URI before decoding
			const decodedPath = decodeURIComponent(encodedPath);
			return decodedPath;
		} catch (error) {
			// Handle cases where the URI is malformed
			console.info(`Note: Failed to decode path: ${encodedPath}. Returning the original path.`, error);
			return encodedPath;
		}
	}

	countReferencesAcrossVault(): Map<string, number> {
		const { vault } = this.app;
		const allFiles = vault.getMarkdownFiles();
		const referenceCounts = new Map<string, number>();

		for (const file of allFiles) {
			const fileLinks = this.collectLinksFromFile(file);
			for (const link of fileLinks) {
				const decodedLink = this.decodePath(link);
				referenceCounts.set(decodedLink, (referenceCounts.get(decodedLink) || 0) + 1);
			}
		}

		return referenceCounts;
	}

	async findSingularReferenceAttachments(activeFile: TFile): Promise<TFile[]> {
		if (!activeFile || activeFile.extension !== 'md') {
			return [];
		}

		const activeFileLinks = this.collectLinksFromFile(activeFile);

		if (activeFileLinks.size === 0) {
			return [];
		}

		const referenceCounts = this.countReferencesAcrossVault();

		const singularReferenceLinks = Array.from(activeFileLinks).filter(
			link => referenceCounts.get(this.decodePath(link)) === 1
		);

		const attachmentFiles = singularReferenceLinks.map(link => this.app.vault.getAbstractFileByPath(this.decodePath(link)))
			.filter(file => file instanceof TFile && file.extension !== 'md') as TFile[];

		return attachmentFiles;
	}
}
