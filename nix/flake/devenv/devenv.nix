localFlake:
{ lib, config, self, inputs, ... }: {
  imports = [
    inputs.devenv.flakeModule
  ];

  perSystem = { pkgs, system, ... }: {
    devenv.shells.default =
      {
        name = "Simple typescript pnpm project";
        infoSections = { biepboop = [ ''Simple typescript pnpm project'' ]; };
        env = {
          NIX_LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [ pkgs.stdenv.cc.cc ];

          NIX_LD = builtins.readFile "${pkgs.stdenv.cc}/nix-support/dynamic-linker";

          LD_LIBRARY_PATH = "${pkgs.stdenv.cc.cc.lib}/lib";

          TEMPLATE_DIR_PATHS = "~/projects/timon/code-templator/assets/example-templates-dir/:~/projects/btc/mcp-templates/:~/projects/timon/timon-templates/";
          PROJECT_SEARCH_PATHS = "~/projects/btc/:~/projects/timon/gen-projects/";

          # ESBUILD_BINARY_PATH="/home/tteutelink/projects/timon/code-templator/node_modules/.bin/esbuild";
          GENERATE_DIFF_SCRIPT_PATH ="~/projects/timon/code-templator/scripts/generate-diff-patch.sh";
        };

        packages = with pkgs; [
        ];

        languages = {
          javascript = {
            enable = true;
            pnpm.enable = true;
            npm.enable = true;
          };
          typescript.enable = true;
          deno.enable = true;
        };

        pre-commit = {
          settings = {
            # eslint = {
            #   fix = true;#???
            #   extensions = "\.js$";#???
            # };
          };
          hooks = {
            nixpkgs-fmt.enable = true;
            # eslint.enable = true;
            # prettier.enable = true;
            # eclint.enable = true;
            # editorconfig-checker.enable = true;
          };
        };

        enterShell = ''
          echo 'Biep Boop'
        '';

        scripts =
          {
            clean-cache.exec = ''
              rm /tmp/code-templator-cache/*
            '';
          };
      };
  };
}
