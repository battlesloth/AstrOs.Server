import type { StorybookConfig } from "@storybook/angular";
import type { StorybookConfigVite } from "@storybook/builder-vite";
import { optimizeDeps, UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const config: StorybookConfig & StorybookConfigVite = {
  core: {
    builder: {
      name: "@storybook/builder-vite",
      options: {
        viteConfigPath: undefined,
      }
    }
  },
  async viteFinal(config: UserConfig) {
    const { mergeConfig } = await import("vite");
    const { default: angular } = await import("@analogjs/vite-plugin-angular");
    return mergeConfig(config, {
    
      optimizeDeps: {
        include: [
          "@storybook/angular",
          "@storybook/angular/dist/client",
          "@angular/compiler",
          "@storybook/blocks",
          "tslib",
        ],
      },
      plugins: [
        tsconfigPaths(),
        angular({ jit: true, tsconfig: "./.storybook/tsconfig.json" }),
      ],
    });
  },
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    //"@storybook/addon-onboarding",
    "@storybook/addon-essentials",
    //"@chromatic-com/storybook",
    "@storybook/addon-interactions",
  ],
  framework: {
    name: "@storybook/angular",
    options: {},
  },
};
export default config;
