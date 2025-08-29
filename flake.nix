{
  # "packages/template-types-lib",
  # "apps/web",
  # "packages/notebook",
  # "packages/code-templator-lib",
  # "packages/tailwind-config"
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    devenv.url = "github:cachix/devenv";
    flake-parts.url = "github:hercules-ci/flake-parts";
    bun2nix.url = "github:baileyluTCD/bun2nix";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";

    nix-utils = {
      url = "git+ssh://git@github.com/timonteutelink/nix-utils";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { nix-utils
    , flake-parts
    , ...
    } @ inputs:
    flake-parts.lib.mkFlake { inherit inputs; } (
      { withSystem, moduleWithSystem, flake-parts-lib, ... }:
      let
        inherit (flake-parts-lib) importApply mkSubmoduleOptions;

        importApplyMod = file: importApply file { inherit withSystem moduleWithSystem importApply mkSubmoduleOptions; };
        modFiles = nix-utils.lib.import-files { path = ./nix/flake; recursive = true; };
      in
      {
        imports = map importApplyMod modFiles;

        systems = [
          "aarch64-darwin"
          "aarch64-linux"
          "x86_64-darwin"
          "x86_64-linux"
        ];
      }
    );


}
