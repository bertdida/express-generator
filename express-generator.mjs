#!/usr/bin/env zx

let app = argv._[0];
app = app === "." ? path.basename(process.cwd()) : app;

if (!app) {
  console.log(chalk.red("App name is required"));
  process.exit(1);
}

let formatterIsSetup = false;
const funcs = [
  runExpressGenerator,
  setupSourceFolder,
  installDependencies,
  generateTSConfig,
  setupAppFiles,
  setupPackageJSONScripts,
  generateVSCodeSettings,
  generateNodemonSettings,

  setupFormatter,
  setupHusky,
  runFormatter,

  runInitialCommit,
];
for (const func of funcs) {
  await func();
  console.log("\n");
}

function runExpressGenerator() {
  console.log(chalk.blue("Generating express app..."));
  return $`npx --yes express-generator ${app} --no-view --git &> /dev/null`;
}

async function setupSourceFolder() {
  console.log(chalk.blue("Setting up src folder..."));

  // This app will not have a view. So, we don't need the public folder.
  await $`rm -rf ${app}/public`;

  await $`mkdir -p ${app}/src/routes`;
  await $`mv ${app}/routes/index.js ${app}/src/routes/index.ts`;
  await $`mv ${app}/app.js ${app}/src/app.ts`;
  return $`rm -rf ${app}/routes`;
}

async function installDependencies() {
  console.log(chalk.blue("Installing dependencies..."));

  const dependencies = [
    "typescript",
    "@types/express",
    "@types/node",
    "@types/cookie-parser",
    "@types/morgan",
    "nodemon",
    "tscpaths",
  ];

  return $`cd ${app} && npm i -D ${dependencies} &> /dev/null`;
}

function generateTSConfig() {
  console.log(chalk.blue("Generating tsconfig.json..."));

  const tsconfig = {
    compilerOptions: {
      target: "ES2017",
      module: "commonjs",
      lib: ["ES2017", "esnext.asynciterable"],
      sourceMap: true,
      moduleResolution: "node",
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      strict: true,
      skipLibCheck: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      outDir: "./dist",
      rootDir: "./src",
      baseUrl: "./src",
      paths: {
        "@/*": ["*"],
      },
    },
    include: ["./src/**/*"],
    exclude: ["node_modules"],
  };

  return fs.writeFile(`${app}/tsconfig.json`, JSON.stringify(tsconfig), "utf8");
}

async function setupAppFiles() {
  console.log(chalk.blue("Setting up app files..."));

  await setupAppFile();
  await setupIndexRoute();
  return setupWWW();
}

function setupAppFile() {
  const content = `import express from "express";
  import path from "path";
  import cookieParser from "cookie-parser";
  import logger from "morgan";

  import indexRouter from "@/routes/index";

  const app = express();

  app.use(logger("dev"));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, "public")));

  app.use("/", indexRouter);

  export default app;
  `;

  return fs.writeFile(`${app}/src/app.ts`, content);
}

function setupIndexRoute() {
  const content = `
  import express from "express";

  const router = express.Router();

  router.get("/", function (_, response) {
    response.json({ data: "👋" });
  });

  export default router;
  `;

  return fs.writeFile(`${app}/src/routes/index.ts`, content);
}

async function setupWWW() {
  await $`sed -i 's|..\/app|..\/dist\/app|g' ${app}/bin/www`;
  return $`sed -i 's|var app|var { default\: app }|g' ${app}/bin/www`;
}

function setupPackageJSONScripts() {
  console.log(chalk.blue("Setting up package.json scripts..."));

  const content = JSON.parse(fs.readFileSync(`${app}/package.json`, "utf8"));
  content.scripts = {
    start: "npm run build && node ./bin/www",
    build:
      "tsc -p tsconfig.json && tscpaths -p tsconfig.json -s ./src -o ./dist",
    dev: 'nodemon --legacy-watch "npm run build && tsc-node ./bin/www"',
  };

  return fs.writeFile(`${app}/package.json`, JSON.stringify(content), "utf8");
}

