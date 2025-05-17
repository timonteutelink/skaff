localFlake:
{ lib, config, self, inputs, ... }: {
  perSystem = { pkgs, system, ... }:
    {
      packages.code-templator-cli = pkgs.callPackage ./../../code-templator-cli/package.nix {
        inherit (inputs.bun2nix.lib.${system}) mkBunDerivation;
      };
    };

}

