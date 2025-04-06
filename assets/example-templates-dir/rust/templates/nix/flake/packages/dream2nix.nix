# create a rust cli using this projects structure(rust). This repo will be the entire templating engine including all the templates.
# It can start entire projects from scratch, or add nix to new projects or other features to existing projects. For ex can also check the .gitignore to add some values for direnv and devenv.
localFlake:
{ lib, config, self, inputs, ... }: {
  perSystem = { pkgs, system, ... }: {
    packages.default = inputs.dream2nix.lib.evalModules {
      packageSets.nixpkgs = pkgs;
      modules = [
        ./../../dream2nix
        {
          paths.projectRoot = ./../../..;
          paths.projectRootFile = "flake.nix";
          paths.package = ./../../..;
        }
      ];
    };
  };
}
