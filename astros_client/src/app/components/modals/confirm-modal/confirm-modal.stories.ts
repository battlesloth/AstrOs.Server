import { Meta, StoryObj } from "@storybook/angular";
import { ConfirmModalComponent } from "./confirm-modal.component";

const meta: Meta<ConfirmModalComponent> = {
    title: "Components/Modals/ConfirmModal",
    component: ConfirmModalComponent,
    tags: ["autodocs"]
};

export default meta;

type Story = StoryObj<ConfirmModalComponent>;

export const Default: Story = {
    args: {},
};