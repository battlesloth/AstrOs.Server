import {
    applicationConfig,
    Meta,
    moduleMetadata,
    StoryObj
} from "@storybook/angular";
import { ScriptRowComponent } from "./script-row.component";
import { FontAwesomeModule } from "@fortawesome/angular-fontawesome";
import { ModuleChannelTypes, ModuleSubType, ScriptChannel, ScriptChannelType } from "astros-common";
import { v4 as uuid_v4 } from "uuid";
import { UartChannel } from "astros-common";


const meta: Meta<ScriptRowComponent> = {
    title: 'Scripting/ScriptRow',
    component: ScriptRowComponent,
    tags: ['autodocs'],
    decorators: [
        moduleMetadata({
            imports: [
                FontAwesomeModule
            ],
        }),
        applicationConfig({
            providers: [
            ],
        }),
    ],
};

export default meta;

type Story = StoryObj<ScriptRowComponent>;

export const Default: Story = {
    args: {
        channel: getMockChannel()
    }
};

function getMockChannel(): ScriptChannel {
    return new ScriptChannel(
        uuid_v4(),
        uuid_v4(),
        uuid_v4(),
        uuid_v4(),
        ScriptChannelType.GENERIC_UART,
        ModuleChannelTypes.UartChannel,
        new UartChannel(
            uuid_v4(),
            uuid_v4(),
            'Test Channel',
            ModuleSubType.genericSerial,
            true,
        ),
        300
    );
}