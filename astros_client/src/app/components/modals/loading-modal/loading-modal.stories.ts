import { Meta, StoryObj } from "@storybook/angular";
import { LoadingModalComponent } from "./loading-modal.component";

const meta: Meta<LoadingModalComponent> = {
    title: "Components/Modals/LoadingModal",
    component: LoadingModalComponent,
    tags: ["autodocs"]
};

export default meta;

type Story = StoryObj<LoadingModalComponent>;

export const Default: Story = {
    args: {},
};