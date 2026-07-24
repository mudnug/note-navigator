import { App } from 'obsidian';
import { PluginSettingTab, Setting } from 'obsidian';

import NoteNavigator, { type WorkspaceWithConfigChange } from './main';
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

export class NoteNavigatorSettingTab extends PluginSettingTab {
	plugin: NoteNavigator;
	private configChangeListenerRegistered = false;

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
		void this.displayAsync();
	}

	refresh(): void {
		this.render();
	}

	private async displayAsync(): Promise<void> {
		await this.plugin.loadSettings();
		this.plugin.statisticsStorage.setMode(this.plugin.settings.statisticsStorageMode, false);
		this.incrementSettingViews();
		this.render();
	}

	private incrementSettingViews(): void {
		this.plugin.statisticsStorage.increment(StatsKey.SettingViews);
		void this.plugin.saveSettings();
	}

	private render(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Navigation')
			.setHeading();

		new Setting(containerEl)
			.setName('Scope')
			.setDesc('Navigate through files in the entire vault or just within the active folder.')
			.addDropdown(dropdown => {
				dropdown
					.addOption('entireVault', 'Entire vault')
					.addOption('activeFolder', 'Active folder')
					.setValue(this.plugin.settings.navigationScope)
					.onChange(async (value) => {
						this.plugin.settings.navigationScope = value as 'entireVault' | 'activeFolder';
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('File explorer')
			.setHeading();

		new Setting(containerEl)
			.setName('Fade attachment folders')
			.setDesc('Make the attachment folder less noticeable in the file explorer.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.fadeAttachmentFolders)
				.onChange(async (value) => {
					this.plugin.settings.fadeAttachmentFolders = value;
					await this.plugin.saveSettings();
					this.plugin.updateAttachmentFolderFade();
				}));

		if (!this.configChangeListenerRegistered) {
			this.configChangeListenerRegistered = true;
			this.plugin.registerEvent((this.app.workspace as WorkspaceWithConfigChange).on('config-change', () => {
				if (this.plugin.settings.fadeAttachmentFolders) {
					this.plugin.updateAttachmentFolderFade();
				}
			}));
		}

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
			.setName('Auto-navigate after deletion')
			.setDesc('Automatically navigate to the next file in sort order of the file-explorer after deletion. Disable to use Obsidian\'s default behavior.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.navigateOnDelete)
				.onChange(async (value) => {
					this.plugin.settings.navigateOnDelete = value;
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
					this.refresh();
				}));


		// Only show parent directory depth setting when remove empty folders is enabled
		if (this.plugin.settings.removeEmptyFolders) {
			new Setting(containerEl)
				.setName('Parent directory traversal depth')
				.setDesc('Number of parent directories to traverse when looking for empty folders to delete (1-10).')
				.addText(text => {
					const textInput = text.inputEl;
					textInput.type = 'number';
					textInput.min = '1';
					textInput.max = '10';
					textInput.step = '1';
					textInput.value = this.plugin.settings.maxDirectoryDeleteTraversal.toString();
					textInput.addClass('note-navigator-delete-depth-input');

					// Add validation styling
					const validateInput = (value: string) => {
						const numValue = parseInt(value);
						if (numValue >= 1 && numValue <= 10) {
							textInput.removeClass('setting-input-invalid');
							return true;
						} else {
							textInput.addClass('setting-input-invalid');
							return false;
						}
					};

					text.setValue(this.plugin.settings.maxDirectoryDeleteTraversal.toString())
						.onChange(async (value) => {
							const numValue = parseInt(value);
							if (validateInput(value) && numValue >= 1 && numValue <= 10) {
								this.plugin.settings.maxDirectoryDeleteTraversal = numValue;
								await this.plugin.saveSettings();
							}
						});

					// Validate on blur to catch invalid values
					textInput.addEventListener('blur', () => {
						if (!validateInput(textInput.value)) {
							// Reset to valid value if current value is invalid
							const currentValue = parseInt(textInput.value);
							if (isNaN(currentValue) || currentValue < 1 || currentValue > 10) {
								textInput.value = this.plugin.settings.maxDirectoryDeleteTraversal.toString();
								validateInput(textInput.value);
							}
						}
					});
				});
		}

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

		new Setting(containerEl)
			.setName('Enable debug logging')
			.setDesc('Enable verbose console logging for debugging purposes.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDebugLogging)
				.onChange(async (value) => {
					this.plugin.settings.enableDebugLogging = value;
					await this.plugin.saveSettings();
				}));

		const stats = this.plugin.statisticsStorage.getAll();
		const experiencedUser = Object.values(stats).some(stat => stat > 100);

		this.addWelcomeSection(containerEl);
		this.addStatisticsSection(containerEl, stats, experiencedUser);
	}

	private addStatisticsSection(containerEl: HTMLElement, stats: Record<string, number>, experiencedUser: boolean): void {
		new Setting(containerEl)
			.setName('Statistics')
			.setHeading();

		new Setting(containerEl)
			.setName('Storage mode')
			.setDesc('Choose where statistics are stored.')
			.addDropdown(dropdown => {
				dropdown
					.addOption('pluginStorage', 'Sync across devices (plugin storage)')
					.addOption('browserStorage', 'This device only (browser storage)')
					.setValue(this.plugin.statisticsStorage.getMode())
					.onChange(async (value) => {
						this.plugin.statisticsStorage.setMode(value as StatisticsStorageMode);
						this.plugin.settings.statisticsStorageMode = value as StatisticsStorageMode;
						await this.plugin.saveSettings();
						this.refresh();
					});
			});

		new Setting(containerEl)
			.setName('Reset statistics')
			.setDesc('Reset all counters for deleted files, folders, and navigations.')
			.addButton(button => button
				.setButtonText('Reset')
				.onClick(async () => {
					this.plugin.statisticsStorage.reset();
					this.refresh();
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
			feedbackLink.addClass('note-navigator-feedback-link');
			feedbackParagraph.append(feedbackLink, ", or ");

			// "support the developer" is already part of a sentence.
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
			.setDesc('Assign hotkeys to the plugin commands for easier use:');
		welcomeSetting.descEl.addClass('note-navigator-welcome-message');

		welcomeSetting.addButton(button => {
			button.setButtonText('Configure hotkeys')
				.setIcon('plus-circle')
				.onClick(() => {
					// Access internal Obsidian API to open hotkey settings
					const setting = (this.app as unknown as { setting: unknown }).setting;
					const tab = (setting as { openTabById?: (id: string) => { setQuery?: (q: string) => void } | undefined }).openTabById?.('hotkeys');
					if (typeof tab?.setQuery === 'function') {
						tab.setQuery(this.plugin.manifest.id);
					}
				});
		});
	}
}
