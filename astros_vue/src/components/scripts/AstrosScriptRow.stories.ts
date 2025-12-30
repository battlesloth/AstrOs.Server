import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import AstrosScriptRow from './AstrosScriptRow.vue';
import { UploadStatus } from '@/enums/scripts/uploadStatus';

const meta = {
  title: 'Components/Scripts/ScriptRow',
  component: AstrosScriptRow,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    () => ({
      template: `
        <table class="table w-full">
          <thead>
            <tr>
              <th class="w-1/3">Script Name</th>
              <th class="w-2/3">Description</th>
              <th class="text-center">Status</th>
              <th class="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            <story />
          </tbody>
        </table>
      `,
    }),
  ],
  args: {
    onEdit: fn(),
    onCopy: fn(),
    onUpload: fn(),
    onRun: fn(),
    onDelete: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosScriptRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultLocations = ['body', 'core', 'dome'];

export const Default: Story = {
  args: {
    script: {
      id: '1',
      scriptName: 'Open Dome',
      description: 'Opens the observatory dome',
      deploymentStatus: {
        body: { value: UploadStatus.uploaded, date: new Date('2025-12-20T10:30:00') },
        core: { value: UploadStatus.uploaded, date: new Date('2025-12-20T10:30:00') },
        dome: { value: UploadStatus.uploaded, date: new Date('2025-12-20T10:30:00') },
      },
    },
    locations: defaultLocations,
  },
};

export const NotUploaded: Story = {
  args: {
    script: {
      id: '2',
      scriptName: 'Close Dome',
      description: 'Closes the observatory dome',
      deploymentStatus: {
        body: { value: UploadStatus.notUploaded, date: undefined },
        core: { value: UploadStatus.notUploaded, date: undefined },
        dome: { value: UploadStatus.notUploaded, date: undefined },
      },
    },
    locations: defaultLocations,
  },
};

export const Uploading: Story = {
  args: {
    script: {
      id: '3',
      scriptName: 'Start Tracking',
      description: 'Begin telescope tracking',
      deploymentStatus: {
        body: { value: UploadStatus.uploading, date: undefined },
        core: { value: UploadStatus.uploaded, date: new Date('2025-12-15T14:20:00') },
        dome: { value: UploadStatus.uploaded, date: new Date('2025-12-15T14:20:00') },
      },
    },
    locations: defaultLocations,
  },
};

export const MixedStatus: Story = {
  args: {
    script: {
      id: '4',
      scriptName: 'Emergency Stop',
      description: 'Emergency stop all motors',
      deploymentStatus: {
        body: { value: UploadStatus.uploaded, date: new Date('2025-12-18T09:15:00') },
        core: { value: UploadStatus.notUploaded, date: undefined },
        dome: { value: UploadStatus.uploading, date: undefined },
      },
    },
    locations: defaultLocations,
  },
};

export const LongName: Story = {
  args: {
    script: {
      id: '5',
      scriptName: 'Very Long Script Name That Should Truncate',
      description:
        'This is a very long description that should also truncate when it exceeds the available space',
      deploymentStatus: {
        body: { value: UploadStatus.uploaded, date: new Date('2025-12-20T10:30:00') },
        core: { value: UploadStatus.uploaded, date: new Date('2025-12-20T10:30:00') },
        dome: { value: UploadStatus.uploaded, date: new Date('2025-12-20T10:30:00') },
      },
    },
    locations: defaultLocations,
  },
};

export const ShortDescription: Story = {
  args: {
    script: {
      id: '6',
      scriptName: 'Calibrate',
      description: 'Cal',
      deploymentStatus: {
        body: { value: UploadStatus.uploaded, date: new Date('2025-12-20T10:30:00') },
        core: { value: UploadStatus.uploaded, date: new Date('2025-12-20T10:30:00') },
        dome: { value: UploadStatus.uploaded, date: new Date('2025-12-20T10:30:00') },
      },
    },
    locations: defaultLocations,
  },
};

export const NoDescription: Story = {
  args: {
    script: {
      id: '7',
      scriptName: 'Test Script',
      description: '',
      deploymentStatus: {
        body: { value: UploadStatus.uploaded, date: new Date('2025-12-20T10:30:00') },
        core: { value: UploadStatus.uploaded, date: new Date('2025-12-20T10:30:00') },
        dome: { value: UploadStatus.uploaded, date: new Date('2025-12-20T10:30:00') },
      },
    },
    locations: defaultLocations,
  },
};

export const PartialDeployment: Story = {
  args: {
    script: {
      id: '8',
      scriptName: 'Park Telescope',
      description: 'Parks the telescope in home position',
      deploymentStatus: {
        body: { value: UploadStatus.uploaded, date: new Date('2025-12-19T16:45:00') },
      },
    },
    locations: defaultLocations,
  },
};

export const AllUploading: Story = {
  args: {
    script: {
      id: '9',
      scriptName: 'System Update',
      description: 'Updates all system components',
      deploymentStatus: {
        body: { value: UploadStatus.uploading, date: undefined },
        core: { value: UploadStatus.uploading, date: undefined },
        dome: { value: UploadStatus.uploading, date: undefined },
      },
    },
    locations: defaultLocations,
  },
};

export const Interactive: Story = {
  args: {
    script: {
      id: '10',
      scriptName: 'Interactive Script',
      description: 'Click buttons to see events fired',
      deploymentStatus: {
        body: { value: UploadStatus.uploaded, date: new Date('2025-12-20T10:30:00') },
        core: { value: UploadStatus.notUploaded, date: undefined },
        dome: { value: UploadStatus.uploading, date: undefined },
      },
    },
    locations: defaultLocations,
  },
  render: (args) => ({
    components: { AstrosScriptRow },
    setup() {
      const handleEditScript = (id: string) => {
        console.log('Edit script:', id);
        alert(`Edit script: ${id}`);
      };

      const handleCopyScript = (id: string) => {
        console.log('Copy script:', id);
        alert(`Copy script: ${id}`);
      };

      const handleUploadScript = (id: string) => {
        console.log('Upload script:', id);
        alert(`Upload script: ${id}`);
      };

      const handleRunScript = (id: string) => {
        console.log('Run script:', id);
        alert(`Run script: ${id}`);
      };

      const handleOpenDeleteModal = (id: string, name: string) => {
        console.log('Delete script:', id, name);
        alert(`Delete script: ${name} (${id})`);
      };

      return {
        args,
        handleEditScript,
        handleCopyScript,
        handleUploadScript,
        handleRunScript,
        handleOpenDeleteModal,
      };
    },
    template: `
      <AstrosScriptRow 
        :script="args.script" 
        :locations="args.locations"
        @editScript="handleEditScript"
        @copyScript="handleCopyScript"
        @uploadScript="handleUploadScript"
        @runScript="handleRunScript"
        @openDeleteModal="handleOpenDeleteModal"
      />
    `,
  }),
};
