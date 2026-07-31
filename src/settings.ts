import { App, Setting, type SettingDefinitionItem } from 'obsidian';
import { PluginSettingTab, SettingPage } from 'obsidian';

import NoteNavigator from './main';
import { StatsKey, type StatisticsStorageMode } from './statisticsStorage';

export interface NoteNavigatorSettings {
	navigateOnDelete: boolean;
	navigationScope: 'entireVault' | 'activeFolder';
	numberOfDeletedAttachments: number;
	numberOfDeletedFiles: number;
	numberOfDeletedFolders: number;
	numberOfFilesNavigated: number;
	numberOfSettingViews: number;
	removeEmptyFolders: boolean;
	removeOrphanAttachments: boolean;
	showConfirmationPrompt: boolean;
	showDeleteNotice: boolean;
	enableDebugLogging: boolean;
	fadeAttachmentFolders: boolean;
	maxDirectoryDeleteTraversal: number;
	statisticsStorageMode: StatisticsStorageMode;
}

export const DEFAULT_SETTINGS: NoteNavigatorSettings = {
	enableDebugLogging: false,
	fadeAttachmentFolders: false,
	maxDirectoryDeleteTraversal: 3,
	navigateOnDelete: true,
	navigationScope: 'entireVault',
	numberOfDeletedAttachments: 0,
	numberOfDeletedFiles: 0,
	numberOfDeletedFolders: 0,
	numberOfFilesNavigated: 0,
	numberOfSettingViews: 0,
	removeEmptyFolders: true,
	removeOrphanAttachments: true,
	showConfirmationPrompt: true,
	showDeleteNotice: true,
	statisticsStorageMode: 'pluginStorage',
}

const SettingPageBase = SettingPage;

export class NoteNavigatorSettingTab extends PluginSettingTab {
	plugin: NoteNavigator;

	constructor(app: App, plugin: NoteNavigator) {
		super(app, plugin);
		this.plugin = plugin;
	}