async function generateVSCodeSettings() {
  console.log(chalk.blue("Generating VSCode settings..."));

  const vscodeSettings = {
    "editor.formatOnSave": true,
    "eslint.validate": ["typescript"],
    "editor.codeActionsOnSave": {
      "source.fixAll": true,
    },
  };

  await $`cd ${app} && mkdir -p .vscode`;
  return fs.writeFile(
    `${app}/.vscode/settings.json`,
    JSON.stringify(vscodeSettings),
    "utf8"
  );
}

function generateNodemonSettings() {
  console.log(chalk.blue("Generating nodemon settings..."));

  const nodemonSettings = {
    watch: "./src/**/*.ts",
    ext: "ts",
    execMap: {
      ts: "ts-node",
    },
    env: {
      NODE_ENV: "development",
    },
  };
  return fs.writeFile(
    `${app}/nodemon.json`,
    JSON.stringify(nodemonSettings, null, 2),
    "utf8"
  );
}

async function setupHusky() {
  console.log(chalk.blue("Setting up husky..."));

  await $`cd ${app} && git init`;

  await $`mkdir -p ${app}/.husky`;
  await $`cd ${app} && npx --yes husky-init &> /dev/null`;
  await $`cd ${app} && npm install &> /dev/null`;
  await $`cd ${app} && npx --yes husky set .husky/pre-commit 'npx lint-staged' &> /dev/null`;

  const content = JSON.parse(fs.readFileSync(`${app}/package.json`, "utf8"));
  content["lint-staged"] = {
    ".": "prettier --config .prettierrc.json",
    "src/**/*.ts": "eslint --config .eslintrc.json",
  };

  return fs.writeFile(`${app}/package.json`, JSON.stringify(content), "utf8");
}

async function setupFormatter() {
  console.log(chalk.blue("Setting up eslint and prettier..."));

  // https://medium.com/weekly-webtips/how-to-sort-imports-like-a-pro-in-typescript-4ee8afd7258a

  const dependencies = [
    "eslint",
    "@typescript-eslint/parser",
    "@typescript-eslint/eslint-plugin",
    "prettier",
    "eslint-plugin-import",
    "eslint-import-resolver-typescript",
  ];

  await $`cd ${app} && npm install -D ${dependencies} &> /dev/null`;
  const eslintConfig = {
    parser: "@typescript-eslint/parser",
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    env: {
      node: true,
    },
    plugins: ["@typescript-eslint", "import"],
    extends: [
      "eslint:recommended",
      "plugin:@typescript-eslint/recommended",
      "plugin:import/recommended",
      "plugin:import/typescript",
    ],
    rules: {
      "sort-imports": [
        "error",
        {
          ignoreCase: false,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ["none", "all", "multiple", "single"],
          allowSeparatedGroups: true,
        },
      ],
      "import/no-unresolved": "error",
      "import/no-named-as-default-member": "off",
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["sibling", "parent"],
            "index",
            "unknown",
          ],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: "./tsconfig.json",
        },
      },
    },
  };
  fs.writeFile(`${app}/.eslintrc.json`, JSON.stringify(eslintConfig), "utf8");

  const prettierSettings = {
    tabWidth: 2,
    singleQuote: true,
    printWidth: 120,
  };
  fs.writeFile(
    `${app}/.prettierrc.json`,
    JSON.stringify(prettierSettings, null, 2),
    "utf8"
  );

  formatterIsSetup = true;
}

async function runFormatter() {
  if (formatterIsSetup) {
    console.log(chalk.blue("Running formatter..."));

    await $`cd ${app} && npx --yes eslint --config .eslintrc.json 'src/**/*.ts' --fix &> /dev/null`;
    return $`cd ${app} && npx --yes prettier --config .prettierrc.json . --write &> /dev/null`;
  }
}

async function runInitialCommit() {
  console.log(chalk.blue("Running initial commit..."));

  if (fs.existsSync(`${app}/.git`)) {
    await $`cd ${app} && git init`;
  }

  await $`cd ${app} && npm i &> /dev/null`; // required for husky to work
  await $`cd ${app} && git add .`;
  return $`cd ${app} && git commit -m "chore: initial commit"`;
}
