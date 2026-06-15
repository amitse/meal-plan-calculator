import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  parameters: {
    controls: {
      expanded: true,
    },
    layout: "fullscreen",
    options: {
      storySort: {
        order: ["App"],
      },
    },
  },
};

export default preview;
