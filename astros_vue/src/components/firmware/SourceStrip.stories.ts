import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { createPinia, setActivePinia } from 'pinia';
import SourceStrip from './SourceStrip.vue';
import { useFirmwareStore } from '@/stores/firmware';
import type { ReleaseInfo } from '@/types/firmware';

const sampleReleases: ReleaseInfo[] = [
  {
    tag: 'v1.4.2',
    version: '1.4.2',
    publishedAt: '2026-04-18T12:00:00Z',
    prerelease: false,
    assets: [
      {
        variant: 'lolin_d32_pro',
        version: '1.4.2',
        assetName: 'astros-esp-1.4.2-lolin_d32_pro-app.bin',
        assetUrl: 'https://example.invalid/v1.4.2.bin',
        sizeBytes: 1_269_760,
      },
    ],
  },
  {
    tag: 'v1.4.3-rc.1',
    version: '1.4.3-rc.1',
    publishedAt: '2026-04-22T12:00:00Z',
    prerelease: true,
    assets: [
      {
        variant: 'lolin_d32_pro',
        version: '1.4.3-rc.1',
        assetName: 'astros-esp-1.4.3-rc.1-lolin_d32_pro-app.bin',
        assetUrl: 'https://example.invalid/v1.4.3-rc.1.bin',
        sizeBytes: 1_280_000,
      },
    ],
  },
  {
    tag: 'v1.4.0',
    version: '1.4.0',
    publishedAt: '2026-03-30T12:00:00Z',
    prerelease: false,
    assets: [
      {
        variant: 'lolin_d32_pro',
        version: '1.4.0',
        assetName: 'astros-esp-1.4.0-lolin_d32_pro-app.bin',
        assetUrl: 'https://example.invalid/v1.4.0.bin',
        sizeBytes: 1_248_000,
      },
    ],
  },
];

const meta = {
  title: 'Components/Firmware/SourceStrip',
  component: SourceStrip,
  parameters: { layout: 'padded' },
  decorators: [
    (story) => ({
      components: { story },
      template:
        '<div style="background: #f2f7fa; padding: 24px; max-width: 1100px;"><story /></div>',
    }),
  ],
} satisfies Meta<typeof SourceStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GithubLoaded: Story = {
  render: () => ({
    components: { SourceStrip },
    setup() {
      setActivePinia(createPinia());
      const store = useFirmwareStore();
      store.releases = sampleReleases;
      store.releasesLoadState = 'loaded';
      store.staleSince = null;
      store.sourceMode = 'github';
      store.selectedReleaseVersion = 'v1.4.2';
      return {};
    },
    template: '<SourceStrip />',
  }),
};

export const GithubPrereleaseSelected: Story = {
  render: () => ({
    components: { SourceStrip },
    setup() {
      setActivePinia(createPinia());
      const store = useFirmwareStore();
      store.releases = sampleReleases;
      store.releasesLoadState = 'loaded';
      store.staleSince = null;
      store.sourceMode = 'github';
      store.selectedReleaseVersion = 'v1.4.3-rc.1';
      return {};
    },
    template: '<SourceStrip />',
  }),
};

export const GithubNoSelection: Story = {
  render: () => ({
    components: { SourceStrip },
    setup() {
      setActivePinia(createPinia());
      const store = useFirmwareStore();
      store.releases = sampleReleases;
      store.releasesLoadState = 'loaded';
      store.staleSince = null;
      store.sourceMode = 'github';
      store.selectedReleaseVersion = null;
      return {};
    },
    template: '<SourceStrip />',
  }),
};

export const GithubLoading: Story = {
  render: () => ({
    components: { SourceStrip },
    setup() {
      setActivePinia(createPinia());
      const store = useFirmwareStore();
      store.releases = [];
      store.releasesLoadState = 'loading';
      store.staleSince = null;
      store.sourceMode = 'github';
      return {};
    },
    template: '<SourceStrip />',
  }),
};

export const GithubStale: Story = {
  render: () => ({
    components: { SourceStrip },
    setup() {
      setActivePinia(createPinia());
      const store = useFirmwareStore();
      store.releases = sampleReleases;
      store.releasesLoadState = 'stale';
      store.staleSince = '2026-04-25T12:00:00.000Z';
      store.sourceMode = 'github';
      store.selectedReleaseVersion = 'v1.4.2';
      return {};
    },
    template: '<SourceStrip />',
  }),
};

export const GithubError: Story = {
  render: () => ({
    components: { SourceStrip },
    setup() {
      setActivePinia(createPinia());
      const store = useFirmwareStore();
      store.releases = [];
      store.releasesLoadState = 'error';
      store.staleSince = null;
      store.sourceMode = 'github';
      return {};
    },
    template: '<SourceStrip />',
  }),
};

export const UploadEmpty: Story = {
  render: () => ({
    components: { SourceStrip },
    setup() {
      setActivePinia(createPinia());
      const store = useFirmwareStore();
      store.releases = sampleReleases;
      store.releasesLoadState = 'loaded';
      store.sourceMode = 'upload';
      store.uploadedFilename = null;
      return {};
    },
    template: '<SourceStrip />',
  }),
};

export const UploadFileSelected: Story = {
  render: () => ({
    components: { SourceStrip },
    setup() {
      setActivePinia(createPinia());
      const store = useFirmwareStore();
      store.releases = sampleReleases;
      store.releasesLoadState = 'loaded';
      store.sourceMode = 'upload';
      store.uploadedFilename = 'astros-custom-build.bin';
      return {};
    },
    template: '<SourceStrip />',
  }),
};
