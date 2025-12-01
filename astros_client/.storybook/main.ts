import type { StorybookConfig } from "@storybook/angular";
import type { StorybookConfigVite } from "@storybook/builder-vite";
import { UserConfig } from "vite";
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
          "@storybook/addon-docs/blocks",
          "tslib",

        ],
      },
      build: {
        commonjsOptions: {
          include: ["astros-common","node_modules"],
        },
      },
      plugins: [
        tsconfigPaths(),
        angular({ jit: true, tsconfig: "./.storybook/tsconfig.json" }),
      ],
    });
  },
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/angular",
    options: {},
  },
};
export default config;
