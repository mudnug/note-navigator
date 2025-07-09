import { App, Modal } from 'obsidian';

export class ConfirmationSection {
    heading: string;
    lines: string[];

    constructor(heading: string, lines: string[]) {
        this.heading = heading;
        this.lines = lines;
    }
}

export class ConfirmationDialog {
    app: App;
    header: string;
    sections: ConfirmationSection[];

    constructor(app: App, header: string, sections: ConfirmationSection[]) {
        this.app = app;
        this.header = header;
        this.sections = sections;
    }

    async show(): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = this.createModal(resolve);
            modal.open();
        });
    }

    private createModal(resolve: (value: boolean) => void): Modal {
        const modal = new Modal(this.app);
        modal.contentEl.addClass("note-navigator-confirmation");
        modal.titleEl.setText(this.header);

        this.sections.forEach(section => {
            const headingItem = modal.contentEl.createEl("div", { text: section.heading });
            headingItem.addClass("section-heading");

            const list = modal.contentEl.createEl("ul");
            section.lines.forEach(line => {
                list.createEl("li", { text: line });
            });
        });

        const buttonContainer = modal.contentEl.createDiv("note-navigator-button-container");

        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
        cancelButton.onclick = () => {
            modal.close();
            resolve(false);
        };

        const deleteButton = buttonContainer.createEl("button", { cls: "mod-warning", text: "Delete" });
        deleteButton.onclick = () => {
            modal.close();
            resolve(true);
        };

        return modal;
    }
}
