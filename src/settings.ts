import { App } from 'obsidian';
import { PluginSettingTab, Setting } from 'obsidian';

import NoteNavigator from './main';

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
}

export const DEFAULT_SETTINGS: NoteNavigatorSettings = {
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
}

export class NoteNavigatorSettingTab extends PluginSettingTab {
	plugin: NoteNavigator;

	constructor(app: App, plugin: NoteNavigator) {
		super(app, plugin);
		this.plugin = plugin;
	}

	formatToSentenceCase(input: string): string {
		return input
			.replace(/numberOf/, '') // Remove the "numberOf" prefix
			.replace(/([A-Z])/g, ' $1') // Insert spaces before uppercase letters
			.toLowerCase() // Convert the entire string to lowercase
			.replace(/^\s*\w/, (str: string) => str.toUpperCase()) // Capitalize the first letter of the string
			.trim(); // Remove any leading/trailing spaces
	}

	display(): void {
		const { containerEl } = this;

		this.plugin.settings.numberOfSettingViews = (this.plugin.settings.numberOfSettingViews || 0) + 1;
		this.plugin.saveSettings();

		containerEl.empty();

		new Setting(containerEl)
			.setName('Navigation')
			.setHeading();

		new Setting(containerEl)
			.setName('Scope')
			.setDesc('Navigate through files in the entire vault or just within the active folder.')
			.addDropdown(dropdown => {
				dropdown
					.addOption('entireVault', 'Entire Vault')
					.addOption('activeFolder', 'Active Folder')
					.setValue(this.plugin.settings.navigationScope)
					.onChange(async (value) => {
						this.plugin.settings.navigationScope = value as 'entireVault' | 'activeFolder';
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Deletion')
			.setHeading();

		new Setting(containerEl)
			.setName('Remove orphan attachments')
			.setDesc('Automatically delete unreferenced attachments when their associated note is deleted.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.removeOrphanAttachments)
				.onChange(async (value) => {
					this.plugin.settings.removeOrphanAttachments = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Remove empty folders')
			.setDesc('Automatically delete folders that become empty after deleting notes or attachments.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.removeEmptyFolders)
				.onChange(async (value) => {
					this.plugin.settings.removeEmptyFolders = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-Navigate after deletion')
			.setDesc('Automatically navigate to the next file in sort order of the file-explorer after deletion. Disable to use Obsidian\'s default behavior.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.navigateOnDelete)
				.onChange(async (value) => {
					this.plugin.settings.navigateOnDelete = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Prompts')
			.setHeading();

		new Setting(containerEl)
			.setName('Show confirmation')
			.setDesc('Show a confirmation dialog before deleting files or folders.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showConfirmationPrompt)
				.onChange(async (value) => {
					this.plugin.settings.showConfirmationPrompt = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show notice')
			.setDesc('Display a notification for each deleted file or folder.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showDeleteNotice)
				.onChange(async (value) => {
					this.plugin.settings.showDeleteNotice = value;
					await this.plugin.saveSettings();
				}));

		const stats = {
			numberOfDeletedAttachments: this.plugin.settings.numberOfDeletedAttachments,
			numberOfDeletedFiles: this.plugin.settings.numberOfDeletedFiles,
			numberOfDeletedFolders: this.plugin.settings.numberOfDeletedFolders,
			numberOfFilesNavigated: this.plugin.settings.numberOfFilesNavigated,
			numberOfSettingViews: this.plugin.settings.numberOfSettingViews,
		};

		const statsVisible = Object.values(stats).some(stat => stat >= 10);
		const experiencedUser = Object.values(stats).some(stat => stat > 100);

		if (statsVisible) {
			this.addStatisticsSection(containerEl, stats, experiencedUser);
		} else {
			this.addWelcomeSection(containerEl);
		}
	}

	private addStatisticsSection(containerEl: HTMLElement, stats: Record<string, number>, experiencedUser: boolean): void {
		new Setting(containerEl)
			.setName('Statistics')
			.setHeading();

		new Setting(containerEl)
			.setName('Reset statistics')
			.setDesc('Reset all counters for deleted files, folders, and navigations.')
			.addButton(button => button
				.setButtonText('Reset')
				.onClick(async () => {
					this.resetStatistics(stats);
					await this.plugin.saveSettings();
					this.display();
				}));

		const statsList = containerEl.createEl('ul', { cls: 'note-navigator-stats-list' });
		Object.entries(stats).forEach(([key, value]) => {
			const listItem = statsList.createEl('li');
			listItem.textContent = `${this.formatToSentenceCase(key)}: ${value}`;
		});

		if (experiencedUser) {
			containerEl.createEl('hr', { cls: 'note-navigator-moderate' });
			const feedbackParagraph = containerEl.createEl('p');
			feedbackParagraph.append("Share your feedback about this plugin on ");

			const feedbackLink = containerEl.createEl('a', { href: 'https://github.com/mudnug/note-navigator', text: 'GitHub' });
			feedbackLink.setAttr('target', '_blank');
			feedbackLink.style.textDecoration = 'underline';
			feedbackParagraph.append(feedbackLink, ", or ");

			const supportLink = containerEl.createEl('a', { href: 'https://buymeacoffee.com/softwarefriend', text: 'support the developer' });
			supportLink.setAttr('target', '_blank');
			supportLink.addClass('custom-support-link');
			feedbackParagraph.append(supportLink);
			feedbackParagraph.append(".");
		}
	}

	private addWelcomeSection(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Welcome')
			.setHeading();

		const welcomeSetting = new Setting(containerEl)
			.setDesc('Assign hotkeys to the plugin commands for easier use.');
		welcomeSetting.descEl.addClass('custom-welcome-message');

		welcomeSetting.addButton(button => {
			button.setButtonText('Configure Hotkeys')
				.setIcon('plus-circle')
				.onClick(() => {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const settingsTab = (this.app as any).setting;
					const tab = settingsTab.openTabById('hotkeys');
					if (
						typeof tab === 'object' &&
						tab !== null &&
						'setQuery' in tab &&
						typeof (tab as { setQuery: unknown }).setQuery === 'function'
					) {
						(tab as { setQuery: (query: string) => void }).setQuery(this.plugin.manifest.id);
					}
				});
		});
	}

	private resetStatistics(stats: Record<string, number>): void {
		(Object.keys(stats) as (keyof typeof stats)[]).forEach(key => {
			this.plugin.settings[key as keyof NoteNavigatorSettings] = 0 as never;
		});
	}
}
