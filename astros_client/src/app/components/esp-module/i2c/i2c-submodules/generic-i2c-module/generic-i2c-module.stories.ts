import { Meta, moduleMetadata, StoryObj } from "@storybook/angular";
import { I2cModule, I2cType } from "astros-common";
import { GenericI2cModuleComponent } from "./generic-i2c-module.component";

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
        '1234',
        'PCA9685',
        'core',
        I2cType.genericI2C,
        i2cAddress,
    );
    return module;
}