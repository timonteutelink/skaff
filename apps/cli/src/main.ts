import { Command } from "commander";
import { addGlobalFormatOption } from "./cli-utils";
import process from "node:process";
import { registerTemplateCommand } from "./commands/template";
import { registerConfigCommand } from "./commands/config";
import registerProjectCommand from "./commands/project";
import registerInstantiationCommand from "./commands/instantiate";
import registerGitCommand from "./commands/git";

const program = new Command();

program
  .name("code-templator")
  .description("CLI to manage projects and templates")
  .version("1.0.0");

addGlobalFormatOption(program);

registerConfigCommand(program);
registerTemplateCommand(program);
registerProjectCommand(program);
registerGitCommand(program);
registerInstantiationCommand(program);

program.parseAsync(process.argv);
