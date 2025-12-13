import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { fn } from 'storybook/test'
import { ref } from 'vue'
import AstrosFieldUsername from './AstrosFieldUsername.vue'

interface FieldUsernameProps {
    modelValue: string
    onEnter: () => void
}

const meta = {
    title: 'Components/Common/Fields/Username',
    component: AstrosFieldUsername,
    render: (args: unknown) => ({
        components: { AstrosFieldUsername },
        setup() {
            const props = args as FieldUsernameProps
            const username = ref(props.modelValue || '')
            return { props, username }
        },
        template: '<AstrosFieldUsername v-model="username" @enter="props.onEnter" />',
    }),
    parameters: {
        layout: 'centered',
    },
    args: {
        onEnter: fn(),
    },
    argTypes: {
        modelValue: {
            control: 'text',
            description: 'The email value (v-model)',
        },
    },
    tags: ['autodocs'],
} satisfies Meta<typeof AstrosFieldUsername>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
    args: {
        modelValue: '',
    },
}

export const WithValue: Story = {
    args: {
        modelValue: 'user@example.com',
    },
}

export const Interactive: Story = {
    args: {
        modelValue: '',
    },
    parameters: {
        docs: {
            description: {
                story:
                    'Enter an email address and press Enter to see the enter event in the Actions panel.',
            },
        },
    },
}
