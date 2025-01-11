import { Meta, StoryObj } from "@storybook/angular";
import { ServoTestModalComponent } from "./servo-test-modal.component";

const meta: Meta<ServoTestModalComponent> = {
    title: "Components/Modals/ServoTestModal",
    component: ServoTestModalComponent,
    tags: ["autodocs"]
};

export default meta;

type Story = StoryObj<ServoTestModalComponent>;

export const Default: Story = {
    args: {},
};