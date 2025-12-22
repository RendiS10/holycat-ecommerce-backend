#!/usr/bin/env node
import Mocha from "mocha";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mocha = new Mocha({
  timeout: 10000,
  exit: true,
});

mocha.addFile(path.join(__dirname, "test/admin.test.js"));

mocha.run((failures) => {
  process.exitCode = failures ? 1 : 0;
});