	formatToSentenceCase(input: string): string {
		return input
			.replace(/numberOf/, '')
			.replace(/([A-Z])/g, ' $1')
			.toLowerCase()
			.replace(/^\s*\w/, (str: string) => str.toUpperCase())
			.trim();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				heading: 'Navigation',
				items: [
					{
						control: {
							key: 'navigationScope',
							options: {
								activeFolder: 'Active folder',
								entireVault: 'Entire vault',
							},
							type: 'dropdown',
						},
						desc: 'Navigate from one folder to another or stay within the active folder.',
						name: 'Scope',
					},
				],
				type: 'group',
			},
			{
				heading: 'File explorer',
				items: [
					{
						control: {
							key: 'fadeAttachmentFolders',
							type: 'toggle',
						},
						desc: 'Make the attachment folder less noticeable in the file explorer.',
						name: 'Fade attachment folders',
					},
				],
				type: 'group',
			},
			{
				heading: 'Deletion',
				items: [
					{
						control: {
							key: 'removeOrphanAttachments',
							type: 'toggle',
						},
						desc: 'Automatically delete unreferenced attachments when their associated note is deleted.',
						name: 'Remove orphan attachments',
					},
					{
						control: {
							key: 'navigateOnDelete',
							type: 'toggle',
						},
						desc: 'Automatically navigate to the next file in sort order of the file-explorer after deletion. Disable to use Obsidian\'s default behavior.',
						name: 'Auto-navigate after deletion',
					},
					{
						control: {
							key: 'removeEmptyFolders',
							type: 'toggle',
						},
						desc: 'Automatically delete folders that become empty after deleting notes or attachments.',
						name: 'Remove empty folders',
					},
					{
						control: {
							defaultValue: 3,
							key: 'maxDirectoryDeleteTraversal',
							max: 10,
							min: 1,
							step: 1,
							type: 'number',
						},
						desc: 'Number of parent directories to traverse when looking for empty folders to delete (1-10).',
						name: 'Parent directory traversal depth',
						visible: () => this.plugin.settings.removeEmptyFolders,
					},
				],
				type: 'group',
			},
			{
				heading: 'Prompts',
				items: [
					{
						control: {
							key: 'showConfirmationPrompt',
							type: 'toggle',
						},
						desc: 'Show a confirmation dialog before deleting files or folders.',
						name: 'Show confirmation',
					},
					{
						control: {
							key: 'showDeleteNotice',
							type: 'toggle',
						},
						desc: 'Display a notification for each deleted file or folder.',
						name: 'Show notice',
					},
					{
						control: {
							key: 'enableDebugLogging',
							type: 'toggle',
						},
						desc: 'Enable verbose console logging for debugging purposes.',
						name: 'Enable debug logging',
					},
				],
				type: 'group',
			},
			{
				heading: 'Welcome',
				items: [
					{
						action: () => {
							const setting = (this.app as unknown as { setting: unknown }).setting;
							const tab = (setting as { openTabById?: (id: string) => { setQuery?: (q: string) => void } | undefined }).openTabById?.('hotkeys');
							if (typeof tab?.setQuery === 'function') {
								tab.setQuery(this.plugin.manifest.id);
							}
						},
						desc: 'Assign hotkeys to the plugin commands for easier use.',
						name: 'Configure hotkeys',
					},
				],
				type: 'group',
			},
			{
				desc: 'View and manage plugin statistics.',
				name: 'Statistics',
				page: () => new StatisticsPage(this),
				type: 'page',
			},
			{
				items: [
					{
						desc: createFragment((el: DocumentFragment) => {
							el.append("Share your feedback about this plugin on ");
							const feedbackLink = el.createEl('a', { href: 'https://github.com/mudnug/note-navigator', text: 'GitHub' });
							feedbackLink.setAttr('target', '_blank');
							feedbackLink.setAttr('rel', 'noopener noreferrer');
							feedbackLink.addClass('note-navigator-feedback-link');
							el.append(feedbackLink, ", or ");
							const supportLink = el.createEl('a', { href: 'https://buymeacoffee.com/softwarefriend', text: 'Support the developer' });
							supportLink.setAttr('target', '_blank');
							supportLink.setAttr('rel', 'noopener noreferrer');
							supportLink.addClass('custom-support-link');
							el.append(supportLink);
							el.append(".");
						}),
						name: 'Support',
						searchable: false,
					},
				],
				type: 'group',
			},
		];
	}

	getControlValue(key: string): unknown {
		if (key === 'statisticsStorageMode') {
			return this.plugin.statisticsStorage.getMode();
		}
		return super.getControlValue(key);
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'statisticsStorageMode') {
			await this.plugin.statisticsStorage.setMode(value as StatisticsStorageMode);
			this.plugin.settings.statisticsStorageMode = value as StatisticsStorageMode;
			return this.plugin.saveSettings();
		}
		const result = super.setControlValue(key, value);
		if (key === 'fadeAttachmentFolders') {
			this.plugin.applyAttachmentFade();
		}
		if (key === 'removeEmptyFolders') {
			this.refreshDomState();
		}
		return result;
	}

	update(): void {
		this.plugin.loadSettings().then(() => {
			return this.plugin.statisticsStorage.setMode(this.plugin.settings.statisticsStorageMode, false);
		}).then(() => {
			this.plugin.statisticsStorage.increment(StatsKey.SettingViews);
			return this.plugin.saveSettings();
		}).then(() => {
			super.update();
		}).catch((e) => {
			console.error('[Note Navigator] Error in settings update:', e);
			super.update();
		});
	}
}

export class StatisticsPage extends SettingPageBase {
	private tab: NoteNavigatorSettingTab;

	constructor(tab: NoteNavigatorSettingTab) {
		super();
		this.tab = tab;
		this.title = 'Statistics';
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Storage mode')
			.setDesc('Choose where statistics are stored.')
			.addDropdown(dropdown => {
				dropdown
					.addOption('pluginStorage', 'Sync across devices (plugin storage)')
					.addOption('browserStorage', 'This device only (browser storage)')
					.setValue(this.tab.plugin.statisticsStorage.getMode())
					.onChange(async (value) => {
						await this.tab.plugin.statisticsStorage.setMode(value as StatisticsStorageMode);
						this.tab.plugin.settings.statisticsStorageMode = value as StatisticsStorageMode;
						await this.tab.plugin.saveSettings();
						this.display();
					});
			});

		new Setting(containerEl)
			.setName('Reset statistics')
			.setDesc('Reset all counters for deleted files, folders, and navigations.')
			.addButton(button => button
				.setButtonText('Reset')
				.onClick(async () => {
					this.tab.plugin.statisticsStorage.reset();
					this.display();
				}));

		const stats = this.tab.plugin.statisticsStorage.getAll();

		const statsList = containerEl.createEl('ul', { cls: 'note-navigator-stats-list' });
		Object.entries(stats).forEach(([key, value]) => {
			const listItem = statsList.createEl('li');
			listItem.textContent = `${this.tab.formatToSentenceCase(key)}: ${value}`;
		});
	}
}
