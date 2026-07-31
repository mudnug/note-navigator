import NoteNavigator from './main';

const LS_PREFIX = 'note-navigator-stats-';

export const StatsKey = {
	DeletedAttachments: 'numberOfDeletedAttachments',
	DeletedFiles: 'numberOfDeletedFiles',
	DeletedFolders: 'numberOfDeletedFolders',
	FilesNavigated: 'numberOfFilesNavigated',
	SettingViews: 'numberOfSettingViews',
} as const;

export type StatsKey = (typeof StatsKey)[keyof typeof StatsKey];

export type StatisticsStorageMode = 'pluginStorage' | 'browserStorage';

export class StatisticsStorage {
	private mode: StatisticsStorageMode;

	constructor(private plugin: NoteNavigator, mode: StatisticsStorageMode = 'pluginStorage') {
		this.mode = mode;
	}

	getMode(): StatisticsStorageMode {
		return this.mode;
	}

	get(key: StatsKey): number {
		if (this.mode === 'browserStorage') {
			const value = this.plugin.app.loadLocalStorage(LS_PREFIX + key) as string | null;
			return parseInt(value ?? '0', 10);
		}
		return this.plugin.settings[key] || 0;
	}

	getAll(): Record<StatsKey, number> {
		const result: Record<StatsKey, number> = {} as Record<StatsKey, number>;
		for (const key of Object.values(StatsKey) as StatsKey[]) {
			result[key] = this.get(key);
		}
		return result;
	}

	set(key: StatsKey, value: number): void {
		if (this.mode === 'browserStorage') {
			void this.plugin.app.saveLocalStorage(LS_PREFIX + key, String(value));
		} else {
			(this.plugin.settings[key] as number | undefined) = value;
		}
	}

	increment(key: StatsKey, delta = 1): void {
		if (delta === 0) return;
		this.set(key, (this.get(key) || 0) + delta);
	}

	reset(): void {
		for (const key of Object.values(StatsKey) as StatsKey[]) {
			this.set(key, 0);
		}
		if (this.mode === 'pluginStorage') {
			void this.plugin.saveSettings();
		}
	}

	async setMode(newMode: StatisticsStorageMode, migrate = true): Promise<void> {
		if (this.mode === newMode) return;
		if (!migrate) {
			this.mode = newMode;
			return;
		}

		const currentStats = this.getAll();

		if (newMode === 'browserStorage') {
			for (const statsKey of Object.values(StatsKey) as StatsKey[]) {
				void this.plugin.app.saveLocalStorage(LS_PREFIX + statsKey, String(currentStats[statsKey]));
			}
			try {
				for (const statsKey of Object.values(StatsKey) as StatsKey[]) {
					(this.plugin.settings[statsKey] as number | undefined) = 0;
				}
				await this.plugin.saveSettings();
			} catch (e) {
				console.error('[Note Navigator] Failed to save settings during migration to browserStorage:', e);
				throw e;
			}
		} else {
			for (const statsKey of Object.values(StatsKey) as StatsKey[]) {
				(this.plugin.settings[statsKey] as number | undefined) = currentStats[statsKey];
			}
			try {
				await this.plugin.saveSettings();
				for (const statsKey of Object.values(StatsKey) as StatsKey[]) {
					void this.plugin.app.saveLocalStorage(LS_PREFIX + statsKey, null);
				}
			} catch (e) {
				console.error('[Note Navigator] Failed to save settings during migration to pluginStorage:', e);
				for (const statsKey of Object.values(StatsKey) as StatsKey[]) {
					void this.plugin.app.saveLocalStorage(LS_PREFIX + statsKey, String(currentStats[statsKey]));
				}
				throw e;
			}
		}

		this.mode = newMode;
	}
}