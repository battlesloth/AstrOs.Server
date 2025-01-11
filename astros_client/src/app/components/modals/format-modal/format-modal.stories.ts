import { Meta, StoryObj } from '@storybook/angular';
import { FormatModalComponent } from './format-modal.component';

const meta: Meta<FormatModalComponent> = {
  title: 'Components/Modals/FormatModal',
  component: FormatModalComponent,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<FormatModalComponent>;

export const Default: Story = {
  args: {},
};
