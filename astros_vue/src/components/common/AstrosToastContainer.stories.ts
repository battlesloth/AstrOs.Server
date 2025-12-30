import type { Meta, StoryObj } from '@storybook/vue3';
import AstrosToastContainer from './AstrosToastContainer.vue';
import { useToast } from '@/composables/useToast';

const meta = {
  title: 'Components/Common/ToastContainer',
  component: AstrosToastContainer,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosToastContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => ({
    components: { AstrosToastContainer },
    setup() {
      const { success } = useToast();

      const showToast = () => {
        success('This is a default toast message');
      };

      return { showToast };
    },
    template: `
      <div class="p-8">
        <button class="btn btn-primary" @click="showToast">Show Toast</button>
        <AstrosToastContainer />
      </div>
    `,
  }),
};

export const SuccessToast: Story = {
  render: () => ({
    components: { AstrosToastContainer },
    setup() {
      const { success } = useToast();

      const showToast = () => {
        success('Operation completed successfully!');
      };

      return { showToast };
    },
    template: `
      <div class="p-8">
        <button class="btn btn-success" @click="showToast">Show Success Toast</button>
        <AstrosToastContainer />
      </div>
    `,
  }),
};

export const ErrorToast: Story = {
  render: () => ({
    components: { AstrosToastContainer },
    setup() {
      const { error } = useToast();

      const showToast = () => {
        error('An error occurred. Please try again.');
      };

      return { showToast };
    },
    template: `
      <div class="p-8">
        <button class="btn btn-error" @click="showToast">Show Error Toast</button>
        <AstrosToastContainer />
      </div>
    `,
  }),
};

export const WarningToast: Story = {
  render: () => ({
    components: { AstrosToastContainer },
    setup() {
      const { warning } = useToast();

      const showToast = () => {
        warning('This action requires confirmation.');
      };

      return { showToast };
    },
    template: `
      <div class="p-8">
        <button class="btn btn-warning" @click="showToast">Show Warning Toast</button>
        <AstrosToastContainer />
      </div>
    `,
  }),
};

export const InfoToast: Story = {
  render: () => ({
    components: { AstrosToastContainer },
    setup() {
      const { info } = useToast();

      const showToast = () => {
        info('Here is some helpful information.');
      };

      return { showToast };
    },
    template: `
      <div class="p-8">
        <button class="btn btn-info" @click="showToast">Show Info Toast</button>
        <AstrosToastContainer />
      </div>
    `,
  }),
};

export const MultipleToasts: Story = {
  render: () => ({
    components: { AstrosToastContainer },
    setup() {
      const { success, error, warning, info } = useToast();

      const showMultipleToasts = () => {
        success('First toast: Success!');
        setTimeout(() => {
          error('Second toast: Error!');
        }, 500);
        setTimeout(() => {
          warning('Third toast: Warning!');
        }, 1000);
        setTimeout(() => {
          info('Fourth toast: Info!');
        }, 1500);
      };

      return { showMultipleToasts };
    },
    template: `
      <div class="p-8">
        <button class="btn btn-primary" @click="showMultipleToasts">Show Multiple Toasts</button>
        <AstrosToastContainer />
      </div>
    `,
  }),
};

export const LongMessage: Story = {
  render: () => ({
    components: { AstrosToastContainer },
    setup() {
      const { success } = useToast();

      const showToast = () => {
        success(
          'This is a very long toast message that contains a lot of text to demonstrate how the toast handles lengthy content and wrapping behavior.',
        );
      };

      return { showToast };
    },
    template: `
      <div class="p-8">
        <button class="btn btn-primary" @click="showToast">Show Long Message Toast</button>
        <AstrosToastContainer />
      </div>
    `,
  }),
};

export const CustomDuration: Story = {
  render: () => ({
    components: { AstrosToastContainer },
    setup() {
      const { addToast } = useToast();

      const showShortToast = () => {
        addToast('This toast disappears quickly (1s)', 'info', 1000);
      };

      const showLongToast = () => {
        addToast('This toast stays longer (10s)', 'success', 10000);
      };

      return { showShortToast, showLongToast };
    },
    template: `
      <div class="p-8">
        <div class="flex gap-2">
          <button class="btn btn-primary" @click="showShortToast">Short Duration (1s)</button>
          <button class="btn btn-primary" @click="showLongToast">Long Duration (10s)</button>
        </div>
        <AstrosToastContainer />
      </div>
    `,
  }),
};

export const AllTypes: Story = {
  render: () => ({
    components: { AstrosToastContainer },
    setup() {
      const { success, error, warning, info } = useToast();

      return { success, error, warning, info };
    },
    template: `
      <div class="p-8">
        <div class="flex gap-2 flex-wrap">
          <button class="btn btn-success" @click="success('Success message')">Success</button>
          <button class="btn btn-error" @click="error('Error message')">Error</button>
          <button class="btn btn-warning" @click="warning('Warning message')">Warning</button>
          <button class="btn btn-info" @click="info('Info message')">Info</button>
        </div>
        <AstrosToastContainer />
      </div>
    `,
  }),
};
