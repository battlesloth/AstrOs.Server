import {
  applicationConfig,
  Meta,
  moduleMetadata,
  StoryObj,
} from '@storybook/angular';
import { ScripterComponent } from './scripter.component';

import { ControllerService, ScriptsService } from '@src/services';
import { ActivatedRoute } from '@angular/router';

import { of } from 'rxjs';
import { AstrOsLocationCollection, Script } from 'astros-common';
import { getDefaultMockLocations } from '@src/__mocks__/defaults.mock';
import { importProvidersFrom } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

const meta: Meta<ScripterComponent> = {
  title: 'Pages/Scripter',
  component: ScripterComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [],
    }),
  ],
};

export default meta;

type Story = StoryObj<ScripterComponent>;

export const Default: Story = {
  decorators: [
    applicationConfig({
      providers: [
        importProvidersFrom(BrowserAnimationsModule),
        { provide: ControllerService, useValue: getMockControllerService() },
        { provide: ScriptsService, useValue: getMockScriptsService() },
        { provide: ActivatedRoute, useValue: getMockActivatedRoute('0') }, //ActivatedRouteMock}
      ],
    }),
  ],
  args: {},
};

export const WithScript: Story = {
  decorators: [
    applicationConfig({
      providers: [
        importProvidersFrom(BrowserAnimationsModule),
        { provide: ControllerService, useValue: getMockControllerService() },
        { provide: ScriptsService, useValue: getMockScriptsService() },
        { provide: ActivatedRoute, useValue: getMockActivatedRoute('1') }, //ActivatedRouteMock}
      ],
    }),
  ],
  args: {},
};

function getMockControllerService() {
  return {
    getLoadedLocations: () => {
      return of<AstrOsLocationCollection[]>(getDefaultMockLocations());
    },
  };
}

function getMockActivatedRoute(value: string) {
  return {
    snapshot: {
      paramMap: {
        get: (_: string) => {
          return value;
        },
      },
    },
  };
}

function getMockScriptsService() {
  return {
    getScript: (id: string) => {
      return of<Script>(generateScript(id));
    },
  };
}

function generateScript(id: string): Script {
  const script = new Script(
    id,
    'My Cool Test Script',
    'A Very Cool Test Script',
    new Date(),
  );

  script.scriptChannels = [];

  return script;
}
