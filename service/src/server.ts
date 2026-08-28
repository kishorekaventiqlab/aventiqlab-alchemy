/**
 * Local entrypoint. `npm run dev` (tsx watch) or `npm start`.
 * Under Lambda, use lambda.ts instead — this file is never imported there.
 */
import { buildApp } from "./app.js";

const app = await buildApp();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err, "failed to start");
  process.exit(1);
}
