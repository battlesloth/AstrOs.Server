import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import AstrosHtmlModal from './AstrosHtmlModal.vue';

const meta = {
  title: 'Components/Modals/HtmlModal',
  component: AstrosHtmlModal,
  parameters: {
    layout: 'centered',
  },
  args: {
    onClose: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosHtmlModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Information',
    content: '<p>This is some <strong>HTML</strong> content displayed in a modal.</p>',
  },
};

export const WithList: Story = {
  args: {
    title: 'Features',
    content:
      '<ul><li><strong>Feature 1</strong> — Description of the first feature</li><li><strong>Feature 2</strong> — Description of the second feature</li><li><strong>Feature 3</strong> — Description of the third feature</li></ul>',
  },
};

export const NoTitle: Story = {
  args: {
    content: '<p>This modal has no title, just HTML content.</p>',
  },
};

export const RichContent: Story = {
  args: {
    title: 'Help',
    content:
      '<h3>Getting Started</h3><p>Follow these steps to get started:</p><ol><li>Create a new item</li><li>Configure the settings</li><li>Save your changes</li></ol><p><em>Note: Changes take effect immediately.</em></p>',
  },
};

export const LongContent: Story = {
  args: {
    title: 'Details',
    content:
      '<p>This is a longer block of content that demonstrates how the modal handles overflow.</p><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p><p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p><p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>',
  },
};
