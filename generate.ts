#!/usr/bin/env ts-node-script

import { load } from "js-yaml";
import { readdirSync, readFileSync, outputFileSync, existsSync, statSync } from "fs-extra";
import { compile, registerHelper } from "handlebars";
import { join, basename } from "path";
import shelljs from "shelljs";
import { z } from "zod";

const TypeArgs = z.union([z.string(), z.array(z.string()), z.record(z.string())]);
const RtagConfig = z
  .object({
    types: z.record(TypeArgs),
    methods: z.record(z.nullable(z.record(z.string()))),
    auth: z
      .object({
        anonymous: z.optional(z.object({ separator: z.string() }).strict()),
        google: z.optional(z.object({ clientId: z.string() }).strict()),
      })
      .strict(),
    userState: z.string(),
    initialize: z.string(),
    error: z.string(),
    tick: z.optional(z.boolean()),
  })
  .strict();

type Arg =
  | ObjectArg
  | ArrayArg
  | OptionalArg
  | DisplayPluginArg
  | EnumArg
  | UnionArg
  | StringArg
  | NumberArg
  | BooleanArg;
interface ObjectArg {
  type: "object";
  alias: boolean;
  typeString?: string;
  properties: Record<string, Arg>;
}
interface UnionArg {
  type: "union";
  alias: boolean;
  typeString?: string;
  options: Record<string, Arg>;
}
interface ArrayArg {
  type: "array";
  alias: boolean;
  typeString?: string;
  items: Arg;
}
interface OptionalArg {
  type: "optional";
  alias: boolean;
  typeString?: string;
  item: Arg;
}
interface DisplayPluginArg {
  type: "plugin";
  alias: boolean;
  typeString?: string;
  item: Arg;
}
interface EnumArg {
  type: "enum";
  alias: boolean;
  typeString?: string;
  options: { label: string; value: number }[];
}
interface StringArg {
  type: "string";
  alias: boolean;
  typeString?: string;
}
interface NumberArg {
  type: "number";
  alias: boolean;
  typeString?: string;
}
interface BooleanArg {
  type: "boolean";
  alias: boolean;
  typeString?: string;
}

registerHelper("eq", (a, b) => a === b);
registerHelper("ne", (a, b) => a !== b);
registerHelper("stringify", JSON.stringify);
registerHelper("isArray", Array.isArray);
registerHelper("isObject", (x) => typeof x === "object");
registerHelper("capitalize", capitalize);
registerHelper("makeRequestName", (x) => "I" + capitalize(x) + "Request");
registerHelper("makePluginName", (x) => x.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase() + "-plugin");

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getProjectRoot(cwd: string): string {
  if (existsSync(join(cwd, "rtag.yml"))) {
    return cwd;
  }
  const parentDir = join(cwd, "..");
  if (parentDir === cwd) {
    throw new Error("Doesn't appear to be inside an rtag project");
  }
  return getProjectRoot(parentDir);
}

function getCommand(argv: string[]) {
  return argv.length <= 2 ? "generate" : argv[2];
}

function npmInstall(dir: string) {
  if (existsSync(dir)) {
    console.log(`Installing dependencies in ${dir}`);
    if (existsSync(join(dir, "yarn.lock"))) {
      shelljs.exec(`yarn install --cwd ${dir}`);
    } else {
      shelljs.cd(dir);
      shelljs.exec("npm install");
    }
  }
}

