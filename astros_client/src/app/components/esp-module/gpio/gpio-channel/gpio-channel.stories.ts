import { Meta, StoryObj } from "@storybook/angular";
import { GpioChannelComponent } from "./gpio-channel.component";
import { GpioChannel } from "astros-common";

const meta: Meta<GpioChannelComponent> = {
    title: "Modules/Gpio/GpioChannel",
    component: GpioChannelComponent,
    tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<GpioChannelComponent>;

export const Default: Story = {
    args: {
        channel: new GpioChannel(
            0, 
            "Test",
            true,
            true
        )
    },
};

export const DefaultHigh: Story = {
    args: {
        channel: new GpioChannel(
            0, 
            "Test",
            false,
            true
        )
    },
};

export const Disabled: Story = {
    args: {
        channel: new GpioChannel(
            0, 
            "Test",
            true,
            false
        )
    },
};