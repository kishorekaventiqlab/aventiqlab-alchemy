# content/

Learning Experience packages authored locally. Each subdirectory is one package as specified in
[`docs/content-package-spec.md`](../docs/content-package-spec.md).

| Package | Purpose |
|---|---|
| `aws-global-infrastructure/` | The reference experience from the brief (AWS Transformation → Foundation → Introduction to AWS → AWS Global Infrastructure). Real reading, quiz, evaluator, arena definition and SVG assets; the MP4 is a 46 KB placeholder generated with ffmpeg so the end-to-end demonstration is self-contained. |

```bash
npm run alchemy -- validate content/aws-global-infrastructure
npm run alchemy -- publish  content/aws-global-infrastructure --dry-run
```

Real video files should not be committed long-term; keep them in this layout locally and publish from here.