function generate() {
  const doc = RtagConfig.parse(load(readFileSync(join(rootDir, "rtag.yml"), "utf8")));
  const plugins = existsSync(join(clientDir, "plugins"))
    ? readdirSync(join(clientDir, "plugins")).map((p) => p.replace(/\..*$/, ""))
    : [];

  function getArgsInfo(args: z.infer<typeof TypeArgs>, required: boolean, alias: boolean, typeString?: string): Arg {
    if (Array.isArray(args)) {
      if (args.every((arg) => arg in doc.types)) {
        return {
          type: "union",
          typeString,
          alias,
          options: Object.fromEntries(args.map((type) => [type, getArgsInfo(type, true, false)])),
        };
      }
      return {
        type: "enum",
        typeString,
        alias,
        options: args.map((label, value) => ({ label, value })),
      };
    } else if (typeof args === "object") {
      return {
        type: "object",
        typeString,
        alias,
        properties: Object.fromEntries(
          Object.entries(args).map(([name, type]) => [
            name.replace(/[\W]+/g, ""),
            getArgsInfo(type, !name.endsWith("?"), false),
          ])
        ),
      };
    } else {
      if (!required) {
        return {
          type: "optional",
          typeString: args + "?",
          alias,
          item: getArgsInfo(args, true, false),
        };
      } else if (args.endsWith("[]")) {
        return {
          type: "array",
          typeString: typeString ?? args,
          alias,
          items: getArgsInfo(args.substring(0, args.length - 2), true, false),
        };
      } else if (args in doc.types) {
        const argsInfo = getArgsInfo(doc.types[args], required, true, args);
        return plugins.includes(args) ? { type: "plugin", typeString: args, alias, item: argsInfo } : argsInfo;
      } else if (args === "string" || args === "number" || args === "boolean") {
        const argsInfo: Arg = { type: args, typeString: typeString ?? args, alias };
        return plugins.includes(args) ? { type: "plugin", typeString: args, alias, item: argsInfo } : argsInfo;
      } else {
        throw new Error("Invalid args: " + args);
      }
    }
  }

  if (!Object.keys(doc.types).includes(doc.userState)) {
    throw new Error("Invalid userState");
  }
  if (!Object.keys(doc.methods).includes(doc.initialize)) {
    throw new Error("Invalid initialize");
  }
  const enrichedDoc = {
    ...doc,
    types: Object.fromEntries(
      Object.entries(doc.types).map(([key, val]) => {
        return [key, getArgsInfo(val, true, false)];
      })
    ),
    methods: Object.fromEntries(
      Object.entries(doc.methods).map(([key, val]) => {
        return [key, getArgsInfo(val === null ? {} : val, true, false)];
      })
    ),
    error: getArgsInfo(doc.error, true, false),
  };
  const appEntryPath = existsSync(join(clientDir, "index.html"))
    ? "../../client/index.html"
    : "../../client/.rtag/index.html";
  const appName = basename(rootDir);

  function codegen(inDir: string, outDir: string) {
    readdirSync(inDir).forEach((f) => {
      const file = join(inDir, f);
      if (statSync(file).isDirectory()) {
        codegen(file, join(outDir, f));
      } else {
        const template = compile(readFileSync(file, "utf8"));
        outputFileSync(join(outDir, f.split(".hbs")[0]), template({ ...enrichedDoc, plugins, appEntryPath, appName }));
      }
    });
  }
  const rootDirFiles = readdirSync(rootDir).filter((file) => !file.startsWith("."));
  if (rootDirFiles.length === 1 && rootDirFiles[0] === "rtag.yml") {
    codegen(join(__dirname, "templates/lang/ts"), rootDir);
  }
  codegen(join(__dirname, "templates/base"), rootDir);
}

const rootDir = getProjectRoot(process.cwd());
const clientDir = join(rootDir, "client");
const serverDir = join(rootDir, "server");

console.log(`Project root: ${rootDir}`);
const command = getCommand(process.argv);
if (command === "generate") {
  generate();
} else if (command === "install") {
  npmInstall(clientDir);
  npmInstall(join(clientDir, ".rtag"));
  npmInstall(serverDir);
  npmInstall(join(serverDir, ".rtag"));
} else if (command === "start") {
  shelljs.cd(serverDir);
  shelljs.exec("node --loader ts-node/esm --experimental-specifier-resolution=node .rtag/proxy.ts");
} else {
  console.error(`Unknown command: ${command}`);
}
