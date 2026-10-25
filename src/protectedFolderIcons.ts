import { Modal, TFolder } from 'obsidian';

import type NoteNavigator from './main';

export class ProtectedFolderIcons {
	private plugin: NoteNavigator;
	private observer: MutationObserver | null = null;

	constructor(plugin: NoteNavigator) {
		this.plugin = plugin;
	}

	apply(): void {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}

		this.clear();

		if (!this.plugin.settings.showProtectedFolderIcons || this.plugin.settings.protectedFolders.length === 0) {
			return;
		}

		this.update();

		this.observer = new MutationObserver(() => {
			if (!this.plugin.settings.showProtectedFolderIcons) return;
			this.update();
		});

		this.observer.observe(activeDocument.body, { childList: true, subtree: true });
	}

	async handleRename(file: unknown, oldPath: string): Promise<void> {
		if (!(file instanceof TFolder)) return;
		const directlyProtected = this.plugin.settings.protectedFolders.some(entry => entry.path === oldPath);
		const hasProtectedDescendants = this.plugin.settings.protectedFolders.some(entry => entry.path.startsWith(oldPath + '/'));
		const keepDirectProtection = !directlyProtected || await this.confirmRenamedFolderProtection(oldPath, file.path);
		if (directlyProtected || hasProtectedDescendants) {
			this.plugin.settings.protectedFolders = this.plugin.settings.protectedFolders
				.filter(entry => keepDirectProtection || entry.path !== oldPath)
				.map(entry => {
					if (entry.path === oldPath) {
						return { path: file.path, recursive: entry.recursive };
					}
					if (entry.path.startsWith(oldPath + '/')) {
						return { path: file.path + entry.path.slice(oldPath.length), recursive: entry.recursive };
					}
					return entry;
			});
			await this.plugin.saveSettings();
		}
		this.apply();
	}

	async handleDelete(file: unknown): Promise<void> {
		if (!(file instanceof TFolder)) return;
		const remainingFolders = this.plugin.settings.protectedFolders.filter(entry =>
			entry.path !== file.path && !entry.path.startsWith(file.path + '/'),
		);
		if (remainingFolders.length === this.plugin.settings.protectedFolders.length) return;

		this.plugin.settings.protectedFolders = remainingFolders;
		await this.plugin.saveSettings();
		this.apply();
		this.plugin.refreshSettingsTab();
	}

	private confirmRenamedFolderProtection(oldPath: string, newPath: string): Promise<boolean> {
		return new Promise(resolve => {
			const modal = new Modal(this.plugin.app);
			let settled = false;
			const settle = (keepProtection: boolean) => {
				if (settled) return;
				settled = true;
				resolve(keepProtection);
				modal.close();
			};

			modal.titleEl.setText('Protected folder renamed');
			modal.contentEl.createEl('p', {
				text: `The protected folder "${oldPath || '/'}" was renamed to "${newPath || '/'}". Keep the renamed folder protected?`,
			});
			const buttonContainer = modal.contentEl.createDiv('note-navigator-button-container');
			buttonContainer.createEl('button', { text: 'Keep protected' }).onclick = () => settle(true);
			buttonContainer.createEl('button', { text: 'Remove protection' }).onclick = () => settle(false);
			modal.onClose = () => {
				if (!settled) {
					settled = true;
					resolve(true);
				}
			};
			modal.open();
		});
	}

	disconnect(): void {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
		this.clear();
	}

	private isPathProtected(path: string): boolean {
		return this.plugin.settings.protectedFolders.some(entry => {
			if (entry.path === path) return true;
			if (entry.recursive) {
				if (entry.path === '') return path !== '';
				return path.startsWith(entry.path + '/');
			}
			return false;
		});
	}

	private clear(): void {
		activeDocument.querySelectorAll('.note-navigator-protected-icon').forEach(el => el.remove());
	}

	private update(): void {
		try {
			activeDocument.querySelectorAll('.nav-folder-title-content .note-navigator-protected-icon').forEach(el => {
				const titleEl = el.closest('.nav-folder-title');
				const path = titleEl?.getAttribute('data-path');
				if (!path || !this.isPathProtected(path)) {
					el.remove();
				}
			});

			activeDocument.querySelectorAll('.nav-folder-title').forEach(titleEl => {
				const path = titleEl.getAttribute('data-path');
				if (!path || path === '/') return;
				if (!this.isPathProtected(path)) return;
				const contentEl = titleEl.querySelector('.nav-folder-title-content');
				if (!contentEl) return;
				if (contentEl.querySelector('.note-navigator-protected-icon')) return;
				const icon = createSpan({
					attr: { 'aria-hidden': 'true', 'aria-label': 'Protected folder' },
					cls: 'note-navigator-protected-icon',
				});
				contentEl.appendChild(icon);
			});
		} catch {
			// ignore failures for the default file explorer
		}

		// Notebook Navigator support (only if the plugin is installed/rendered)
		try {
			const nnEnabled = (this.plugin.app as { plugins?: { enabledPlugins?: { has?: (id: string) => boolean } } }).plugins?.enabledPlugins?.has?.('notebook-navigator');
			if (nnEnabled === false) return;

			activeDocument.querySelectorAll('.nn-navitem .note-navigator-protected-icon').forEach(el => {
				const navItem = el.closest('.nn-navitem');
				const path = navItem?.getAttribute('data-path') || navItem?.getAttribute('data-drag-path') || null;
				if (!path || !this.isPathProtected(path)) {
					el.remove();
				}
			});

			activeDocument.querySelectorAll('.nn-navitem.nn-folder, .nn-navitem[data-drag-type="folder"]').forEach(navItem => {
				const path = navItem.getAttribute('data-path') || navItem.getAttribute('data-drag-path');
				if (!path || path === '/') return;
				if (!this.isPathProtected(path)) return;
				const nameEl = navItem.querySelector('.nn-navitem-name');
				if (!nameEl || navItem.querySelector('.note-navigator-protected-icon')) return;
				const icon = createSpan({
					attr: { 'aria-hidden': 'true', 'aria-label': 'Protected folder' },
					cls: 'note-navigator-protected-icon',
				});
				nameEl.insertAdjacentElement('afterend', icon);
			});
		} catch {
			// ignore failures for non-compatible Notebook Navigator versions
		}
	}
}
