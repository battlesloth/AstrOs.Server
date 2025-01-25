import { Meta, moduleMetadata, StoryObj } from "@storybook/angular";
import { MaestroChannelComponent } from "./maestro-channel.component";

const meta: Meta<MaestroChannelComponent> = {
    title: "Modules/Uart/Submodules/MaestroChannel",
    component: MaestroChannelComponent,
    decorators: [
        moduleMetadata({
            imports: [],
        }),
    ],    
};

export default meta;

type Story = StoryObj<MaestroChannelComponent>;

export const Default: Story = {
    args: {},
};
