import { applicationConfig, Meta, moduleMetadata, StoryObj } from "@storybook/angular";
import { EspSubmoduleComponent } from "./esp-submodule.component";
import { importProvidersFrom } from "@angular/core";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import { MatExpansionPanel } from "@angular/material/expansion";

const meta: Meta<EspSubmoduleComponent> = {
    title: "Modules/EspSubmodule",
    component: EspSubmoduleComponent,
    tags: ["autodocs"],
    decorators: [
        moduleMetadata({
            imports: [MatExpansionPanel],
        }),
        applicationConfig({
            providers: [importProvidersFrom(BrowserAnimationsModule)],
        })
    ],
};

export default meta;

type Story = StoryObj<EspSubmoduleComponent>;

export const Default: Story = {
    args: {},
};