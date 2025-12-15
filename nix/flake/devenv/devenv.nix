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

          TEMPLATE_DIR_PATHS = "";
          PROJECT_SEARCH_PATHS = "~/projects/templated";

          NPM_PATH = "${pkgs.bun}/bin/bun";

          NODE_OPTIONS = "";
          DENO_UNSTABLE_SLOPPY_IMPORTS = "1";
        };

        packages = with pkgs; [
          jupyter
          inputs.bun2nix.packages.${system}.default
          jq
          formatjson5
        ];

        languages = {
          javascript = {
            enable = true;
            bun.enable = true;
            npm.enable = true;
          };
          typescript.enable = true;
          deno.enable = true;
        };

        git-hooks = {
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
              rm -r /tmp/skaff-cache/*
            '';
          };
      };
  };
}
