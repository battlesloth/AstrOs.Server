import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosRemotePageList from './AstrosRemotePageList.vue';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';
import { makeNoneButton } from '@/models/remoteControl/pageButton';

function mkPage(
  id: string,
  name: string,
  partial: Partial<RemoteControlPage> = {},
): RemoteControlPage {
  return {
    id,
    name,
    button1: makeNoneButton(),
    button2: makeNoneButton(),
    button3: makeNoneButton(),
    button4: makeNoneButton(),
    button5: makeNoneButton(),
    button6: makeNoneButton(),
    button7: makeNoneButton(),
    button8: makeNoneButton(),
    button9: makeNoneButton(),
    ...partial,
  };
}

// Wrap each story in a narrow rail container so the layout reads how it
// would when embedded in the Phase 2d 3-pane editor (left rail ~220px).
const railWrapper = `
  <div style="
    width: 220px;
    height: 400px;
    border: 1px solid #d6e0e6;
    border-radius: 8px;
    overflow: hidden;
    background: #f6f7f9;
    display: flex;
  ">
    <AstrosRemotePageList
      v-bind="args"
      @select="(i) => console.log('select', i)"
      @add="() => console.log('add')"
      @duplicate="(i) => console.log('duplicate', i)"
      @delete="(i) => console.log('delete', i)"
      @rename="(p) => console.log('rename', p)"
    />
  </div>
`;

const meta: Meta<typeof AstrosRemotePageList> = {
  title: 'components/remoteControl/AstrosRemotePageList',
  component: AstrosRemotePageList,
  render: (args) => ({
    components: { AstrosRemotePageList },
    setup: () => ({ args }),
    template: railWrapper,
  }),
};
export default meta;

type Story = StoryObj<typeof AstrosRemotePageList>;

const SAMPLE_3 = [
  mkPage('a', 'Quick Actions', {
    button1: { id: 's1', name: 'Wave', type: 'script' },
    button2: { id: 's2', name: 'Bow', type: 'script' },
    button5: { id: 'p1', name: 'Routine', type: 'playlist' },
  }),
  mkPage('b', 'Performance'),
  mkPage('c', 'Songs', {
    button9: { id: 's3', name: 'Whistle', type: 'script' },
  }),
];

export const SinglePageDeleteDisabled: Story = {
  args: { pages: [mkPage('only', 'Only Page')], selectedIdx: 0 },
};

export const ThreePages: Story = {
  args: { pages: SAMPLE_3, selectedIdx: 0 },
};

export const ManyPagesScroll: Story = {
  args: {
    pages: Array.from({ length: 30 }, (_, i) => mkPage(`p${i}`, `Page ${i + 1}`)),
    selectedIdx: 4,
  },
};

export const LongNames: Story = {
  args: {
    pages: [
      mkPage('a', 'A Really Quite Long Page Name That Will Truncate With Ellipsis'),
      mkPage('b', 'Performance'),
      mkPage('c', 'Another Long Page Name For Visual Truncation Check'),
    ],
    selectedIdx: 0,
  },
};
