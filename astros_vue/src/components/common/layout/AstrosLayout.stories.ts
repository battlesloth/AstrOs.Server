import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosLayout from './AstrosLayout.vue';

const meta = {
    title: 'components/common/layout',
    component: AstrosLayout,
    render: (args: unknown) => ({
        components: { AstrosLayout },
        setup() {
            return { args };
        },
        template: '<AstrosLayout v-bind="args" />',
    }),
    parameters: {
        layout: 'fullscreen',
    },
    args: {
    },
    tags: ['autodocs'],
} satisfies Meta<typeof AstrosLayout>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
    },
};