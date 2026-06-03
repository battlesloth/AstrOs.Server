import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosRemoteLivePreview from './AstrosRemoteLivePreview.vue';
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

const meta: Meta<typeof AstrosRemoteLivePreview> = {
  title: 'components/remoteControl/AstrosRemoteLivePreview',
  component: AstrosRemoteLivePreview,
};
export default meta;

type Story = StoryObj<typeof AstrosRemoteLivePreview>;

export const SinglePageEmpty: Story = {
  args: { pages: [mkPage('only', 'Only Page')], selectedIdx: 0 },
};

export const ThreePagesMixed: Story = {
  args: {
    pages: [
      mkPage('a', 'Quick Actions', {
        button1: { id: 's1', name: 'Wave Hello', type: 'script' },
        button2: { id: 's2', name: 'Take a Bow', type: 'script' },
        button5: { id: 'p1', name: 'Diagnostic Routine', type: 'playlist' },
      }),
      mkPage('b', 'Performance'),
      mkPage('c', 'Songs', {
        button9: { id: 's3', name: 'Imperial Whistle', type: 'script' },
      }),
    ],
    selectedIdx: 0,
  },
};

export const SecondPageSelected: Story = {
  args: {
    pages: [
      mkPage('a', 'Quick Actions'),
      mkPage('b', 'Performance', {
        button5: { id: 's4', name: 'Spotlight Dance', type: 'script' },
      }),
      mkPage('c', 'Songs'),
    ],
    selectedIdx: 1,
  },
};
