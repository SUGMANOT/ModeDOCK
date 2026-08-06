import { ModeDockCore } from "@modedock/core";

const core = await ModeDockCore.open({ dataDir: "./launcher-state" });
console.log(await core.profiles.list());
