import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { fn } from 'storybook/test'

import AstrosLogin from './AstrosLogin.vue'

const meta = {
  title: 'Components/Login',
  component: AstrosLogin,
  render: (args: unknown) => ({
    components: { AstrosLogin },
    setup() {
      return { args }
    },
    template: '<AstrosLogin />',
  }),
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onLogin: fn(),
    onCreateAccount: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosLogin>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
}
