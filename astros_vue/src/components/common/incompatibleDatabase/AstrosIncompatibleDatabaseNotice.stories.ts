import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AstrosIncompatibleDatabaseNotice from './AstrosIncompatibleDatabaseNotice.vue';

const meta = {
  title: 'Components/Common/AstrosIncompatibleDatabaseNotice',
  component: AstrosIncompatibleDatabaseNotice,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosIncompatibleDatabaseNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

// App.vue renders this in place of the router view when the server reports
// DB_NEWER_THAN_SERVER; the component itself has no state.
export const Default: Story = {};
