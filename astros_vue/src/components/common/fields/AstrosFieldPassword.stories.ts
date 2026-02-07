import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { fn } from 'storybook/test';
import { ref } from 'vue';
import AstrosFieldPassword from './AstrosFieldPassword.vue';

interface FieldPasswordProps {
  modelValue: string;
  onEnter: () => void;
  validatePassword: boolean;
}

const meta = {
  title: 'Components/Common/Fields/Password',
  component: AstrosFieldPassword,
  render: (args: unknown) => ({
    components: { AstrosFieldPassword },
    setup() {
      const props = args as FieldPasswordProps;
      const password = ref(props.modelValue || '');
      return { props, password };
    },
    template:
      '<AstrosFieldPassword v-model="password" :validate-password="props.validatePassword" />',
  }),
  parameters: {
    layout: 'centered',
  },
  args: {
    onEnter: fn(),
    validatePassword: false,
  },
  argTypes: {
    modelValue: {
      control: 'text',
      description: 'The password value (v-model)',
    },
    validatePassword: {
      control: 'boolean',
      description: 'Whether to enable password validation',
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosFieldPassword>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    modelValue: '',
    validatePassword: false,
  },
};

export const WithValidation: Story = {
  args: {
    modelValue: '',
    validatePassword: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Password field with validation enabled. Shows requirements: 8+ characters, number, lowercase, uppercase.',
      },
    },
  },
};

export const WithValue: Story = {
  args: {
    modelValue: 'mypassword',
    validatePassword: false,
  },
};

export const WithValidValue: Story = {
  args: {
    modelValue: 'MyPassword123',
    validatePassword: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Password field with a valid password that meets all validation requirements.',
      },
    },
  },
};

export const Interactive: Story = {
  args: {
    modelValue: '',
    validatePassword: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Try entering different passwords to test validation. Press Enter to see the enter event in the Actions panel.',
      },
    },
  },
};
