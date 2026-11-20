// Runs after npm ci / npm install. Restores the exec bit node-pty's macOS prebuild loses in packaging.
import { ensurePtyHelper } from "../bridge/platform.mjs";

for (const helper of ensurePtyHelper()) console.log(`kino panels: made ${helper} executable`);
