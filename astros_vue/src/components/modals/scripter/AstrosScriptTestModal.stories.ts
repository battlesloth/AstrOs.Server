import type { Meta, StoryObj } from '@storybook/vue3'
import { fn } from 'storybook/test'
import AstrosScriptTestModal from './AstrosScriptTestModal.vue'
import type { ScriptResponse } from '@/models/scripts/scriptTest'

// Mock observable for websocket messages
const createMockObservable = (initialValue?: ScriptResponse) => {
  const subscribers: Array<(value: ScriptResponse) => void> = []

  return {
    subscribe: (callback: (value: ScriptResponse) => void) => {
      subscribers.push(callback)
      return {
        unsubscribe: () => {
          const index = subscribers.indexOf(callback)
          if (index > -1) subscribers.splice(index, 1)
        }
      }
    },
    next: (value: ScriptResponse) => {
      subscribers.forEach(callback => callback(value))
    }
  }
}

const meta: Meta<typeof AstrosScriptTestModal> = {
  title: 'Components/Modals/Scripter/ScriptTest',
  component: AstrosScriptTestModal,
  tags: ['autodocs'],
  args: {
    onClose: fn()
  }
}

export default meta
type Story = StoryObj<typeof AstrosScriptTestModal>

export const Default: Story = {
  args: {
    scriptId: '42'
  },
  render: (args) => ({
    components: { AstrosScriptTestModal },
    setup() {
      return { args }
    },
    template: '<AstrosScriptTestModal v-bind="args" />'
  })
}

export const UploadInProgress: Story = {
  args: {
    scriptId: '42',
  },
  render: (args) => ({
    components: { AstrosScriptTestModal },
    setup() {
      return { args }
    },
    template: '<AstrosScriptTestModal v-bind="args" />'
  })
}

export const AllUploadsComplete: Story = {
  args: {
    scriptId: '42',
  },
  render: (args) => ({
    components: { AstrosScriptTestModal },
    setup() {
      return { args }
    },
    template: '<AstrosScriptTestModal v-bind="args" />'
  })
}

export const UploadFailed: Story = {
  args: {
    scriptId: '42',
  },
  render: (args) => ({
    components: { AstrosScriptTestModal },
    setup() {
      return { args }
    },
    template: '<AstrosScriptTestModal v-bind="args" />'
  })
}

export const SingleLocation: Story = {
  args: {
    scriptId: '42',
  },
  render: (args) => ({
    components: { AstrosScriptTestModal },
    setup() {
      return { args }
    },
    template: '<AstrosScriptTestModal v-bind="args" />'
  })
}
