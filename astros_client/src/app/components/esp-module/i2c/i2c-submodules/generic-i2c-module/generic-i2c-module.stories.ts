import { Meta, moduleMetadata, StoryObj } from "@storybook/angular";
import { I2cModule, ModuleSubType } from "astros-common";
import { GenericI2cModuleComponent } from "./generic-i2c-module.component";
import { v4 as uuid } from "uuid";

const meta: Meta<GenericI2cModuleComponent> = {
    title: 'Modules/I2c/Submodules/GenericI2C',
    component: GenericI2cModuleComponent,
    tags: ['autodocs'],
    decorators: [
        moduleMetadata({
            imports: [],
        }),
    ],
};

export default meta;

type Story = StoryObj<GenericI2cModuleComponent>; 

export const Default: Story = {
    args: {
        module: getModule(1),
    },
};

function getModule(i2cAddress: number) {
    const module = new I2cModule(
        uuid(),
        'PCA9685',
        uuid(),
        ModuleSubType.genericI2C,
        i2cAddress,
    );
    return module;
}