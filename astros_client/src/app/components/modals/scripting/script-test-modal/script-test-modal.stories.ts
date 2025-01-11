import { Meta, StoryObj } from "@storybook/angular";
import { ScriptTestModalComponent } from "./script-test-modal.component";

const meta: Meta<ScriptTestModalComponent> = {
    title: "Components/Modals/ScriptTestModal",
    component: ScriptTestModalComponent,
    tags: ["autodocs"]
};

export default meta;

type Story = StoryObj<ScriptTestModalComponent>;

export const Default: Story = {
    args: {},
};