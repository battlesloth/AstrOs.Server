import { Meta, moduleMetadata, StoryObj } from "@storybook/angular";
import { Pca9685ModuleComponent } from "./pca9685-module.component";
import { I2cModule, I2cType } from "astros-common";

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
        '1234',
        'PCA9685',
        'core',
        I2cType.pwmBoard,
        i2cAddress,
    );
}