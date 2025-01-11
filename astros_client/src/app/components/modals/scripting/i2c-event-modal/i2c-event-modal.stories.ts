import { Meta, StoryObj } from "@storybook/angular";
import { I2cEventModalComponent } from "./i2c-event-modal.component";

const meta: Meta<I2cEventModalComponent> = {
    title: "Components/Modals/I2cEventModal",
    component: I2cEventModalComponent,
    tags: ["autodocs"]
};

export default meta;

type Story = StoryObj<I2cEventModalComponent>;

export const Default: Story = {
    args: {},
};