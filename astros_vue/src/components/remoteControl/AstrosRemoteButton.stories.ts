import { type Meta, type StoryObj } from "@storybook/vue3";

import AstrosRemoteButton from "./AstrosRemoteButton.vue";

const meta = {
  title: "components/remoteControl/AstrosRemoteButton",
  component: AstrosRemoteButton,
  render: (args: unknown) => ({
    components: { AstrosRemoteButton },
    setup() {
      return { args };
    },
    template: '<AstrosRemoteButton v-bind="args" />',
  }),
  parameters: {
    layout: "centered",
  },
  args: {
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AstrosRemoteButton>;

export default meta;

type Story = StoryObj<typeof meta>;

const demoScripts = [
  { id: "1", name: "Script 1" },
  { id: "2", name: "Script 2" },
  { id: "3", name: "Script 3" },
];


export const Primary: Story = {
  args: {
    currentScript: "1",
    scripts: demoScripts,
  },
};