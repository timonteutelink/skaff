localFlake:
{ lib, config, self, inputs, ... }: {
  perSystem = { pkgs, system, ... }:
    {
      packages.skaff-cli = pkgs.callPackage ./../../skaff-package/cli-package.nix {
        inherit (inputs.bun2nix.lib.${system}) mkBunDerivation;
      };
    };

}

