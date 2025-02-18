import { 
    applicationConfig,
    Meta,
    moduleMetadata,
    StoryObj
 } from "@storybook/angular";
import { ScripterComponent } from "./scripter.component";

import { ControllerService, ScriptsService } from "@src/services";
import { ActivatedRoute } from "@angular/router";

import { 
    ActivatedRouteMock,
    ControllerServiceMock,
    ScriptsServiceMock
 } from "@src/__mocks__/";


const meta: Meta<ScripterComponent> = {
    title: "Pages/Scripter",
    component: ScripterComponent,
    tags: ["autodocs"],
    decorators: [
        moduleMetadata({
            imports: [
            
            ],
        }),
        applicationConfig({
            providers: [
                {provide: ControllerService, useClass: ControllerServiceMock},
                {provide: ScriptsService, useClass: ScriptsServiceMock},
                {provide: ActivatedRoute, useClass: ActivatedRouteMock}
            ],
        }),
    ],
};

export default meta;

type Story = StoryObj<ScripterComponent>;

export const Default: Story = {
    args: {
        
    },
};