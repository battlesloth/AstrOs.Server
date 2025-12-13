import { type Meta, type StoryObj } from '@storybook/vue3';
import ServoSettings from './ServoSettings.vue';

const meta = {
    title: 'components/modules/shared/ServoSettings',
    component: ServoSettings,
    render: (args: unknown) => ({
        components: { ServoSettings },
        setup() {
            return { args };
        },
        template: '<ServoSettings v-bind="args" />',
    }),
    args: {
        testId: 'test',
        enabled: true,
        name: 'Servo 1',
        invert: false,
        isServo: true,
        minPulse: 500,
        maxPulse: 2500,
        homePosition: 1500
    },
    tags: ['autodocs'],
    argTypes: {
        enabled: {
            control: 'boolean',
            description: 'Whether the servo settings are enabled/visible'
        },
        name: {
            control: 'text',
            description: 'Name of the servo or GPIO channel'
        },
        invert: {
            control: 'boolean',
            description: 'Whether the servo is inverted or GPIO default high'
        },
        isServo: {
            control: 'boolean',
            description: 'True for servo settings, false for GPIO'
        },
        minPulse: {
            control: 'number',
            description: 'Minimum pulse width in microseconds'
        },
        maxPulse: {
            control: 'number',
            description: 'Maximum pulse width in microseconds'
        },
        homePosition: {
            control: 'number',
            description: 'Home position pulse width in microseconds'
        },
        testId: {
            control: 'text',
            description: 'Test ID prefix for testing'
        }
    }
} satisfies Meta<typeof ServoSettings>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default servo configuration with standard settings
 */
export const Default: Story = {
    args: {
        enabled: true,
        name: 'Servo 1',
        invert: false,
        isServo: true,
        minPulse: 500,
        maxPulse: 2500,
        homePosition: 1500,
        testId: 'test'
    },
};

/**
 * Inverted servo with custom pulse settings
 */
export const Inverted: Story = {
    args: {
        enabled: true,
        name: 'Servo 2',
        invert: true,
        isServo: true,
        minPulse: 900,
        maxPulse: 2000,
        homePosition: 1000,
        testId: 'test'
    },
};

/**
 * GPIO channel configuration (no pulse settings)
 */
export const GPIO: Story = {
    args: {
        enabled: true,
        name: 'GPIO 1',
        invert: false,
        isServo: false,
        minPulse: 900,
        maxPulse: 2000,
        homePosition: 1000,
        testId: 'test'
    },
};

/**
 * GPIO channel with default high enabled
 */
export const GPIODefaultHigh: Story = {
    args: {
        enabled: true,
        name: 'GPIO 2',
        invert: true,
        isServo: false,
        minPulse: 900,
        maxPulse: 2000,
        homePosition: 1000,
        testId: 'test'
    },
};

/**
 * Disabled servo settings (not visible)
 */
export const Disabled: Story = {
    args: {
        enabled: false,
        name: 'Servo 3',
        invert: false,
        isServo: true,
        minPulse: 500,
        maxPulse: 2500,
        homePosition: 1500,
        testId: 'test'
    },
};

/**
 * Interactive example showing v-model updates
 */
export const Interactive: Story = {
    render: () => ({
        components: { ServoSettings },
        setup() {
            const settings = {
                enabled: { value: true },
                name: { value: 'Interactive Servo' },
                invert: { value: false },
                isServo: { value: true },
                minPulse: { value: 500 },
                maxPulse: { value: 2500 },
                homePosition: { value: 1500 }
            };
            
            return { settings };
        },
        template: `
            <div class="space-y-4 p-4">
                <div class="bg-base-200 p-4 rounded">
                    <ServoSettings 
                        :enabled="settings.enabled.value"
                        v-model:name="settings.name.value"
                        v-model:invert="settings.invert.value"
                        :is-servo="settings.isServo.value"
                        v-model:min-pulse="settings.minPulse.value"
                        v-model:max-pulse="settings.maxPulse.value"
                        v-model:home-position="settings.homePosition.value"
                        test-id="test"
                    />
                </div>
                <div class="bg-info text-info-content p-4 rounded">
                    <h3 class="font-bold mb-2">Current Values:</h3>
                    <ul class="space-y-1 text-sm">
                        <li>Name: {{ settings.name.value }}</li>
                        <li>Inverted: {{ settings.invert.value }}</li>
                        <li>Min Pulse: {{ settings.minPulse.value }}μS</li>
                        <li>Max Pulse: {{ settings.maxPulse.value }}μS</li>
                        <li>Home: {{ settings.homePosition.value }}μS</li>
                    </ul>
                </div>
            </div>
        `,
    }),
};

/**
 * Multiple servo configurations
 */
export const MultipleServos: Story = {
    render: () => ({
        components: { ServoSettings },
        setup() {
            const servos = [
                { enabled: true, name: 'Pan Servo', invert: false, isServo: true, minPulse: 500, maxPulse: 2500, homePosition: 1500 },
                { enabled: true, name: 'Tilt Servo', invert: true, isServo: true, minPulse: 600, maxPulse: 2400, homePosition: 1200 },
                { enabled: true, name: 'GPIO Enable', invert: false, isServo: false, minPulse: 0, maxPulse: 0, homePosition: 0 },
                { enabled: true, name: 'Gripper Servo', invert: false, isServo: true, minPulse: 800, maxPulse: 2200, homePosition: 1500 },
            ];
            return { servos };
        },
        template: `
            <div class="space-y-4 p-4">
                <div 
                    v-for="(servo, index) in servos" 
                    :key="index"
                    class="border-2 border-base-300 rounded p-4"
                >
                    <ServoSettings 
                        :enabled="servo.enabled"
                        :name="servo.name"
                        :invert="servo.invert"
                        :is-servo="servo.isServo"
                        :min-pulse="servo.minPulse"
                        :max-pulse="servo.maxPulse"
                        :home-position="servo.homePosition"
                        :test-id="\`test-\${index}\`"
                    />
                </div>
            </div>
        `,
    }),
};
