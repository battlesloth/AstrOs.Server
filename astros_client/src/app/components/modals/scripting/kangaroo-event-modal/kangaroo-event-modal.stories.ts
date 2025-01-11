import { Meta, StoryObj } from "@storybook/angular";
import { KangarooEventModalComponent } from "./kangaroo-event-modal.component";

const meta: Meta<KangarooEventModalComponent> = {
    title: "Components/Modals/KangarooEventModal",
    component: KangarooEventModalComponent,
    tags: ["autodocs"]
};

export default meta;

type Story = StoryObj<KangarooEventModalComponent>;

export const Default: Story = {
    args: {},
};