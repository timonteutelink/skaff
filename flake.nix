{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    devenv.url = "github:cachix/devenv";
    flake-parts.url = "github:hercules-ci/flake-parts";
    nix-deno.url = "github:identinet/nix-deno";

    timon-modules = {
      url = "git+ssh://git@github.com/timonteutelink/nix-modules";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { timon-modules
    , flake-parts
    , ...
    } @ inputs:
    flake-parts.lib.mkFlake { inherit inputs; } (
      { withSystem, moduleWithSystem, flake-parts-lib, ... }:
      let
        inherit (flake-parts-lib) importApply mkSubmoduleOptions;

        importApplyMod = file: importApply file { inherit withSystem moduleWithSystem importApply mkSubmoduleOptions; };
        modFiles = timon-modules.lib.import-files { path = ./nix/flake; recursive = true; };
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
