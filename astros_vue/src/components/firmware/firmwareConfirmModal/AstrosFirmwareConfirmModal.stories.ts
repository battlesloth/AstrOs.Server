import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AstrosFirmwareConfirmModal from './AstrosFirmwareConfirmModal.vue';
import { Location } from '@/enums';
import type { FirmwareControllerView } from '@/types/firmware';

const body: FirmwareControllerView = {
  id: Location.BODY,
  label: 'Body',
  glyph: 'B',
  current: 'v1.3.0',
  status: 'up',
  isMaster: true,
};
const core: FirmwareControllerView = {
  id: Location.CORE,
  label: 'Core',
  glyph: 'C',
  current: 'v1.4.0',
  status: 'up',
  isMaster: false,
};

const meta = {
  title: 'Components/Firmware/AstrosFirmwareConfirmModal',
  component: AstrosFirmwareConfirmModal,
  parameters: { layout: 'centered' },
  // Stories always render with `open: true` so the modal shows on the
  // Storybook canvas. The `<dialog>.showModal()` API requires the element
  // to be attached to the document, which Storybook handles via its render
  // root — but the modal will visually occupy the canvas, not the host page.
} satisfies Meta<typeof AstrosFirmwareConfirmModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleControllerGithub: Story = {
  args: {
    open: true,
    target: 'v1.4.2',
    sourceMode: 'github',
    selectedControllers: [body],
  },
};

export const AllControllersGithub: Story = {
  args: {
    open: true,
    target: 'v1.4.2',
    sourceMode: 'github',
    selectedControllers: [body, core],
  },
};

export const UploadSource: Story = {
  args: {
    open: true,
    target: 'local-build',
    sourceMode: 'upload',
    uploadedFilename: 'astros-custom-build.bin',
    selectedControllers: [body, core],
  },
};

export const DowngradeAckRequired: Story = {
  args: {
    open: true,
    target: 'v1.3.5',
    sourceMode: 'github',
    // Body 1.3.0 → 1.3.5 (upgrade); Core 1.4.0 → 1.3.5 (downgrade). The
    // ack region renders with count=1 and Confirm stays disabled until
    // the operator ticks the checkbox.
    selectedControllers: [body, core],
  },
};
