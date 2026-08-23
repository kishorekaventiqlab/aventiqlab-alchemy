import { Config } from '@remotion/cli/config';

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
