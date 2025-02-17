import { Meta, moduleMetadata, StoryObj } from "@storybook/angular";
import { Pca9685ModuleComponent } from "./pca9685-module.component";
import { I2cModule, ModuleSubType, } from "astros-common";
import { v4 as uuid } from "uuid";

const meta: Meta<Pca9685ModuleComponent> = {
    title: 'Modules/I2c/Submodules/Pca9685',
    component: Pca9685ModuleComponent,
    tags: ['autodocs'],
    decorators: [
        moduleMetadata({
            imports: [],
        }),
    ],
};

export default meta;

type Story = StoryObj<Pca9685ModuleComponent>; 

export const Default: Story = {
    args: {
        module: getModule(1),
    },
};

function getModule(i2cAddress: number): any {
    new I2cModule(
        uuid(),
        'PCA9685',
        uuid(),
        ModuleSubType.pwmBoard,
        i2cAddress,
    );
}