import { Meta, StoryObj } from '@storybook/angular';
import { HumanCyborgModalComponent } from './human-cyborg-modal.component';

const meta: Meta<HumanCyborgModalComponent> = {
  title: 'Components/Modals/HumanCyborgModal',
  component: HumanCyborgModalComponent,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<HumanCyborgModalComponent>;

export const Default: Story = {
  args: {},
};
