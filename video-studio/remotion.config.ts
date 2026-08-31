import { Config } from '@remotion/cli/config';

// This project's source imports use TypeScript's ESM convention of writing
// a trailing `.js` extension for a `.ts`/`.tsx` source file (e.g.
// `import { SpecVideo } from '../compositions/SpecVideo.js'`), which
// `moduleResolution: "bundler"` and Node's own loader both understand as
// "resolve the sibling .ts/.tsx file". Remotion's default webpack config
// does NOT rewrite a literal `.js` suffix the same way — it only appends
// extensions to specifiers that have none, so a `.js`-suffixed import fails
// bundling with "Module not found" the moment the Composition graph reaches
// any file using this (very common in this codebase) convention. Confirmed
// live: this broke every real render attempt until this fix.
// resolve.extensionAlias is webpack 5's dedicated fix for exactly this gap.
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
    },
  },
}));

// Full HD, high-bitrate H.264 output tuned for crisp text/UI-mockup content
// (screen-recording-style video, not natural footage) rather than Remotion's
// general-purpose defaults.
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
Config.setCodec('h264');
// Lower CRF = higher quality/larger file. 16 is visually near-lossless for
// flat UI mockups and small text, well below the x264 default (23) that can
// introduce visible blocking/ringing around text edges at 1080p.
Config.setCrf(16);
Config.setPixelFormat('yuv420p');
Config.setScale(1);
