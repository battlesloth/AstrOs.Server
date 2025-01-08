import type { Preview } from "@storybook/angular";
import { setCompodocJson } from "@storybook/addon-docs/angular";
import docJson from "../documentation.json";
import { MatExpansionModule } from "@angular/material/expansion";
setCompodocJson(docJson);

import '../src/styles.scss';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    imports: [MatExpansionModule],
  },
};

export default preview;
