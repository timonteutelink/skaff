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
          TEMPLATE_PATHS = "~/projects/timon/code-templator/assets/example-templates-dir/rust/,~/projects/btc/mcp-templates/deno/";
          PROJECT_SEARCH_PATHS = "~/projects/btc/";
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
            dev.exec = ''
            '';
          };
      };
  };
}
