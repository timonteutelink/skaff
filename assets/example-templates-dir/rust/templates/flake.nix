{
  description = "Timon Software Templator";

  inputs = {
    dream2nix.url = "github:nix-community/dream2nix";
    nixpkgs.follows = "dream2nix/nixpkgs";
    flake-parts.url = "github:hercules-ci/flake-parts";
    devenv.url = "github:cachix/devenv";

    timon-modules = {
      url = "git+file:///home/tteutelink/projects/timon/nix-modules";
      # url = "git+ssh://git@github.com/timonteutelink/nix-modules";
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
        inherit (flake-parts-lib) importApply;

        importApplyMod = file: importApply file { inherit withSystem moduleWithSystem importApply; };
        modFiles = timon-modules.lib.import-files { path = ./nix/flake; recursive = true; };
      in
      {
        imports = map importApplyMod modFiles ++ [ inputs.devenv.flakeModule ];

        systems = [
          "aarch64-darwin"
          "aarch64-linux"
          "x86_64-darwin"
          "x86_64-linux"
        ];
      }
    );
}
